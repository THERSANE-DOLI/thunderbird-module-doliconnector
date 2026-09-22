import * as dolLib from '../global.lib.js';

import {jsonToTable, searchPhonesInString} from "../global.lib.js";

    const LOG = (...args) => console.log('[DoliConnector popup]', ...args);

    const POPUP_TABS = ['info', 'documents', 'link', 'agenda'];

    // Workaround for a Linux/GTK bug: when this UI is shown in a detached "popup" type
    // window (see browser.windows.create in background.js), pressing Ctrl or Alt on its
    // own is interpreted by the window manager as a request to close the window, which
    // also interrupts Ctrl+C / Ctrl+V while typing. Ctrl+letter / Alt+letter combos fire
    // their own keydown event for the letter and are not affected by this.
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Control' || event.key === 'Alt') {
            event.preventDefault();
        }
    });

    async function getEmailAccountFromBackground(messageId) {
        const response = await browser.runtime.sendMessage({
            type: "getEmailAccount",
            messageId
        });

        return response.email;
    }

    // first need to translate page before add dom events
    dolLib.localizeHtmlPage();

    // The user clicked our button, get the active tab in the current window using
    // the tabs API.
    let tabs = await messenger.tabs.query({ active: true, currentWindow: true });

    // Get the message currently displayed in the active tab, using the
    // messageDisplay API. Note: This needs the messagesRead permission.
    // The returned message is a MessageHeader object with the most relevant
    // information.

    let message = await messenger.messageDisplay.getDisplayedMessage(tabs[0].id);

    if(!message){
        // dans le cas d'une ouverture depuis le mail il faut récupérer les infos de la tab source d'ouverture
        let {dolibarrMsg} = await browser.storage.local.get("dolibarrMsg");
        message = dolibarrMsg;
    }

    let messageBody = message ? await dolLib.getMessageBody(message.id) : '';


    // Request the full message to access its full set of headers.
    // let full = await messenger.messages.getFull(message.id);
    // document.getElementById("received").textContent = full.headers.received[0];

    let checkConfig = await dolLib.checkConfig();
    // Only worth testing credentials/connectivity once the config itself looks complete -
    // distinguishes "invalid API key / HTTP auth" and "server unreachable" from the
    // "module not configured" case, which otherwise all looked the same to the user.
    let connectionStatus = checkConfig ? await dolLib.checkDolibarrConnection() : null;

    // Extract email from author
    let authorEmail = message ? dolLib.extractEmailAddressFromString(message.author)[0] : '';

    // Identity of the account this mail was received on, and its Message-Id : sent along when
    // creating a devis/commande/ticket from this popup's "Actions" dropdown (see setSocInfos()'s
    // newPropalUrl/newOrderUrl/newTicketUrl), so the crmclientconnector module's
    // PROPAL_CREATE/ORDER_CREATE/TICKET_CREATE trigger can auto-link the newly created object
    // back to this mail. Same values/convention already used for notes (see initNotesForMessage()
    // below : accountEmail via getEmailAccountFromBackground(), msgId via
    // message.headerMessageId).
    let ownerAccountEmail = message ? await getEmailAccountFromBackground(message.id) : null;
    let ownerMsgId = message ? message.headerMessageId : null;

    // .ics calendar invite attachment, if any - drives the "Agenda" tab (see initAgendaTab()).
    let icsEvent = message ? await dolLib.detectIcsEventFromMessage(message.id) : null;
    LOG('detected ics event', icsEvent);

    // Quotation form headers (X-Quotation-Mail / X-Quotation-Data) : only trusted when the
    // sender is in the configured trusted senders list, to avoid a forged header hijacking
    // the thirdparty search.
    let quotation = message ? await dolLib.getQuotationHeaders(message.id) : null;
    let quotationTrustedSenders = await dolLib.getQuotationTrustedSenders();
    let quotationActive = !!(quotation && quotation.email && dolLib.isQuotationTrustedSender(authorEmail, quotationTrustedSenders));
    LOG('quotation headers', quotation, 'authorEmail', authorEmail, 'trustedSenders', quotationTrustedSenders, 'quotationActive', quotationActive);

    // Email to use to search/create the thirdparty : the quotation requester's email when
    // the quotation headers are trusted, the mail sender's email otherwise.
    let searchEmail = quotationActive ? quotation.email : authorEmail;

    // Dolibarr trackid (X-Dolibarr-TRACKID, Feedback-ID, or embedded in
    // References/In-Reply-To on a reply) : tells us exactly which Dolibarr
    // record this email is about, so it takes priority over both the
    // quotation headers and the sender's email for finding the thirdparty.
    let detectedRef = message ? await dolLib.getDolibarrTrackIdFromMessage(message.id) : null;
    let detectedRefMeta = detectedRef ? dolLib.getDolibarrObjectTypeMeta(detectedRef.type) : null;
    if(!detectedRefMeta){
        if(detectedRef){
            LOG('trackid found but type is unknown/unmapped, ignoring', detectedRef);
        }
        detectedRef = null;
    }
    LOG('detected trackid', detectedRef, detectedRefMeta);
    const DETECTED_REF_TABLE_BACKED_TYPES = ['ord', 'pro', 'inv', 'sord'];
    let detectedRefTableResolved = false;
    let detectedRefShouldShowBlock = false;
    let detectedRefObjectData = null;
    let detectedRefObjectFetchDone = false;
    // Fed into jsonToTable()'s highlight search once the referenced object's
    // ref is known, so its row lights up the same way a ref mentioned in the
    // message body/subject already does.
    let detectedRefSearchText = '';
    // Populated once resolveSocFromId() (called when the trackid's referenced
    // object carries a thirdparty id) fetches that thirdparty's name, so the
    // detected-ref card can show it alongside the document reference.
    let detectedRefThirdpartyName = null;

    //Filter on propal objects status
    let propalDisplayStatus = await dolLib.filterPropalStatus();

    let confDolibarUrl = await dolLib.getDolibarrUrl();

    // Gates every feature built on the crmclientconnector module's REST endpoints (shared
    // notes, the "Lier" tab, the detected-ref card's Link button, linked documents on the Info
    // tab, ref auto-detection) - see isCrmConnectorEnabled()'s doc comment.
    let crmConnectorEnabled = await dolLib.isCrmConnectorEnabled();

    // "Lier" tab state (see its own section below for the functions using these) - declared
    // here rather than down there because updateAgendaEventLinkState() reads
    // lastLinkedDocumentsList synchronously from initAgendaTab(), called further down in this
    // same top-level script before execution would otherwise reach their old declaration site.
    let linkTabInitialized = false;
    // type+':'+id keys of documents already linked to this mail, so the search results can hide
    // them (linking the same document twice hits Dolibarr's unique index and returns a 500), and
    // so the detected-ref card (see maybeRenderDetectedRefBlock()) knows whether to offer a "Link"
    // button for the document it detected via the mail headers.
    let linkedDocumentKeys = new Set();
    // Becomes true once the first loadLinkedDocuments() response comes back (success or failure),
    // so the detected-ref card can tell "not linked yet" apart from "don't know yet" and avoid
    // flashing a Link button it would immediately have to remove.
    let linkedDocumentsFetched = false;
    // Raw list from the last loadLinkedDocuments() response, kept around so the Info tab's own
    // linked-documents section (see updateInfoTabLinkedDocumentsSection()) can render its own set
    // of cards independently from the ones in the "Lier" tab's #link-linked-list.
    let lastLinkedDocumentsList = [];

    if(!checkConfig){
        LOG('module not configured, showing check-module-config template');
        displayTpl("check-module-config");
    }else if(connectionStatus.status === 'auth'){
        LOG('invalid credentials, showing check-module-auth template', connectionStatus.message);
        displayTpl("check-module-auth");
    }else if(connectionStatus.status === 'connection'){
        LOG('cannot reach Dolibarr server, showing check-module-connection template', connectionStatus.message);
        displayTpl("check-module-connection");
    }else{
        displayTpl("main-popup");


        initNotesForMessage();
        document.querySelectorAll('textarea.autosize').forEach(textarea => dolLib.textareaAutosize(textarea))
        initPopupTabs();
        initDocumentsTabBadge();
        initInfoTabLinkCta();
        initInfoTabAgendaCta();
        initAgendaTab();

        if(!crmConnectorEnabled){
            LOG('crmClientConnector module disabled by config, showing discreet notice instead of notes/link features');
            document.getElementById('crm-connector-disabled-notice-info')?.classList.remove('hidden-field');
            document.getElementById('crm-connector-disabled-notice-link')?.classList.remove('hidden-field');
            document.getElementById('link-tab-content')?.classList.add('hidden-field');
        }

        if(crmConnectorEnabled && ownerAccountEmail && ownerMsgId){
            // Loaded eagerly (normally only fetched on-demand when the user opens the "Lier"
            // tab, see initLinkTab()) so the Info tab's own linked-documents section (see
            // updateInfoTabLinkedDocumentsSection()) and, when a trackid was detected, the
            // detected-ref card's Link button (see buildDetectedRefCard()) both have the data
            // they need without requiring the user to open the Link tab first.
            LOG('eagerly loading linked documents for the Info tab / detected-ref card');
            loadLinkedDocuments();
        }

        if(detectedRef){
            LOG('trackid detected, fetching referenced object', detectedRefMeta.api + '/' + detectedRef.id);
            dolLib.callDolibarrApi(detectedRefMeta.api + '/' + detectedRef.id, {}, 'GET', {}, (objData)=>{
                LOG('referenced object fetched OK', objData);
                detectedRefObjectData = objData;
                detectedRefObjectFetchDone = true;
                if(objData && objData.ref){
                    detectedRefSearchText += ' ' + objData.ref;
                }
                maybeRenderDetectedRefBlock();

                let socId = parseInt(objData.socid || objData.fk_soc || 0);
                if(socId > 0){
                    LOG('thirdparty id found on referenced object, resolving company from it', socId);
                    resolveSocFromId(socId);
                }else{
                    LOG('referenced object has no thirdparty id, falling back to email-based search');
                    searchCompanyByEmail();
                }
            },(errorMsg)=>{
                LOG('failed to fetch referenced object, falling back to email-based search', errorMsg);
                detectedRefObjectFetchDone = true;
                maybeRenderDetectedRefBlock();
                searchCompanyByEmail();
            });

            if(!DETECTED_REF_TABLE_BACKED_TYPES.includes(detectedRef.type)){
                // No table will ever be checked for this type, so we already
                // know the fallback block is what needs to be shown.
                LOG('type has no matching table, resolving fallback block immediately', detectedRef.type);
                resolveDetectedRefTableCheck(false);
            }
        }else{
            LOG('no trackid detected, using quotation/email-based search only');
            searchCompanyByEmail();
        }
    }

    /**
     * Populate company + documents from a thirdparty id we already know
     * (typically resolved from the detected trackid's object), fetching its
     * name for display.
     * @param socId
     */
    function resolveSocFromId(socId){
        dolLib.callDolibarrApi('thirdparties/' + socId, {}, 'GET', {}, (socData)=>{
            LOG('thirdparty resolved from trackid', socData);
            setSocInfos({
                id: socData.id,
                name: socData.name
            });

            detectedRefThirdpartyName = socData.name || null;
            maybeRenderDetectedRefBlock();

            loadDocumentsInfos({
                socId : socData.id
            });
        },(errorMsg)=>{
            LOG('failed to fetch thirdparty name for id ' + socId + ', using id only', errorMsg);
            setSocInfos({
                id: socId,
                name: ''
            });

            loadDocumentsInfos({
                socId : socId
            });
        });
    }

    /**
     * Original flow: find the thirdparty via searchEmail (the quotation
     * requester's email when trusted X-Quotation-Mail headers are present,
     * the sender's email otherwise).
     */
    function searchCompanyByEmail(){
        LOG('searching company by email', searchEmail);
        dolLib.callDolibarrApi('contacts', {
            limit : 5,
            sortfield: 't.rowid',
            sortorder: 'DESC',
            sqlfilters: "(t.email:like:'"+searchEmail+"')"
        }, 'GET', {}, (resData)=>{

            resData = resData.pop();

            if(parseInt(resData.socid) > 0){
                LOG('contact found and attached to a thirdparty', resData);

                // Populate company data
                setSocInfos({
                    id: resData.socid,
                    name: resData.socname
                });

                loadDocumentsInfos({
                    socId : resData.socid
                })

            }else{
                LOG('contact found but not attached to a thirdparty', resData);
                setSocInfos({
                    id: 0, // In this case contact is probaly not attached to soc
                    name: 'Contact found but not attached to company'
                })
            }


        },(errorMsg)=>{
            LOG("contacts not found now search Thirdparties And Populate By Email " + searchEmail, errorMsg);
            searchThirdpartiesAndPopulateByEmail(searchEmail);
        });
    }


    function searchThirdpartiesAndPopulateByEmail(authorEmail){
        // console.error(msg);
        dolLib.callDolibarrApi('thirdparties', {
            limit : 1,
            sortfield: 't.rowid',
            sortorder: 'DESC',
            sqlfilters: "(t.email:like:'"+authorEmail+"')"
        }, 'GET', {}, (resData)=>{
            console.log("searchThirdpartiesAndPopulateByEmail found ");
            resData = resData.pop();
            // Populate company data
            setSocInfos({
                id: resData.id,
                name: resData.name
            });

            loadDocumentsInfos({
                socId : resData.id
            })

        },(errorMsg)=>{
            console.log("thirdpartie  not found now search Thirdparties And Populate By Email domain " + authorEmail);
            browser.storage.local.get({dolibarrSearchDomain:  false}).then(
                (data)=>{
                    if(data.dolibarrSearchDomain){
                        searchThirdpartieAndPopulateByEmailDomain(authorEmail);
                    }else{
                        setSocInfos({});
                    }
                }
            );


        });
    }

    async function getExcludedDomains(){
        let domains = await fetch(browser.runtime.getURL("exclude-domains.json"))
            .then(response => response.json())
            .catch(error => {
                console.error("Erreur de chargement du JSON :", error);
                return [];
            });

        if(!crmConnectorEnabled){
            // The extra domains list (crmclientconnector/excludeddomains) needs the
            // crmClientConnector module - fall back to the local list only.
            return domains;
        }

        let apiDomains = await new Promise((resolve) => {
            // TODO add cache
            dolLib.callDolibarrApi('crmclientconnector/excludeddomains', {
                sqlfilters: "(t.active:=:1)"
            }, 'GET', {}, (resData)=>{
                resolve(Array.isArray(resData) ? resData : []);
            }, (err) => {
                LOG('getExcludedDomains: crmclientconnector/excludeddomains failed', err);
                resolve([]);
            }, true);
        });

        return domains.concat(apiDomains);
    }


    function searchThirdpartieAndPopulateByEmailDomain(authorEmail){
        console.log("search for same domain soc");

        let emailDomain = authorEmail.split('@').pop();
        getExcludedDomains().then(emailPublicDomains => {
            if(!emailPublicDomains.includes(emailDomain.toLowerCase())){
                console.log("not public email " + emailDomain);

                // console.error(msg);
                dolLib.callDolibarrApi('thirdparties', {
                    limit : 5,
                    sortfield: 't.rowid',
                    sortorder: 'DESC',
                    sqlfilters: "(t.email:like:'%@"+emailDomain+"')"
                }, 'GET', {}, (resData)=>{
                    resData = resData.pop();
                    console.log("searchThirdpartieAndPopulateByEmailDomain found ");
                    // Populate company data
                    setSocInfos({
                        id: resData.id,
                        name: resData.name
                    });

                    loadDocumentsInfos({
                        socId : resData.id
                    })

                },(errorMsg)=>{
                    console.log("thirdparties not found ");
                    setSocInfos({});
                });

            }else{
                setSocInfos({});
            }
        })
    }



    /**
     * Display company data
     * @param socData
     */
    async function setSocInfos(socData){
        LOG('setSocInfos', socData);
        let soc = Object.assign({
            id: 0,
            name: '',
            phone_pro : '',
            phone_perso : '',
            phone_mobile : ''

        }, socData);

        // Add soc actions dropdown
        let socActions = document.getElementById("soc-actions");
        let titleDiv =  document.getElementById("popup-header");

        // console.log(message);

        if(soc.id == 0 || soc.id == '' || soc.id == null){
            displayTpl("soc-not-found-tpl");

            let newSocieteLink= document.getElementById("new-soc-link");
            let newContactLink= document.getElementById("new-contact-link");

            let quotationData = quotationActive ? (quotation.data || {}) : {};

            if(quotationActive && (quotationData.firstname || quotationData.lastname)){
                // societe not found - prefill from the trusted X-Quotation-Data header
                soc.name = (quotationData.is_pro === '1' && quotationData.company)
                    ? quotationData.company
                    : [quotationData.firstname, quotationData.lastname].filter(Boolean).join(' ');

                soc.phone_pro = quotationData.phone || '';
            }else{
                // societe not found
                soc.name = message.author.replace(authorEmail,'');
                soc.name = soc.name.replace(/[^a-zA-Z0-9áàâäãåçéèêëíìîïñóòôöõúùûüýÿæœÁÀÂÄÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸÆŒ ]/g, '');
                soc.name = soc.name.trim();

                // let phones = dolLib.searchPhonesInString(messageBody.html, true);
                let phones = dolLib.searchPhonesInString(messageBody.txt);
                if(phones.length>0){
                    soc.phone_pro = phones[0];
                }
                if(phones.length>1){
                    // TODO detect who is mobile
                    soc.phone_mobile = phones[1];
                }
                if(phones.length>2){
                    soc.phone_perso = phones[2];
                }
            }

            let contactName = quotationActive && (quotationData.firstname || quotationData.lastname)
                ? {firstName: quotationData.firstname || '', lastName: quotationData.lastname || ''}
                : dolLib.parseName(soc.name);

            let newThirdURL = new URL(confDolibarUrl + "societe/card.php");
            newThirdURL.searchParams.set('action', "create");
            newThirdURL.searchParams.set('email', searchEmail);
            newThirdURL.searchParams.set('name', soc.name);
            newThirdURL.searchParams.set('phone',  soc.phone_pro);
            if(quotationData.siren){
                newThirdURL.searchParams.set('idprof1', quotationData.siren);
            }
            if(quotationData.vat_number){
                newThirdURL.searchParams.set('tva_intra', quotationData.vat_number);
            }
            newSocieteLink.href = newThirdURL;

            titleDiv.textContent =  soc.name;

            let newContactURL = new URL(confDolibarUrl + "contact/card.php");
            newContactURL.searchParams.set('action', "create");
            newContactURL.searchParams.set('email', searchEmail);
            newContactURL.searchParams.set('firstname', contactName.firstName);
            newContactURL.searchParams.set('lastname', contactName.lastName);
            newContactURL.searchParams.set('phone_pro',  soc.phone_pro);
            newContactURL.searchParams.set('phone_mobile',  soc.phone_mobile);
            newContactURL.searchParams.set('phone_perso',  soc.phone_perso);
            newContactLink.href = newContactURL;

            LOG('no thirdparty found for this contact/email');
            // No thirdparty found means loadDocumentsInfos() never runs, so
            // no table will ever be able to confirm/deny a match.
            resolveDetectedRefTableCheck(false);

            // Documents tab would otherwise just show an empty table with no explanation -
            // this is the only spot that knows for sure the thirdparty search came up empty.
            document.getElementById('documents-no-thirdparty-notice')?.classList.remove('hidden-field');

            return;
        }

        document.getElementById('documents-no-thirdparty-notice')?.classList.add('hidden-field');

        LOG('thirdparty displayed', soc);
        displayTpl("soc-actions");

        titleDiv.textContent =  soc.name;

        let socCardUrl = new URL(confDolibarUrl + "societe/card.php");
        socCardUrl.searchParams.set('socid', soc.id);

        // Créer un devis / une commande / un ticket : accountEmail+msgId let the
        // crmclientconnector PROPAL_CREATE/ORDER_CREATE/TICKET_CREATE trigger auto-link the
        // newly created object back to this mail (see initNotesForMessage()'s comment above for
        // the same convention).
        let newPropalUrl = new URL(confDolibarUrl + "comm/propal/card.php");
        newPropalUrl.searchParams.set('action', "create");
        newPropalUrl.searchParams.set('socid', soc.id);
        let newOrderUrl = new URL(confDolibarUrl + "commande/card.php");
        newOrderUrl.searchParams.set('action', "create");
        newOrderUrl.searchParams.set('socid', soc.id);
        let newTicketUrl = new URL(confDolibarUrl + "ticket/card.php");
        newTicketUrl.searchParams.set('action', "create");
        newTicketUrl.searchParams.set('socid', soc.id);
        if(ownerAccountEmail && ownerMsgId){
            newPropalUrl.searchParams.set('accountEmail', ownerAccountEmail);
            newPropalUrl.searchParams.set('msgId', ownerMsgId);
            newOrderUrl.searchParams.set('accountEmail', ownerAccountEmail);
            newOrderUrl.searchParams.set('msgId', ownerMsgId);
            newTicketUrl.searchParams.set('accountEmail', ownerAccountEmail);
            newTicketUrl.searchParams.set('msgId', ownerMsgId);
        }

        socActions.innerHTML = '';
        socActions.appendChild(dolLib.buildDropdownMenu({
            triggerLabel: chrome.i18n.getMessage('Actions'),
            items: [
                {label: chrome.i18n.getMessage('FicheDolibarr'), href: socCardUrl, target: '_blank'},
                {label: chrome.i18n.getMessage('CreateNewQuotation'), href: newPropalUrl, target: '_blank'},
                {label: chrome.i18n.getMessage('CreateNewOrder'), href: newOrderUrl, target: '_blank'},
                {label: chrome.i18n.getMessage('CreateNewTicket'), href: newTicketUrl, target: '_blank'}
            ]
        }));

        if(!crmConnectorEnabled){
            // Without the crmClientConnector module, the Info tab has nothing useful left to
            // show (no notes, no linked documents - see the discreet notice there) : default
            // to the Documents tab instead. Skipped when the thirdparty itself is unknown (see
            // the early return above), since Info is then the only tab offering something
            // actionable (create company/contact).
            switchPopupTab('documents');
        }
    }

    /**
     * Called once we know whether the detected trackid's object was found
     * among the rows of its matching table (and therefore already
     * highlighted via detectedRefSearchText). Only the first call counts.
     * @param matchedInTable
     */
    function resolveDetectedRefTableCheck(matchedInTable){
        if(!detectedRef || detectedRefTableResolved){
            return;
        }
        detectedRefTableResolved = true;
        LOG('detected ref table check resolved, matchedInTable =', matchedInTable);

        if(!matchedInTable){
            detectedRefShouldShowBlock = true;
            maybeRenderDetectedRefBlock();
        }
    }

    /**
     * Renders the "detected reference" fallback block above the tabs, but only once we both know
     * it needs to be shown (the referenced object didn't show up in its matching table - too old,
     * or a type with no table at all) and have the API response for the referenced object (for
     * its ref name). Re-runs (idempotently) once the thirdparty name resolves too, see
     * resolveSocFromId(), so the card can be completed in place.
     *
     * Also refreshes the Info tab's own linked-documents section every time this is called
     * (regardless of whether the above-tabs block itself ends up shown), since
     * updateInfoTabLinkedDocumentsSection() reacts to detectedRef/detectedRefObjectData too - see
     * its own doc comment. This runs on every detectedRef, table-backed or not, matched-in-table
     * or not, because the trackid object fetch (see the caller of this function) always happens
     * regardless of those - unlike the above-tabs block, which resolveDetectedRefTableCheck()
     * only turns on for the "not matched in table" case.
     */
    function maybeRenderDetectedRefBlock(){
        if(detectedRefShouldShowBlock && detectedRefObjectFetchDone){
            LOG('rendering detected ref block', detectedRef, detectedRefObjectData);
            let block = document.getElementById("dolibarr-detected-ref");
            let cardContainer = document.getElementById("dolibarr-detected-ref-card");
            if(block && cardContainer){
                cardContainer.innerHTML = '';
                cardContainer.appendChild(buildDetectedRefCard());
                block.classList.remove('hidden-field');
            }
        }

        updateInfoTabLinkedDocumentsSection();
    }

    /**
     * Builds the detected-ref card, styled like the linked-document cards in
     * the "Lier" tab (see buildLinkedDocCard()) so a document found via the
     * mail headers reads the same way - reference/status up top, then
     * whichever fields are known, instead of a raw "type : #id" line.
     */
    function buildDetectedRefCard(){
        let data = detectedRefObjectData || {};
        let locale = navigator.language || navigator.browserLanguage || (navigator.languages || ['en'])[0];

        let card = document.createElement('div');
        card.classList.add('linked-doc-card');

        let header = document.createElement('div');
        header.classList.add('linked-doc-card__header');

        let type = document.createElement('span');
        type.classList.add('linked-doc-card__type');
        type.textContent = chrome.i18n.getMessage(detectedRefMeta.labelKey);
        header.appendChild(type);

        let ref = document.createElement('a');
        ref.classList.add('linked-doc-card__ref');
        ref.textContent = data.ref || ('#' + detectedRef.id);
        ref.href = dolLib.getDolibarrCardUrl(confDolibarUrl, detectedRef.type, detectedRef.id);
        ref.target = '_blank';
        header.appendChild(ref);

        let statusInfo = getDetectedRefStatusInfo(detectedRef.type, data.status);
        if(statusInfo){
            let status = document.createElement('span');
            status.classList.add('badge', 'badge-status' + statusInfo.code);
            status.textContent = statusInfo.label;
            header.appendChild(status);
        }

        card.appendChild(header);

        let fields = document.createElement('div');
        fields.classList.add('linked-doc-card__fields');

        let addField = (label, value) => {
            if(value === null || value === undefined || value === ''){
                return;
            }
            let field = document.createElement('span');
            field.classList.add('linked-doc-card__field');
            let fieldLabel = document.createElement('span');
            fieldLabel.classList.add('linked-doc-card__field-label');
            fieldLabel.textContent = label + ' : ';
            field.appendChild(fieldLabel);
            field.append(value);
            fields.appendChild(field);
        };

        addField(chrome.i18n.getMessage('Thirdparty'), detectedRefThirdpartyName);

        if(['sord', 'sinv'].includes(detectedRef.type) && data.ref_supplier){
            addField(chrome.i18n.getMessage('RefSupplier'), data.ref_supplier);
        }else if(data.ref_client){
            addField(chrome.i18n.getMessage('RefClient'), data.ref_client);
        }

        let dateValue = data.date || data.date_creation || data.datec;
        if(dateValue){
            addField(chrome.i18n.getMessage('Date'), new Date(dateValue * 1000).toLocaleDateString(locale));
        }

        if(data.total_ttc !== undefined && data.total_ttc !== null && data.total_ttc !== ''){
            addField(chrome.i18n.getMessage('Total'), new Intl.NumberFormat(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(parseFloat(data.total_ttc)));
        }

        if(fields.childNodes.length > 0){
            card.appendChild(fields);
        }

        let actions = document.createElement('div');
        actions.classList.add('linked-doc-card__actions');
        let openLink = document.createElement('a');
        openLink.href = dolLib.getDolibarrCardUrl(confDolibarUrl, detectedRef.type, detectedRef.id);
        openLink.target = '_blank';
        openLink.classList.add('btn', 'btn-primary');
        openLink.textContent = chrome.i18n.getMessage('OpenDocument');
        actions.appendChild(openLink);

        // Offer to link this document to the mail when we know for sure it isn't linked yet
        // (linkedDocumentsFetched : see the eager loadLinkedDocuments() call above and
        // renderLinkedDocuments(), which is what keeps linkedDocumentKeys up to date). Needs
        // ownerAccountEmail/ownerMsgId, same requirement as the rest of the "Lier" tab.
        let key = detectedRef.type + ':' + detectedRef.id;
        if(linkedDocumentsFetched && !linkedDocumentKeys.has(key) && ownerAccountEmail && ownerMsgId){
            let linkBtn = document.createElement('button');
            linkBtn.type = 'button';
            linkBtn.classList.add('btn', 'btn-primary');
            linkBtn.textContent = chrome.i18n.getMessage('Link');
            linkBtn.addEventListener('click', (event) => {
                event.preventDefault();
                linkBtn.disabled = true;
                linkDocument(detectedRef.type, detectedRef.id, (success, errorMsg) => {
                    // linkDocument() always calls loadLinkedDocuments() itself, which will
                    // rebuild this card (see renderLinkedDocuments()) and drop the button once
                    // linkedDocumentKeys reflects the new link - no manual DOM update needed
                    // here beyond user feedback.
                    if(success || (errorMsg && errorMsg.indexOf('Duplicate entry') !== -1)){
                        dolLib.showToast(chrome.i18n.getMessage('LinkSuccess'), 'success');
                    }else{
                        linkBtn.disabled = false;
                        dolLib.showToast(chrome.i18n.getMessage('LinkError')+' ('+errorMsg+')', 'error');
                    }
                });
            });
            actions.appendChild(linkBtn);
        }

        card.appendChild(actions);

        return card;
    }

    /**
     * Status badge {code, label} for the document types whose status table is
     * already known here (see setQuotationsInfos/setOrdersInfos/
     * setInvoicesInfos/setSupplierordersInfos below, which this mirrors so
     * the badge matches what the matching list/table would have shown), or
     * null for a type with no status table / an unrecognized status value.
     * @param {string} type
     * @param {number|string} status
     */
    function getDetectedRefStatusInfo(type, status){
        if(status === undefined || status === null || status === ''){
            return null;
        }
        status = parseInt(status);

        const TABLES = {
            pro: {
                '-1': {code: 9, key: 'StatusCanceledShort'},
                '0': {code: 0, key: 'StatusDraftShort'},
                '1': {code: 1, key: 'StatusValidatedShort'},
                '2': {code: 4, key: 'StatusSignedShort'},
                '3': {code: 6, key: 'StatusNotSignedShort'},
                '4': {code: 6, key: 'StatusBilledShort'}
            },
            ord: {
                '-1': {code: 9, key: 'StatusCanceledShort'},
                '0': {code: 0, key: 'StatusDraftShort'},
                '1': {code: 1, key: 'StatusValidatedShort'},
                '2': {code: 4, key: 'StatusOrderSentShort'},
                '3': {code: 6, key: 'StatusDelivered'}
            },
            inv: {
                '-1': {code: 9, key: 'StatusCanceledShort'},
                '0': {code: 0, key: 'StatusDraftShort'},
                '1': {code: 1, key: 'StatusValidatedShort'},
                '2': {code: 4, key: 'StatusClosed'},
                '3': {code: 6, key: 'StatusAbandoned'}
            },
            sord: {
                '0': {code: 0, key: 'StatusDraftShort'},
                '1': {code: 1, key: 'StatusValidatedShort'},
                '2': {code: 1, key: 'StatusSupplierOrderDraftShort'},
                '3': {code: 4, key: 'StatusSupplierOrderOnProcessShort'},
                '4': {code: 4, key: 'StatusSupplierOrderReceivedPartiallyShort'},
                '5': {code: 6, key: 'StatusSupplierOrderReceivedAllShort'},
                '6': {code: 9, key: 'StatusCanceledShort'},
                '7': {code: 9, key: 'StatusCanceledShort'},
                '9': {code: 9, key: 'StatusSupplierOrderRefusedShort'}
            }
        };

        let table = TABLES[type];
        let entry = table ? table[String(status)] : null;
        if(!entry){
            return null;
        }
        return {code: entry.code, label: chrome.i18n.getMessage(entry.key)};
    }

    /**
     * Called by each setXInfos() once its list of objects came back from the
     * API, to check whether it contains the detected ref, or resolve that it
     * doesn't (letting the fallback block show).
     * @param type one of DETECTED_REF_TABLE_BACKED_TYPES
     * @param list the raw API list for that type (e.g. dataLastOrders)
     */
    function checkDetectedRefAgainstList(type, list){
        if(!detectedRef || detectedRef.type !== type){
            return;
        }
        let match = list.find((item) => String(item.id) === String(detectedRef.id));
        LOG('checkDetectedRefAgainstList', type, 'listSize=' + list.length, match ? 'MATCH' : 'no match');
        resolveDetectedRefTableCheck(!!match);
    }


    /**
     * display propal history
     * @param object confData
     */
    function setQuotationsInfos(confData){
        let conf = Object.assign({
            socId: 0
        }, confData);
        
        //defaut no filter
        let sqlfilters ='';
        if (propalDisplayStatus.length > 0) {
            propalDisplayStatus= propalDisplayStatus.join(',');//status to string comma separated
            sqlfilters = '(t.fk_statut:in:' + propalDisplayStatus + ')';
        }

        // Get contact infos
        return dolLib.callDolibarrApi('proposals', {
            sortfield: 't.rowid',
            sortorder: 'DESC',
            limit:5,
            thirdparty_ids: conf.socId,
            sqlfilters: sqlfilters
        }, 'GET', {}, (dataLastPropals)=>{
            LOG('setQuotationsInfos received', dataLastPropals);

            if(!Array.isArray(dataLastPropals) || dataLastPropals.length == 0){
                // No contact found in database
                checkDetectedRefAgainstList('pro', []);
                return;
            }

            let tableItems = [];
            dataLastPropals.forEach((propal) => {

                let item = {
                    'ref': '',
                    'refClient': '',
                    'date': '',
                    'total_ht': '',
                    'status': ''
                }

                item.ref = {
                    html: '<a href="'+ confDolibarUrl + 'comm/propal/card.php?id=' + propal.id+'" >' + propal.ref + '</a>',
                    hightLight : propal.ref,
                    class : 'text-center'
                };

                if(parseInt(propal.status) === -1) {
                    item.status = {
                        html: `<span class="badge badge-status9">${chrome.i18n.getMessage('StatusCanceledShort')}</span>`,
                        class : 'text-center'
                    };
                } else if(parseInt(propal.status) === 0) {
                    item.status = {
                        html: `<span class="badge badge-status0">${chrome.i18n.getMessage('StatusDraftShort')}</span>`,
                        class : 'text-center'
                    };
                } else if(parseInt(propal.status) === 1) {
                    item.status = {
                        html: `<span class="badge badge-status1">${chrome.i18n.getMessage('StatusValidatedShort')}</span>`,
                        class : 'text-center'
                    };
                }
                else if(parseInt(propal.status) === 2) {
                    item.status = {
                        html: `<span class="badge badge-status4">${chrome.i18n.getMessage('StatusSignedShort')}</span>`,
                        class : 'text-center'
                    };
                }
                else if(parseInt(propal.status) === 3) {
                    item.status = {
                        html: `<span class="badge badge-status6">${chrome.i18n.getMessage('StatusNotSignedShort')}</span>`,
                        class : 'text-center'
                    };
                }
                else if(parseInt(propal.status) === 4) {
                    item.status = {
                        html: `<span class="badge badge-status6">${chrome.i18n.getMessage('StatusBilledShort')}</span>`,
                        class : 'text-center'
                    };
                }

                if(typeof propal.ref_client != undefined && propal.ref_client != null &&  propal.ref_client.length > 0){
                    item.refClient = {
                        html: propal.ref_client,
                        hightLight : propal.ref_client,
                        class : 'text-center'
                    };
                }

                let dateP = new Date(parseInt(propal.date) * 1000);
                item.date = {
                    html: dateP.toLocaleDateString(),
                    class : 'text-center'
                };

                let formatedNumber = '';
                try {
                    formatedNumber = new Intl.NumberFormat([], {
                        style: 'currency',
                        currency: propal.multicurrency_code
                    }).format(parseFloat(propal.total_ht))
                } catch (error) {
                    formatedNumber = parseFloat(propal.total_ht);
                }
    
                item.total_ht = {
                    html: formatedNumber,
                    class: 'text-right'
                };

                tableItems.push(item);
            });

            dolLib.jsonToTable(
                {
                    'ref': chrome.i18n.getMessage('Ref'),
                    'refClient': chrome.i18n.getMessage('RefClient'),
                    'date': chrome.i18n.getMessage('Date'),
                    'total_ht': chrome.i18n.getMessage('Total'),
                    'status': chrome.i18n.getMessage('Status')
                },
                tableItems,
                document.getElementById("data-from-dolibarr"),
                'dolibarr-table dolibarr-table-stripped',
                message.subject + ' ' + messageBody.html + detectedRefSearchText
            );

            checkDetectedRefAgainstList('pro', dataLastPropals);

        },(errorMsg)=>{
            console.error("setQuotationsInfos" + errorMsg);
            checkDetectedRefAgainstList('pro', []);
        });

    }


    /**
     * display propal history
     * @param object confData
     */
    function setOrdersInfos(confData){
        let conf = Object.assign({
            socId: 0
        }, confData);

        // Get contact infos
        return dolLib.callDolibarrApi('orders', {
            sortfield: 't.rowid',
            sortorder: 'DESC',
            limit:5,
            thirdparty_ids: conf.socId
        }, 'GET', {}, (dataLastOrders)=>{
            LOG('setOrdersInfos received', dataLastOrders);

            if(!Array.isArray(dataLastOrders) || dataLastOrders.length == 0){
                // No contact found in database
                checkDetectedRefAgainstList('ord', []);
                return;
            }

            let tableItems = [];
            dataLastOrders.forEach((order) => {

                let item = {
                    'ref': '',
                    'refClient': '',
                    'date': '',
                    'total_ht': '',
                    'status': ''
                }

                item.ref = {
                    html: '<a href="'+ confDolibarUrl + 'commande/card.php?id=' + order.id+'" >' + order.ref + '</a>',
                    hightLight : order.ref,
                    class : 'text-center'
                };

                if(parseInt(order.status) === -1) {
                    item.status = {
                        html: `<span class="badge badge-status9">${chrome.i18n.getMessage('StatusCanceledShort')}</span>`,
                        class : 'text-center'
                    };
                } else if(parseInt(order.status) === 0) {
                    item.status = {
                        html: `<span class="badge badge-status0">${chrome.i18n.getMessage('StatusDraftShort')}</span>`,
                        class : 'text-center'
                    };
                } else if(parseInt(order.status) === 1) {
                    item.status = {
                        html: `<span class="badge badge-status1">${chrome.i18n.getMessage('StatusValidatedShort')}</span>`,
                        class : 'text-center'
                    };
                }
                else if(parseInt(order.status) === 2) {
                    item.status = {
                        html: `<span class="badge badge-status4">${chrome.i18n.getMessage('StatusOrderSentShort')}</span>`,
                        class : 'text-center'
                    };
                }
                else if(parseInt(order.status) === 3) {
                    item.status = {
                        html: `<span class="badge badge-status6">${chrome.i18n.getMessage('StatusDelivered')}</span>`,
                        class : 'text-center'
                    };
                }

                if(typeof order.ref_client != undefined && order.ref_client != null && order.ref_client.length > 0){
                    item.refClient = {
                        html:  order.ref_client,
                        hightLight : order.ref_client,
                        class : 'text-center'
                    };
                }

                let dateP = new Date(parseInt(order.date) * 1000);
                item.date = {
                    html: dateP.toLocaleDateString(),
                    class : 'text-center'
                };

                let formatedNumber = '';
                try {
                    formatedNumber = new Intl.NumberFormat([], {
                        style: 'currency',
                        currency: order.multicurrency_code
                    }).format(parseFloat(order.total_ht))
                } catch (error) {
                    formatedNumber = parseFloat(order.total_ht);
                }

                item.total_ht = {
                    html: formatedNumber,
                    class: 'text-right'
                };

                tableItems.push(item);
            });

            dolLib.jsonToTable(
                {
                    'ref': chrome.i18n.getMessage('Ref'),
                    'refClient': chrome.i18n.getMessage('RefClient'),
                    'date': chrome.i18n.getMessage('Date'),
                    'total_ht': chrome.i18n.getMessage('Total'),
                    'status': chrome.i18n.getMessage('Status')
                },
                tableItems,
                document.getElementById("data-from-dolibarr"),
                'dolibarr-table dolibarr-table-stripped',
                message.subject + ' ' + messageBody.html + detectedRefSearchText
            );

            checkDetectedRefAgainstList('ord', dataLastOrders);

        },(errorMsg)=>{
            console.error("setQuotationsInfos" + errorMsg);
            checkDetectedRefAgainstList('ord', []);
        });

    }


/**
 * display propal history
 * @param object confData
 */
function setInvoicesInfos(confData){
    let conf = Object.assign({
        socId: 0
    }, confData);

    // Get contact infos
    return dolLib.callDolibarrApi('invoices', {
        sortfield: 't.rowid',
        sortorder: 'DESC',
        limit:5,
        thirdparty_ids: conf.socId
    }, 'GET', {}, (dataLastInvoices)=>{
        LOG('setInvoicesInfos received', dataLastInvoices);

        if(!Array.isArray(dataLastInvoices) || dataLastInvoices.length == 0){
            // No contact found in database
            checkDetectedRefAgainstList('inv', []);
            return;
        }

        let tableItems = [];
        dataLastInvoices.forEach((invoice) => {

            let item = {
                'ref': '',
                'refClient': '',
                'date': '',
                'total_ht': '',
                'status': ''
            }

            item.ref = {
                html: '<a href="'+ confDolibarUrl + 'compta/facture/card.php?id=' + invoice.id+'" >' + invoice.ref + '</a>',
                hightLight : invoice.ref,
                class : 'text-center'
            };

            if(parseInt(invoice.status) === -1) {
                item.status = {
                    html: `<span class="badge badge-status9">${chrome.i18n.getMessage('StatusCanceledShort')}</span>`,
                    class : 'text-center'
                };
            } else if(parseInt(invoice.status) === 0) {
                item.status = {
                    html: `<span class="badge badge-status0">${chrome.i18n.getMessage('StatusDraftShort')}</span>`,
                    class : 'text-center'
                };
            } else if(parseInt(invoice.status) === 1) {
                item.status = {
                    html: `<span class="badge badge-status1">${chrome.i18n.getMessage('StatusValidatedShort')}</span>`,
                    class : 'text-center'
                };
            }
            else if(parseInt(invoice.status) === 2) {
                item.status = {
                    html: `<span class="badge badge-status4">${chrome.i18n.getMessage('StatusClosed')}</span>`,
                    class : 'text-center'
                };
            }
            else if(parseInt(invoice.status) === 3) {
                item.status = {
                    html: `<span class="badge badge-status6">${chrome.i18n.getMessage('StatusAbandoned')}</span>`,
                    class : 'text-center'
                };
            }
            
            if(typeof invoice.ref_client != undefined  && invoice.ref_client != null && invoice.ref_client.length > 0){
                item.refClient = {
                    html: invoice.ref_client,
                    hightLight : invoice.ref_client,
                    class : 'text-center'
                };
            }

            let dateP = new Date(parseInt(invoice.date) * 1000);
            item.date = {
                html: dateP.toLocaleDateString(),
                class : 'text-center'
            };

            let formatedNumber = '';
            try {
                formatedNumber = new Intl.NumberFormat([], {
                    style: 'currency',
                    currency: invoice.multicurrency_code
                }).format(parseFloat(invoice.total_ht))
            } catch (error) {
                formatedNumber = parseFloat(invoice.total_ht);
            }

            item.total_ht = {
                html: formatedNumber,
                class: 'text-right'
            };
            
            tableItems.push(item);
        });

        dolLib.jsonToTable(
            {
                'ref': chrome.i18n.getMessage('Ref'),
                'refClient': chrome.i18n.getMessage('RefClient'),
                'date': chrome.i18n.getMessage('Date'),
                'total_ht': chrome.i18n.getMessage('Total'),
                'status': chrome.i18n.getMessage('Status')
            },
            tableItems,
            document.getElementById("data-from-dolibarr"),
            'dolibarr-table dolibarr-table-stripped',
            message.subject + ' ' + messageBody.html + detectedRefSearchText
        );

        checkDetectedRefAgainstList('inv', dataLastInvoices);

    },(errorMsg)=>{
        console.error("setQuotationsInfos " + errorMsg);
        checkDetectedRefAgainstList('inv', []);
    });

}

/**
 * display Supplierorders history
 * @param object confData
 */
function setSupplierordersInfos(confData){
    let conf = Object.assign({
        socId: 0
    }, confData);

    // Get contact infos
    return dolLib.callDolibarrApi('supplierorders', {
        sortfield: 't.rowid',
        sortorder: 'DESC',
        limit:5,
        thirdparty_ids: conf.socId
    }, 'GET', {}, (dataLastSupplierorders)=>{
        LOG('setSupplierordersInfos received', dataLastSupplierorders);

        if(!Array.isArray(dataLastSupplierorders) || dataLastSupplierorders.length == 0){
            // No contact found in database
            checkDetectedRefAgainstList('sord', []);
            return;
        }

        let tableItems = [];
        dataLastSupplierorders.forEach((supplierorder) => {

            let item = {
                'ref': '',
                'refFourn': '',//todo translate
                'date': '',
                'total_ht': '',
                'status': ''
            }

            item.ref = {
                html: '<a href="'+ confDolibarUrl + 'fourn/commande/card.php?id=' + supplierorder.id+'" >' + supplierorder.ref + '</a>',
                hightLight : supplierorder.ref,
                class : 'text-center'
            };


            if(parseInt(supplierorder.status) === 6 || parseInt(supplierorder.status) === 7) {
                item.status = {
                    html: `<span class="badge badge-status9">${chrome.i18n.getMessage('StatusCanceledShort')}</span>`,
                    class : 'text-center'
                };
            } else if(parseInt(supplierorder.status) === 0) {
                item.status = {
                    html: `<span class="badge badge-status0">${chrome.i18n.getMessage('StatusDraftShort')}</span>`,
                    class : 'text-center'
                };
            } else if(parseInt(supplierorder.status) === 1) {
                item.status = {
                    html: `<span class="badge badge-status1">${chrome.i18n.getMessage('StatusValidatedShort')}</span>`,
                    class : 'text-center'
                };
            }
            else if(parseInt(supplierorder.status) === 2) {
                item.status = {
                    html: `<span class="badge badge-status1">${chrome.i18n.getMessage('StatusSupplierOrderDraftShort')}</span>`,
                    class : 'text-center'
                };
            }
            else if(parseInt(supplierorder.status) === 3) {
                item.status = {
                    html: `<span class="badge badge-status4">${chrome.i18n.getMessage('StatusSupplierOrderOnProcessShort')}</span>`,
                    class : 'text-center'
                };
            }
            else if(parseInt(supplierorder.status) === 4) {
                item.status = {
                    html: `<span class="badge badge-status4">${chrome.i18n.getMessage('StatusSupplierOrderReceivedPartiallyShort')}</span>`,
                    class : 'text-center'
                };
            }
            else if(parseInt(supplierorder.status) === 5) {
                item.status = {
                    html: `<span class="badge badge-status6">${chrome.i18n.getMessage('StatusSupplierOrderReceivedAllShort')}</span>`,
                    class : 'text-center'
                };
            }
            else if(parseInt(supplierorder.status) === 9) {
                item.status = {
                    html: `<span class="badge badge-status9">${chrome.i18n.getMessage('StatusSupplierOrderRefusedShort')}</span>`,
                    class : 'text-center'
                };
            }

            if(typeof supplierorder.ref_supplier != undefined && supplierorder.ref_supplier != null && supplierorder.ref_supplier.length > 0){
                item.refFourn= {
                    html: supplierorder.ref_supplier
                };
            }

            let dateP = new Date(parseInt(supplierorder.date) * 1000);
            item.date = {
                html: dateP.toLocaleDateString(),
                class : 'text-center'
            };


            let formatedNumber = '';
            try {
                formatedNumber = new Intl.NumberFormat([], {
                    style: 'currency',
                    currency: supplierorder.multicurrency_code
                }).format(parseFloat(supplierorder.total_ht))
            } catch (error) {
                formatedNumber = parseFloat(supplierorder.total_ht);
            }

            item.total_ht = {
                html: formatedNumber,
                class: 'text-right'
            };
            tableItems.push(item);
        });

        dolLib.jsonToTable(
            {
                'ref': chrome.i18n.getMessage('Ref'),
                'refClient': chrome.i18n.getMessage('RefClient'),
                'date': chrome.i18n.getMessage('Date'),
                'total_ht': chrome.i18n.getMessage('Total'),
                'status': chrome.i18n.getMessage('Status')
            },
            tableItems,
            document.getElementById("data-from-dolibarr")
        );

        checkDetectedRefAgainstList('sord', dataLastSupplierorders);

    },(errorMsg)=>{
        console.error("setQuotationsInfos : " + errorMsg);
        checkDetectedRefAgainstList('sord', []);
    });

}

function displayTpl(id){
    let tpl = document.getElementById(id);
    if(!tpl){
        return;
    }
    tpl.classList.remove('hidden-field');
}


function loadDocumentsInfos(data){
    setQuotationsInfos(data);
    setOrdersInfos(data);
    setInvoicesInfos(data);
    setSupplierordersInfos(data);
}

/**
 * INIT Shared notes
 * need Crm client connector module installed in Dolibarr
 * @returns {Promise<void>}
 */
async function initNotesForMessage(){
    // console.dir(message, { depth: null })
    // NOTES
    // need Crm client connector module installed in Dolibarr

    if (!crmConnectorEnabled || !message) {
        return;
    }

    const accountEmail = await getEmailAccountFromBackground(message.id);
    if (!accountEmail) {
        console.warn("Impossible de déterminer l'adresse du compte.");
    }

    let msgId = message.headerMessageId; // ou gFolderDisplay.selectedMessage ?
    let textArea = document.getElementById("dolibarr-note-input");

    // Display input form
    // Add new note
    dolLib.callDolibarrApi(
        'crmclientconnector/emailaccounts',
        {sqlfilters : `(email_account:=:'${accountEmail}')`},
        'GET',
        {},
        (resData)=>{
           if(resData.length > 0) {
               displayTpl("dolibarr-notes-container");
               textArea.focus();
               textArea.placeholder = browser.i18n.getMessage("WriteComment");
               // Get all notes
               dolLib.refreshComments(tabs, accountEmail, msgId);
           }
        });


    function submitComment(){
        if(textArea.value.length > 0){

            // TODO : add feedback animation see Dolibarr experimental Doc

            // Add new note
            dolLib.callDolibarrApi(
                'crmclientconnector/emailusermsgs',
                {},
                'POST',
                JSON.stringify({
                    emailAccount: accountEmail,
                    emailMsgId:msgId,
                    message : textArea.value
                }),
                (resData)=>{
                    textArea.value = ''; // clear input
                    dolLib.refreshComments(tabs, accountEmail, msgId);
            }, (err)=>{
                // TODO manage error
                //     console.log(err);
                //     document.getElementById('dolibarr-note-input-errors').innerText = err.message;
            });
        }
    }

    // No more submit button : Enter alone submits, Shift+Enter / Ctrl+Enter inserts a newline
    // (the textarea's own default behaviour for Enter, which preventDefault() below skips).
    textArea.addEventListener('keydown', function(event) {
        if(event.key === 'Enter' && !event.shiftKey && !event.ctrlKey){
            event.preventDefault();
            submitComment();
        }
    });
}

/**
 * "Lier" tab : search/link/unlink a devis/commande/facture/... to the mail currently displayed,
 * using the crmclientconnector emaillinks/linkedobjects, emaillinks/link endpoints (needs
 * crmclientconnector module installed in Dolibarr, same as the notes feature above). State
 * declared up near the top of the module (see linkTabInitialized et al. above) since
 * updateAgendaEventLinkState() reads lastLinkedDocumentsList synchronously from initAgendaTab(),
 * called before the script would otherwise reach this point.
 */

function initPopupTabs(){
    POPUP_TABS.forEach((tab) => {
        let btn = document.getElementById('tab-btn-'+tab);
        if(btn){
            btn.addEventListener('click', () => switchPopupTab(tab));
        }
    });
}

function switchPopupTab(tab){
    POPUP_TABS.forEach((otherTab) => {
        document.getElementById('tab-btn-'+otherTab)?.classList.toggle('active', otherTab === tab);
        document.getElementById('tab-panel-'+otherTab)?.classList.toggle('hidden-field', otherTab !== tab);
    });

    if(tab === 'link' && !linkTabInitialized){
        linkTabInitialized = true;
        initLinkTab();
    }
}

/**
 * Badge on the "Documents" tab button showing how many recent documents it holds (capped at
 * "9+"). The table is filled by 4 independent async calls (quotations/orders/invoices/supplier
 * orders, see loadDocumentsInfos()) that each append their own rows whenever their own request
 * resolves, so rather than threading a counter through all of them, just watch the table itself
 * and recompute the total whenever it changes.
 */
function initDocumentsTabBadge(){
    let table = document.getElementById('data-from-dolibarr');
    let badge = document.getElementById('tab-documents-badge');
    if(!table || !badge){
        return;
    }

    let update = () => {
        let count = table.querySelectorAll('tr:not(.table-title)').length;
        if(count <= 0){
            badge.classList.add('hidden-field');
            return;
        }
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.classList.remove('hidden-field');
    };

    new MutationObserver(update).observe(table, {childList: true, subtree: true});
    update();
}

/**
 * Wires the Info tab's "no linked document" empty state (see
 * updateInfoTabLinkedDocumentsSection()) CTA button to jump to the "Lier" tab with the search
 * field focused, ready to type a reference.
 */
function initInfoTabLinkCta(){
    let cta = document.getElementById('info-link-document-cta');
    if(!cta){
        return;
    }
    cta.addEventListener('click', () => {
        switchPopupTab('link');
        document.getElementById('link-search-input')?.focus();
    });
}

/**
 * Wires the Info tab's "an event was detected in this mail, create it ?" invitation (see
 * updateAgendaEventLinkState()) CTA button to jump to the "Agenda" tab.
 */
function initInfoTabAgendaCta(){
    let cta = document.getElementById('info-agenda-invitation-cta');
    if(!cta){
        return;
    }
    cta.addEventListener('click', () => switchPopupTab('agenda'));
}

/**
 * "Agenda" tab : only shown when the mail carries a .ics calendar invite attachment (see
 * detectIcsEventFromMessage() in global.lib.js). Renders a preview card from the parsed VEVENT
 * (summary/date/location/organizer/description) and a link to create the matching Dolibarr
 * agenda event, prefilled from that same data - see buildAgendaEventCreateUrl(). Whether that
 * event already exists (linked to this mail via crmclientconnector/emaillinks, either by that
 * create link's own auto-link trigger or manually from the "Lier" tab) is resolved separately,
 * see updateAgendaEventLinkState().
 */
function initAgendaTab(){
    if(!icsEvent){
        return;
    }

    document.getElementById('tab-btn-agenda')?.classList.remove('hidden-field');

    if(icsEvent.summary){
        document.getElementById('agenda-event-summary').textContent = icsEvent.summary;
    }

    let locale = navigator.language || navigator.browserLanguage || (navigator.languages || ['en'])[0];
    let formatIcsDate = (date) => icsEvent.allDay ? date.toLocaleDateString(locale) : date.toLocaleString(locale);

    if(icsEvent.start){
        let text = formatIcsDate(icsEvent.start);
        if(icsEvent.end && icsEvent.end.getTime() !== icsEvent.start.getTime()){
            text += ' - ' + formatIcsDate(icsEvent.end);
        }
        let dateEl = document.getElementById('agenda-event-date');
        dateEl.textContent = text;
        dateEl.classList.remove('hidden-field');
    }

    if(icsEvent.location){
        let locationEl = document.getElementById('agenda-event-location');
        locationEl.textContent = chrome.i18n.getMessage('Location') + ' : ' + icsEvent.location;
        locationEl.classList.remove('hidden-field');
    }

    if(icsEvent.organizer){
        let organizerEl = document.getElementById('agenda-event-organizer');
        organizerEl.textContent = chrome.i18n.getMessage('Organizer') + ' : ' + icsEvent.organizer;
        organizerEl.classList.remove('hidden-field');
    }

    if(icsEvent.description){
        let descriptionEl = document.getElementById('agenda-event-description');
        descriptionEl.textContent = icsEvent.description;
        descriptionEl.classList.remove('hidden-field');
    }

    document.getElementById('agenda-event-create-link').href = buildAgendaEventCreateUrl();

    updateAgendaEventLinkState();
}

/**
 * Dolibarr's comm/action/card.php create form reads label/location/note/datep straight off the
 * querystring to prefill itself (unlike the quotation/order/ticket create links, which only
 * carry socid/accountEmail/msgId) - see this function's Dolibarr-side counterpart in
 * comm/action/card.php around GETPOST('label')/GETPOST('location')/GETPOST('datep'). accountEmail
 * + msgId are carried the same way as the other "create X" links (see setSocInfos()'s
 * newPropalUrl/newOrderUrl/newTicketUrl above) so the ACTION_CREATE trigger can auto-link the new
 * event back to this mail.
 * @returns {string}
 */
function buildAgendaEventCreateUrl(){
    let url = new URL(confDolibarUrl + 'comm/action/card.php');
    url.searchParams.set('action', 'create');

    if(icsEvent.summary){ url.searchParams.set('label', icsEvent.summary); }
    if(icsEvent.location){ url.searchParams.set('location', icsEvent.location); }
    if(icsEvent.description){ url.searchParams.set('note', icsEvent.description); }

    let pad = (n) => String(n).padStart(2, '0');

    if(icsEvent.start){
        if(icsEvent.allDay){
            url.searchParams.set('fullday', '1');
            // YYYYMMDD form - see comm/action/card.php's GETPOST('datep') handling.
            url.searchParams.set('datep', icsEvent.start.getFullYear() + pad(icsEvent.start.getMonth()+1) + pad(icsEvent.start.getDate()));
        }else{
            // YYYYMMDDHHMMSS form.
            url.searchParams.set('datep',
                icsEvent.start.getFullYear() + pad(icsEvent.start.getMonth()+1) + pad(icsEvent.start.getDate())
                + pad(icsEvent.start.getHours()) + pad(icsEvent.start.getMinutes()) + pad(icsEvent.start.getSeconds())
            );
        }
    }

    if(icsEvent.end){
        // No combined format for the end date - only individual day/month/year(/hour/min) params.
        url.searchParams.set('p2day', icsEvent.end.getDate());
        url.searchParams.set('p2month', icsEvent.end.getMonth() + 1);
        url.searchParams.set('p2year', icsEvent.end.getFullYear());
        if(!icsEvent.allDay){
            url.searchParams.set('p2hour', icsEvent.end.getHours());
            url.searchParams.set('p2min', icsEvent.end.getMinutes());
        }
    }

    if(ownerAccountEmail && ownerMsgId){
        url.searchParams.set('accountEmail', ownerAccountEmail);
        url.searchParams.set('msgId', ownerMsgId);
    }

    return url.toString();
}

/**
 * Switches the Agenda tab (and the Info tab's invitation banner) between "not linked yet - offer
 * to create it" and "already linked - show the existing event" (reusing buildLinkedDocCard(), the
 * same card the "Lier" tab uses), based on whether lastLinkedDocumentsList (refreshed by
 * renderLinkedDocuments(), see loadLinkedDocuments()) already has a type 'act' entry. Needs the
 * CRM Client Connector module to know for sure (see isCrmConnectorEnabled()) - when it's
 * disabled, lastLinkedDocumentsList never gets populated, so this defaults to "not linked yet"
 * (can't tell, so still offer to create it rather than silently doing nothing).
 */
function updateAgendaEventLinkState(){
    if(!icsEvent){
        return;
    }

    let linkedEvent = lastLinkedDocumentsList.find((item) => item.type === 'act');

    let linkedContainer = document.getElementById('agenda-event-linked-container');
    let linkedCard = document.getElementById('agenda-event-linked-card');
    let createContainer = document.getElementById('agenda-event-create-container');
    let infoInvitation = document.getElementById('info-agenda-invitation');

    if(linkedEvent){
        linkedCard.innerHTML = '';
        linkedCard.appendChild(buildLinkedDocCard(linkedEvent));
        linkedContainer.classList.remove('hidden-field');
        createContainer.classList.add('hidden-field');
        infoInvitation.classList.add('hidden-field');
    }else{
        linkedContainer.classList.add('hidden-field');
        createContainer.classList.remove('hidden-field');
        infoInvitation.classList.remove('hidden-field');
    }
}

function initLinkTab(){
    if(!crmConnectorEnabled){
        LOG('link tab: crmClientConnector module disabled by config, showing discreet notice only');
        return;
    }

    if(!ownerAccountEmail || !ownerMsgId){
        LOG('link tab: no accountEmail/msgId available, cannot link/search');
        return;
    }

    populateLinkSearchTypeSelect();
    loadLinkedDocuments();
    initDetectedRefsSuggestions();

    let searchInput = document.getElementById('link-search-input');
    let typeSelect = document.getElementById('link-search-type');
    let searchTimer = null;

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => searchDocumentsToLink(searchInput.value.trim()), 400);
    });

    typeSelect.addEventListener('change', () => searchDocumentsToLink(searchInput.value.trim()));
}

