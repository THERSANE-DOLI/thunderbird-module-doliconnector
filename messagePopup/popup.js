import * as dolLib from '../global.lib.js';

import {jsonToTable, searchPhonesInString} from "../global.lib.js";

    const LOG = (...args) => console.log('[DoliConnector popup]', ...args);

    const POPUP_TABS = ['info', 'documents', 'link'];

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

    // Extract email from author
    let authorEmail = message ? dolLib.extractEmailAddressFromString(message.author)[0] : '';

    // Identity of the account this mail was received on, and its Message-Id : sent along when
    // creating a devis/commande from this popup (see setSocInfos()'s new-quotation-link), so the
    // crmclientconnector module's PROPAL_CREATE/ORDER_CREATE trigger can auto-link the newly
    // created object back to this mail. Same values/convention already used for notes (see
    // initNotesForMessage() below : accountEmail via getEmailAccountFromBackground(), msgId via
    // message.headerMessageId).
    let ownerAccountEmail = message ? await getEmailAccountFromBackground(message.id) : null;
    let ownerMsgId = message ? message.headerMessageId : null;

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

    //Filter on propal objects status
    let propalDisplayStatus = await dolLib.filterPropalStatus();

    let confDolibarUrl = await dolLib.getDolibarrUrl();

    let config = await browser.storage.local.get({dolibarrUseNotes: false});

    if(!checkConfig){
        LOG('module not configured, showing check-module-config template');
        displayTpl("check-module-config");
    }else{
        displayTpl("main-popup");


        initNotesForMessage();
        document.querySelectorAll('textarea.autosize').forEach(textarea => dolLib.textareaAutosize(textarea))
        initPopupTabs();
        initDocumentsTabBadge();

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
        try {
            let domains = await fetch(browser.runtime.getURL("exclude-domains.json"))
                .then(response => response.json())
                .catch(error => console.error("Erreur de chargement du JSON :", error));

            let apiDomain = await new Promise((resolve, reject) => {

                // TODO add cache
                dolLib.callDolibarrApi('crmclientconnector/excludeddomains', {
                    sqlfilters: "(t.active:=:1)"
                }, 'GET', {}, (resData)=>{
                    resolve(resData);
                }, (err) => {
                    reject("fail call API crmclientconnector/excludeddomains or nothing into");
                },true);
            }).then((domainList) => {
                domains = domains.concat(domainList);
            });

            return domains;
        } catch (error) {
            console.error("Erreur dans getExcludedDomains :", error);
            return []; // Retourne un tableau vide en cas d’erreur
        }
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

        // Add soc link
        let linkSociete= document.getElementById("soc-link");
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

            return;
        }

        LOG('thirdparty displayed', soc);
        displayTpl("soc-link");

        titleDiv.textContent =  soc.name;
        let url = new URL(confDolibarUrl + "societe/card.php");
        url.searchParams.set('socid', soc.id);
        linkSociete.href = url;

        if(quotationActive){
            displayTpl("new-quotation-link");
            let newQuotationLink = document.getElementById("new-quotation-link");
            let newQuotationURL = new URL(confDolibarUrl + "comm/propal/card.php");
            newQuotationURL.searchParams.set('action', "create");
            newQuotationURL.searchParams.set('socid', soc.id);
            if(ownerAccountEmail && ownerMsgId){
                newQuotationURL.searchParams.set('accountEmail', ownerAccountEmail);
                newQuotationURL.searchParams.set('msgId', ownerMsgId);
            }
            newQuotationLink.href = newQuotationURL;
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
     * Renders the "detected reference" fallback block, but only once we both
     * know it needs to be shown (the referenced object didn't show up in its
     * matching table - too old, or a type with no table at all) and have the
     * API response for the referenced object (for its ref name).
     */
    function maybeRenderDetectedRefBlock(){
        if(!detectedRefShouldShowBlock || !detectedRefObjectFetchDone){
            LOG('maybeRenderDetectedRefBlock: not ready yet', { detectedRefShouldShowBlock, detectedRefObjectFetchDone });
            return;
        }

        LOG('rendering detected ref block', detectedRef, detectedRefObjectData);
        let block = document.getElementById("dolibarr-detected-ref");
        let textEl = document.getElementById("dolibarr-detected-ref-text");
        let linkEl = document.getElementById("dolibarr-detected-ref-link");
        if(!block || !textEl || !linkEl){
            return;
        }

        let typeLabel = chrome.i18n.getMessage(detectedRefMeta.labelKey);
        let refLabel = (detectedRefObjectData && detectedRefObjectData.ref) ? detectedRefObjectData.ref : ('#' + detectedRef.id);

        textEl.textContent = chrome.i18n.getMessage('DolibarrRefDetected') + ' ' + typeLabel + ' ' + refLabel;
        linkEl.href = dolLib.getDolibarrCardUrl(confDolibarUrl, detectedRef.type, detectedRef.id);

        block.classList.remove('hidden-field');
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

    if (!config.dolibarrUseNotes || !message) {
        return;
    }

    const accountEmail = await getEmailAccountFromBackground(message.id);
    if (!accountEmail) {
        console.warn("Impossible de déterminer l'adresse du compte.");
    }

    let msgId = message.headerMessageId; // ou gFolderDisplay.selectedMessage ?
    let textArea = document.getElementById("dolibarr-note-input");
    let sendCommentBTN = document.getElementById('send-comment');

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


    sendCommentBTN.addEventListener('click', function() {
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
    })
}

/**
 * "Lier" tab : search/link/unlink a devis/commande/facture/... to the mail currently displayed,
 * using the crmclientconnector emaillinks/linkedobjects, emaillinks/link endpoints (needs
 * crmclientconnector module installed in Dolibarr, same as the notes feature above).
 */

let linkTabInitialized = false;
// type+':'+id keys of documents already linked to this mail, so the search results can hide
// them (linking the same document twice hits Dolibarr's unique index and returns a 500).
let linkedDocumentKeys = new Set();

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

function initLinkTab(){
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
 * One linked document, as a card : ref/type/status up top, then whichever of ref client/
 * supplier/date/total the backend sent for that document type (not every field applies to
 * every type - see getEmailLinkLinkedObjects() on the Dolibarr side), and an unlink action.
 * @param {{type:string, id:number, ref:string, refClient:?string, refSupplier:?string, status:?string, statusCode:?number, date:?number, totalTtc:?number}} item
 */
function buildLinkedDocCard(item){
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

    let ref = document.createElement('span');
    ref.classList.add('linked-doc-card__ref');
    ref.textContent = item.ref || ('#'+item.id);
    header.appendChild(ref);

    if(item.status){
        let status = document.createElement('span');
        status.classList.add('badge');
        if(Number.isInteger(item.statusCode) && item.statusCode >= 0 && item.statusCode <= 10){
            status.classList.add('badge-status'+item.statusCode);
        }
        status.textContent = item.status;
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
            unlinkDocument(item.type, item.id, (success) => {
                if(success){
                    card.remove();
                    let listEl = document.getElementById('link-linked-list');
                    if(listEl.children.length === 0){
                        document.getElementById('link-linked-empty').classList.remove('hidden-field');
                        listEl.classList.add('hidden-field');
                    }
                }
            });
        }
    }));
    card.appendChild(actions);

    return card;
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
    resultsEl.innerHTML = '';

    if(!term || term.length < 2){
        return;
    }

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
                resData.forEach((item) => {
                    if(!linkedDocumentKeys.has(type+':'+item.id)){
                        allResults.push({type: type, id: item.id, ref: item.ref});
                    }
                });
            }
            pending--;
            if(pending === 0){
                renderSearchResults(allResults, term, errors);
            }
        }, (errorMsg)=>{
            LOG('searchDocumentsToLink: '+meta.api+' failed', errorMsg);
            errors.push({type: type, errorMsg: errorMsg});
            pending--;
            if(pending === 0){
                renderSearchResults(allResults, term, errors);
            }
        });
    });
}

