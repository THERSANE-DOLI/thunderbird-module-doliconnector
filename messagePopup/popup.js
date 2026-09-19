import * as dolLib from '../global.lib.js';

import {jsonToTable, searchPhonesInString} from "../global.lib.js";

    const LOG = (...args) => console.log('[DoliConnector popup]', ...args);

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

    // Quotation form headers (X-Quotation-Mail / X-Quotation-Data) : only trusted when the
    // sender is in the configured trusted senders list, to avoid a forged header hijacking
    // the thirdparty search.
    let quotation = message ? await dolLib.getQuotationHeaders(message.id) : null;
    let quotationTrustedSenders = await dolLib.getQuotationTrustedSenders();
    let quotationActive = !!(quotation && quotation.email && dolLib.isQuotationTrustedSender(authorEmail, quotationTrustedSenders));

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