function populateLinkSearchTypeSelect(){
    let select = document.getElementById('link-search-type');
    if(!select){
        return;
    }

    let allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = chrome.i18n.getMessage('LinkAllTypes');
    select.appendChild(allOption);

    Object.entries(dolLib.DOLIBARR_OBJECT_TYPES).forEach(([type, meta]) => {
        let option = document.createElement('option');
        option.value = type;
        option.textContent = chrome.i18n.getMessage(meta.labelKey);
        select.appendChild(option);
    });
}

function loadLinkedDocuments(){
    dolLib.callDolibarrApi(
        'crmclientconnector/emaillinks/linkedobjects',
        {accountEmail: ownerAccountEmail, msgId: ownerMsgId},
        'GET',
        {},
        (resData)=>{
            renderLinkedDocuments(Array.isArray(resData) ? resData : []);
        },
        (errorMsg)=>{
            LOG('loadLinkedDocuments failed', errorMsg);
            renderLinkedDocuments([]);
        }
    );
}

function renderLinkedDocuments(list){
    let emptyEl = document.getElementById('link-linked-empty');
    let listEl = document.getElementById('link-linked-list');
    listEl.innerHTML = '';

    linkedDocumentKeys = new Set(list.map((item) => item.type+':'+item.id));
    linkedDocumentsFetched = true;
    lastLinkedDocumentsList = list;
    // The detected-ref card (built from the mail headers' trackid) needs to know whether its
    // document is already linked to decide whether to offer a "Link" button - refresh it now
    // that we know either way.
    maybeRenderDetectedRefBlock();
    // Mirrors the linked-documents list into the Info tab, see
    // updateInfoTabLinkedDocumentsSection().
    updateInfoTabLinkedDocumentsSection();
    // Tells the Agenda tab / Info tab invitation whether the detected .ics event is already
    // linked, see updateAgendaEventLinkState().
    updateAgendaEventLinkState();

    if(list.length === 0){
        emptyEl.classList.remove('hidden-field');
        listEl.classList.add('hidden-field');
        return;
    }

    emptyEl.classList.add('hidden-field');
    listEl.classList.remove('hidden-field');

    list.forEach((item) => listEl.appendChild(buildLinkedDocCard(item)));
}