function renderSearchResults(results, term, errors){
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

    let tableItems = results.map((item) => {
        let meta = dolLib.getDolibarrObjectTypeMeta(item.type);
        return {
            type: meta ? chrome.i18n.getMessage(meta.labelKey) : item.type,
            ref: item.ref || ('#'+item.id),
            action: {
                html: '<button type="button" class="btn-tiny-action link-link-btn" '
                    +'data-type="'+item.type+'" data-id="'+item.id+'">'
                    +chrome.i18n.getMessage('Link')+'</button>'
            }
        };
    });

    dolLib.jsonToTable(
        {type: chrome.i18n.getMessage('Type'), ref: chrome.i18n.getMessage('Ref'), action: ''},
        tableItems,
        resultsEl,
        'dolibarr-table dolibarr-table-stripped',
        term
    );

    resultsEl.querySelectorAll('.link-link-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            btn.disabled = true;
            linkDocument(btn.getAttribute('data-type'), btn.getAttribute('data-id'), (success, errorMsg) => {
                if(success || (errorMsg && errorMsg.indexOf('Duplicate entry') !== -1)){
                    btn.closest('tr')?.remove();
                    dolLib.showToast(chrome.i18n.getMessage('LinkSuccess'), 'success');
                }else{
                    btn.disabled = false;
                    dolLib.showToast(chrome.i18n.getMessage('LinkError')+' ('+errorMsg+')', 'error');
                }
            });
        });
    });
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