/**
 * Whether the "detected via headers" card (see maybeRenderDetectedRefBlock()) is currently
 * shown, i.e. it's already surfacing a document for this mail on its own - used by
 * updateInfoTabLinkedDocumentsSection() to avoid also showing the "no linked document" empty
 * state right below it when there's really nothing more to add.
 */
function detectedRefCardVisible(){
    return !document.getElementById('dolibarr-detected-ref')?.classList.contains('hidden-field');
}

/**
 * Mirrors the "Lier" tab's linked-documents list (lastLinkedDocumentsList, refreshed by
 * renderLinkedDocuments()) into the Info tab : as cards when there are any, a one-click Link
 * card for the mail's detected trackid ref when there's nothing linked yet but we do know a
 * candidate document (see detectedRefLinkable below), or - only when neither applies - the empty
 * state with a CTA to the Link tab's search field.
 *
 * The detected-ref card above the tabs (buildDetectedRefCard(), via maybeRenderDetectedRefBlock())
 * only appears for a trackid whose referenced object didn't show up in its matching Documents-tab
 * table (see resolveDetectedRefTableCheck()) - for one that did (e.g. a recent quotation the
 * trackid points to), nothing above the tabs ever acknowledged it, and this section fell back to
 * the plain "no linked document" empty state despite already knowing exactly which document the
 * mail is about. detectedRefLinkable below covers that gap : whenever detectedRef exists and
 * isn't linked yet, a Link card is shown regardless of whether it's also visible in the Documents
 * tab or in the above-tabs block. When the above-tabs block IS shown for it, this section instead
 * stays hidden entirely to avoid showing the same document's Link button twice.
 *
 * Called from maybeRenderDetectedRefBlock() (detectedRef/detectedRefObjectData changed) and from
 * renderLinkedDocuments() (lastLinkedDocumentsList changed).
 */
function updateInfoTabLinkedDocumentsSection(){
    let container = document.getElementById('info-linked-documents-container');
    let listEl = document.getElementById('info-linked-list');
    let emptyEl = document.getElementById('info-linked-empty');
    if(!container || !listEl || !emptyEl){
        return;
    }

    if(!crmConnectorEnabled){
        // Whole section (and its CTA to the Link tab) needs the crmClientConnector module -
        // see the discreet notice shown instead, near the top of this tab.
        container.classList.add('hidden-field');
        return;
    }

    let hasLinked = lastLinkedDocumentsList.length > 0;

    if(!hasLinked && detectedRefCardVisible()){
        // The detected-ref card above the tabs already covers this mail, nothing to add here.
        container.classList.add('hidden-field');
        return;
    }

    container.classList.remove('hidden-field');

    listEl.innerHTML = '';

    if(hasLinked){
        lastLinkedDocumentsList.forEach((item) => listEl.appendChild(buildLinkedDocCard(item)));
        listEl.classList.remove('hidden-field');
        emptyEl.classList.add('hidden-field');
        return;
    }

    let detectedRefLinkable = detectedRef && detectedRefMeta && linkedDocumentsFetched
        && !linkedDocumentKeys.has(detectedRef.type+':'+detectedRef.id);

    if(detectedRefLinkable){
        // detectedRefObjectData may still be null at this point (its own fetch is independent of
        // linkedDocumentsFetched) - mapSearchResultItem()/buildSearchResultCard() both cope fine
        // with a bare {id}, falling back to "#id" for the ref and leaving the other fields blank
        // until detectedRefObjectData arrives and this function runs again.
        let mapped = mapSearchResultItem(detectedRef.type, detectedRefObjectData || {id: detectedRef.id});
        listEl.appendChild(buildSearchResultCard(mapped));
        listEl.classList.remove('hidden-field');
        emptyEl.classList.add('hidden-field');
        return;
    }

    listEl.classList.add('hidden-field');
    emptyEl.classList.remove('hidden-field');
}

/**
 * Header (type/ref/status) + fields (ref client|supplier, date, total) common to every "document
 * card" built from a {type, id, ref, refClient, refSupplier, statusCode, date, totalTtc} item -
 * an already-linked document (buildLinkedDocCard()) or a search-to-link result
 * (buildSearchResultCard()). Callers append their own .linked-doc-card__actions row. The type
 * label is deliberately styled discreet/secondary (small, uppercase, muted grey - see
 * .linked-doc-card__type in popup.css) since the ref is what a user actually recognizes a
 * document by, not its type. The status badge is built from statusCode via
 * getDetectedRefStatusInfo() rather than from the backend's own status label - see
 * buildLinkedDocCard()'s callers for why (long, sometimes HTML-entity encoded, e.g. a supplier
 * order's raw label is "Tous les produits reçus - Factur&eacute;e").
 * @param {{type:string, id:number, ref:?string, refClient:?string, refSupplier:?string, statusCode:?number, date:?number, totalTtc:?number}} item
 * @returns {{card:HTMLElement, fields:HTMLElement}} card (header already appended) and fields
 *          (NOT appended yet - the "already linked" card appends it on its own row, the
 *          search-to-link card puts it on the same row as its Link action, see their own
 *          functions below)
 */
function buildDocCardBase(item){
    let meta = dolLib.getDolibarrObjectTypeMeta(item.type);
    let locale = navigator.language || navigator.browserLanguage || (navigator.languages || ['en'])[0];

    let card = document.createElement('div');
    card.classList.add('linked-doc-card');

    let header = document.createElement('div');
    header.classList.add('linked-doc-card__header');

    let type = document.createElement('span');
    type.classList.add('linked-doc-card__type');
    type.textContent = meta ? chrome.i18n.getMessage(meta.labelKey) : item.type;
    header.appendChild(type);

    let ref = document.createElement('a');
    ref.classList.add('linked-doc-card__ref');
    ref.textContent = item.ref || ('#'+item.id);
    let refUrl = dolLib.getDolibarrCardUrl(confDolibarUrl, item.type, item.id);
    if(refUrl){
        ref.href = refUrl;
        ref.target = '_blank';
    }
    header.appendChild(ref);

    let statusInfo = getDetectedRefStatusInfo(item.type, item.statusCode);
    if(statusInfo){
        let status = document.createElement('span');
        status.classList.add('badge', 'badge-status'+statusInfo.code);
        status.textContent = statusInfo.label;
        header.appendChild(status);
    }

    card.appendChild(header);

    let fields = document.createElement('div');
    fields.classList.add('linked-doc-card__fields');

    let addField = (label, value) => {
        if(value === null || value === undefined || value === ''){
            return;
        }
        let field = document.createElement('span');
        field.classList.add('linked-doc-card__field');
        let fieldLabel = document.createElement('span');
        fieldLabel.classList.add('linked-doc-card__field-label');
        fieldLabel.textContent = label+' : ';
        field.appendChild(fieldLabel);
        field.append(value);
        fields.appendChild(field);
    };

    if(item.refSupplier){
        addField(chrome.i18n.getMessage('RefSupplier'), item.refSupplier);
    }else if(item.refClient){
        addField(chrome.i18n.getMessage('RefClient'), item.refClient);
    }
    if(item.date){
        addField(chrome.i18n.getMessage('Date'), new Date(item.date * 1000).toLocaleDateString(locale));
    }
    if(item.totalTtc !== null && item.totalTtc !== undefined){
        addField(chrome.i18n.getMessage('Total'), new Intl.NumberFormat(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(item.totalTtc));
    }

    return {card, fields};
}

/**
 * One linked document, as a card (see buildDocCardBase()) with an unlink action.
 * @param {{type:string, id:number, ref:?string, refClient:?string, refSupplier:?string, statusCode:?number, date:?number, totalTtc:?number}} item
 */
function buildLinkedDocCard(item){
    let {card, fields} = buildDocCardBase(item);
    if(fields.childNodes.length > 0){
        card.appendChild(fields);
    }

    let actions = document.createElement('div');
    actions.classList.add('linked-doc-card__actions');
    actions.appendChild(dolLib.buildConfirmDropdown({
        triggerLabel: '⋯',
        triggerTitle: chrome.i18n.getMessage('Actions'),
        confirmLabel: chrome.i18n.getMessage('Unlink'),
        danger: true,
        onConfirm: () => {
            // unlinkDocument() always calls loadLinkedDocuments() itself, which rebuilds every
            // rendering of the linked-documents list (the "Lier" tab's and the Info tab's, see
            // renderLinkedDocuments()/updateInfoTabLinkedDocumentsSection()) from scratch - no
            // manual DOM patching needed here, this card included.
            unlinkDocument(item.type, item.id);
        }
    }));
    card.appendChild(actions);

    return card;
}

/**
 * One search-to-link result, as a card (see buildDocCardBase()) with a Link action - the
 * search-to-link list's answer to the same "not linked yet" case buildLinkedDocCard() covers for
 * already-linked documents. Unlike that card's ⋯ dropdown (which floats in the top-right corner),
 * the Link button sits on the same row as the fields (see .linked-doc-card__fields-row in
 * popup.css) rather than on its own row below them - there's only ever this one action here, so
 * it doesn't need a dropdown or its own row.
 * @param {{type:string, id:number, ref:?string, refClient:?string, refSupplier:?string, statusCode:?number, date:?number, totalTtc:?number}} item
 */
function buildSearchResultCard(item){
    let {card, fields} = buildDocCardBase(item);

    let actions = document.createElement('div');
    actions.classList.add('linked-doc-card__actions');

    let linkBtn = document.createElement('button');
    linkBtn.type = 'button';
    linkBtn.classList.add('btn', 'btn-primary');
    linkBtn.textContent = chrome.i18n.getMessage('Link');
    linkBtn.addEventListener('click', (event) => {
        event.preventDefault();
        linkBtn.disabled = true;
        linkDocument(item.type, item.id, (success, errorMsg) => {
            if(success || (errorMsg && errorMsg.indexOf('Duplicate entry') !== -1)){
                card.remove();
                dolLib.showToast(chrome.i18n.getMessage('LinkSuccess'), 'success');
            }else{
                linkBtn.disabled = false;
                dolLib.showToast(chrome.i18n.getMessage('LinkError')+' ('+errorMsg+')', 'error');
            }
        });
    });
    actions.appendChild(linkBtn);

    let fieldsRow = document.createElement('div');
    fieldsRow.classList.add('linked-doc-card__fields-row');
    fieldsRow.appendChild(fields);
    fieldsRow.appendChild(actions);
    card.appendChild(fieldsRow);

    return card;
}

/**
 * Skeleton placeholder card (shimmering grey bars, see .text-placeholder in global.css) shown in
 * the search-to-link results while searchDocumentsToLink()'s requests (one per document type)
 * are in flight, so the user gets an immediate "search is running" signal instead of the results
 * list staying empty and unchanged until every request resolves - see renderSearchResultsSkeleton().
 */
function buildSearchResultSkeletonCard(){
    let card = document.createElement('div');
    card.classList.add('linked-doc-card', 'linked-doc-card--skeleton');

    let header = document.createElement('div');
    header.classList.add('linked-doc-card__header');
    header.innerHTML = '<div class="text-placeholder --short"></div>'
        + '<div class="text-placeholder --medium linked-doc-card__skeleton-ref"></div>';
    card.appendChild(header);

    let fields = document.createElement('div');
    fields.classList.add('linked-doc-card__fields');
    fields.innerHTML = '<div class="text-placeholder --medium"></div>';
    card.appendChild(fields);

    return card;
}

/**
 * Replaces the search-to-link results with a handful of skeleton cards - called synchronously
 * when a search starts, before any of its requests have resolved.
 */
function renderSearchResultsSkeleton(){
    let resultsEl = document.getElementById('link-search-results');
    resultsEl.innerHTML = '';
    for(let i = 0; i < 3; i++){
        resultsEl.appendChild(buildSearchResultSkeletonCard());
    }
}

/**
 * Maps one raw object from a Dolibarr REST API list (GET /orders, /proposals, ...) into the
 * {type, id, ref, refClient, refSupplier, statusCode, date, totalTtc} shape buildDocCardBase()
 * expects - the search-to-link results' equivalent of what getEmailLinkLinkedObjects() already
 * does server-side for already-linked documents (see api_crmclientconnector.class.php), since
 * here the raw Dolibarr objects come straight from the client-side search instead. Field names
 * (ref_client/ref_supplier, statut vs status, date/date_commande/datep) vary by document type -
 * not every field applies to every type, left null when absent.
 * @param {string} type short type code (see DOLIBARR_OBJECT_TYPES)
 * @param {Object} rawItem raw object as returned by the Dolibarr REST API
 * @returns {{type:string, id:number, ref:?string, refClient:?string, refSupplier:?string, statusCode:?number, date:?number, totalTtc:?number}}
 */
function mapSearchResultItem(type, rawItem){
    return {
        type: type,
        id: rawItem.id,
        ref: rawItem.ref,
        refClient: rawItem.ref_client || null,
        refSupplier: rawItem.ref_supplier || null,
        statusCode: (rawItem.statut !== undefined && rawItem.statut !== null && rawItem.statut !== '')
            ? parseInt(rawItem.statut)
            : ((rawItem.status !== undefined && rawItem.status !== null && rawItem.status !== '') ? parseInt(rawItem.status) : null),
        date: rawItem.date || rawItem.date_commande || rawItem.datep || null,
        totalTtc: (rawItem.total_ttc !== undefined && rawItem.total_ttc !== null && rawItem.total_ttc !== '') ? parseFloat(rawItem.total_ttc) : null
    };
}

function unlinkDocument(type, elementid, onDone){
    let endpoint = 'crmclientconnector/emaillinks/link'
        + '?accountEmail=' + encodeURIComponent(ownerAccountEmail)
        + '&msgId=' + encodeURIComponent(ownerMsgId)
        + '&type=' + encodeURIComponent(type)
        + '&elementid=' + encodeURIComponent(elementid);

    dolLib.callDolibarrApi(endpoint, {}, 'DELETE', {}, ()=>{
        LOG('document unlinked', type, elementid);
        loadLinkedDocuments();
        dolLib.showToast(chrome.i18n.getMessage('UnlinkSuccess'), 'success');
        if(onDone){ onDone(true); }
    }, (errorMsg)=>{
        LOG('unlink failed', errorMsg);
        dolLib.showToast(chrome.i18n.getMessage('UnlinkError')+' ('+errorMsg+')', 'error');
        if(onDone){ onDone(false); }
    });
}

function linkDocument(type, elementid, onDone){
    dolLib.callDolibarrApi(
        'crmclientconnector/emaillinks/link',
        {},
        'POST',
        JSON.stringify({
            accountEmail: ownerAccountEmail,
            msgId: ownerMsgId,
            type: type,
            elementid: elementid
        }),
        ()=>{
            LOG('document linked', type, elementid);
            loadLinkedDocuments();
            if(onDone){ onDone(true); }
        },
        (errorMsg)=>{
            LOG('link failed', errorMsg);
            // The document may in fact already be linked (e.g. a stale search result, or
            // linked from another window) - Dolibarr's unique index rejects the duplicate with
            // a 500. Refresh the linked list either way so the UI reflects reality.
            loadLinkedDocuments();
            if(onDone){ onDone(false, errorMsg); }
        }
    );
}

function searchDocumentsToLink(term){
    let resultsEl = document.getElementById('link-search-results');

    if(!term || term.length < 2){
        resultsEl.innerHTML = '';
        return;
    }

    renderSearchResultsSkeleton();

    let selectedType = document.getElementById('link-search-type').value;
    let typesToSearch = selectedType
        ? [[selectedType, dolLib.DOLIBARR_OBJECT_TYPES[selectedType]]]
        : Object.entries(dolLib.DOLIBARR_OBJECT_TYPES);

    let allResults = [];
    let errors = [];
    let pending = typesToSearch.length;

    typesToSearch.forEach(([type, meta]) => {
        dolLib.callDolibarrApi(meta.api, {
            limit: 10,
            sqlfilters: "(t.ref:like:'%"+term+"%')"
        }, 'GET', {}, (resData)=>{
            if(Array.isArray(resData)){
                resData.forEach((rawItem) => {
                    if(!linkedDocumentKeys.has(type+':'+rawItem.id)){
                        allResults.push(mapSearchResultItem(type, rawItem));
                    }
                });
            }
            pending--;
            if(pending === 0){
                renderSearchResults(allResults, errors);
            }
        }, (errorMsg)=>{
            LOG('searchDocumentsToLink: '+meta.api+' failed', errorMsg);
            errors.push({type: type, errorMsg: errorMsg});
            pending--;
            if(pending === 0){
                renderSearchResults(allResults, errors);
            }
        });
    });
}

function renderSearchResults(results, errors){
    let resultsEl = document.getElementById('link-search-results');
    resultsEl.innerHTML = '';

    if(results.length === 0){
        let empty = document.createElement('div');
        empty.classList.add('opacitymedium');
        if(errors && errors.length > 0){
            empty.textContent = chrome.i18n.getMessage('SearchDocumentToLinkError')+' ('+errors[0].errorMsg+')';
        }else{
            empty.textContent = chrome.i18n.getMessage('SearchDocumentToLinkNoResults');
        }
        resultsEl.appendChild(empty);
        return;
    }

    results.forEach((item) => resultsEl.appendChild(buildSearchResultCard(item)));
}

/**
 * Point 3 : scan the mail's subject/body for ref-shaped strings matching Dolibarr's active
 * numbering patterns (crmclientconnector numberingpatterns/ endpoint), and suggest linking any
 * match that corresponds to a real, existing document.
 */
function initDetectedRefsSuggestions(){
    let container = document.getElementById('link-detected-refs');
    if(!message){
        return;
    }

    dolLib.callDolibarrApi('crmclientconnector/numberingpatterns', {}, 'GET', {}, (numberingData)=>{
        let patterns = dolLib.buildRefDetectionPatterns(numberingData);
        let text = (message.subject || '') + ' ' + (messageBody && messageBody.txt ? messageBody.txt : '');
        let detected = dolLib.detectDolibarrRefsInText(text, patterns);

        // De-duplicate by type+ref
        let seen = new Set();
        detected = detected.filter((entry) => {
            let key = entry.type+':'+entry.ref;
            if(seen.has(key)){ return false; }
            seen.add(key);
            return true;
        });

        populateDetectedRefsDatalist(detected);

        if(container){
            detected.forEach((entry) => verifyAndSuggestDetectedRef(entry, container));
        }
    }, (errorMsg)=>{
        LOG('numberingpatterns fetch failed', errorMsg);
    }, true);
}

/**
 * Feed the refs detected in the mail into the search input's <datalist>, so the user can pick
 * one from the native autocomplete instead of retyping/copy-pasting it - regardless of whether
 * it was verified to match a real document (unlike the inline suggestion banner above, this is
 * just a typing aid for the search box).
 * @param {Array<{type: string, ref: string}>} detected
 */
function populateDetectedRefsDatalist(detected){
    let datalist = document.getElementById('link-detected-refs-datalist');
    if(!datalist){
        return;
    }

    datalist.innerHTML = '';
    detected.forEach((entry) => {
        let option = document.createElement('option');
        option.value = entry.ref;
        datalist.appendChild(option);
    });
}

function verifyAndSuggestDetectedRef(entry, container){
    let meta = dolLib.getDolibarrObjectTypeMeta(entry.type);
    if(!meta){
        return;
    }

    dolLib.callDolibarrApi(meta.api, {
        limit: 1,
        sqlfilters: "(t.ref:='"+entry.ref+"')"
    }, 'GET', {}, (resData)=>{
        if(!Array.isArray(resData) || resData.length === 0){
            return; // Ref-shaped string but no matching document, not worth suggesting
        }

        let matchedId = resData[0].id;
        if(linkedDocumentKeys.has(entry.type+':'+matchedId)){
            return; // already linked to this mail, nothing to suggest
        }

        let suggestion = document.createElement('div');
        suggestion.classList.add('alert', 'alert-info');

        let text = document.createElement('span');
        text.textContent = chrome.i18n.getMessage('DolibarrRefDetected')+' '+chrome.i18n.getMessage(meta.labelKey)+' '+entry.ref;
        suggestion.appendChild(text);

        let linkBtn = document.createElement('button');
        linkBtn.type = 'button';
        linkBtn.classList.add('btn', 'btn-primary');
        linkBtn.textContent = chrome.i18n.getMessage('Link');
        linkBtn.addEventListener('click', (event) => {
            event.preventDefault();
            linkBtn.disabled = true;
            linkDocument(entry.type, matchedId, (success, errorMsg) => {
                if(success || (errorMsg && errorMsg.indexOf('Duplicate entry') !== -1)){
                    suggestion.remove();
                    dolLib.showToast(chrome.i18n.getMessage('LinkSuccess'), 'success');
                }else{
                    linkBtn.disabled = false;
                    dolLib.showToast(chrome.i18n.getMessage('LinkError')+' ('+errorMsg+')', 'error');
                }
            });
        });
        suggestion.appendChild(linkBtn);

        container.appendChild(suggestion);
        container.classList.remove('hidden-field');
    }, (errorMsg)=>{
        LOG('verifyAndSuggestDetectedRef failed for', entry, errorMsg);
    });
}
