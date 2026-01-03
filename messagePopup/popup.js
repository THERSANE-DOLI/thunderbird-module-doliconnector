import * as dolLib from '../global.lib.js';
import * as cryptoLib from '../crypto.lib.js';

import {jsonToTable, searchPhonesInString, sanitizeEmail, sanitizeDomain} from "../global.lib.js";

async function getEmailAccountFromBackground(messageId) {
    const response = await browser.runtime.sendMessage({
        type: "getEmailAccount",
        messageId
    });

    return response.email;
}

/**
 * Afficher l'écran de déverrouillage
 */
async function showUnlockScreen(configData) {
        displayTpl("unlock-screen");
        
        const unlockButton = document.getElementById("unlock-button");
        const passwordInput = document.getElementById("unlock-password-input");
        const errorDiv = document.getElementById("unlock-error");
        
        // Permettre de valider avec Entrée
        passwordInput.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                unlockButton.click();
            }
        });
        
        unlockButton.addEventListener("click", async function() {
            const password = passwordInput.value;
            errorDiv.textContent = "";
            
            if (!password || password.length === 0) {
                errorDiv.textContent = browser.i18n.getMessage("MasterPasswordPlaceholder");
                return;
            }
            
            try {
                // Tenter de déchiffrer la clé API pour valider le mot de passe
                await cryptoLib.decryptData(configData.dolibarrApiKey, password);
                
                // Si réussi, stocker le mot de passe en cache
                dolLib.setMasterPassword(password);
                
                // Masquer l'écran de déverrouillage
                document.getElementById("unlock-screen").classList.add("hidden-field");
                
                // Recharger la popup
                window.location.reload();
            } catch (error) {
                errorDiv.textContent = browser.i18n.getMessage("WrongPassword");
                passwordInput.value = "";
                passwordInput.focus();
            }
        });
        
        passwordInput.focus();
}

// Fonction principale async
(async function initPopup() {
    // first need to translate page before add dom events
    dolLib.localizeHtmlPage();
    
    // Vérifier si un mot de passe maître est requis
    let configData = await browser.storage.local.get({
        useMasterPassword: false,
        dolibarrApiKey: ''
    });
    
    console.log('[Dolibarr Popup Debug] Configuration:', {
        useMasterPassword: configData.useMasterPassword,
        hasApiKey: !!configData.dolibarrApiKey,
        apiKeyType: typeof configData.dolibarrApiKey,
        hasMasterPasswordInCache: !!dolLib.getMasterPassword()
    });
    
    // Si un mot de passe maître est requis et pas encore entré
    if (configData.useMasterPassword && !dolLib.getMasterPassword()) {
        console.log('[Dolibarr Popup Debug] Mot de passe maître requis - affichage écran déverrouillage');
        await showUnlockScreen(configData);
        return; // Arrêter l'exécution jusqu'au déverrouillage
    }
    
    console.log('[Dolibarr Popup Debug] Pas de mot de passe requis ou déjà déverrouillé - chargement normal');

    // The user clicked our button, get the active tab in the current window using
    // the tabs API.
    let tabs = await messenger.tabs.query({ active: true, currentWindow: true });

    // Get the message currently displayed in the active tab, using the
    // messageDisplay API. Note: This needs the messagesRead permission.
    // The returned message is a MessageHeader object with the most relevant
    // information.

    let message = await messenger.messageDisplay.getDisplayedMessage(tabs[0].id);
    let messageBody = message ? await dolLib.getMessageBody(message.id) : '';


    // Request the full message to access its full set of headers.
    // let full = await messenger.messages.getFull(message.id);
    // document.getElementById("received").textContent = full.headers.received[0];

    let checkConfig = await dolLib.checkConfig();

    // Extract email from author
    let authorEmail = message ? dolLib.extractEmailAddressFromString(message.author)[0] : '';

    //Filter on propal objects status
    let propalDisplayStatus = await dolLib.filterPropalStatus();

    let confDolibarUrl = await dolLib.getDolibarrUrl();

    let config = await browser.storage.local.get({dolibarrUseNotes: false});

    if(!checkConfig){
        displayTpl("check-module-config");
    }else{
        displayTpl("main-popup");


        initNotesForMessage();
        document.querySelectorAll('textarea.autosize').forEach(textarea => dolLib.textareaAutosize(textarea))

        // Get contact infos

        // Sécuriser l'email contre les injections SQL
        const safeAuthorEmail = sanitizeEmail(authorEmail);
        
        if (!safeAuthorEmail) {
            console.error('[Dolibarr Security] Email invalide, recherche annulée');
            setSocInfos({});
            return;
        }
        
        dolLib.callDolibarrApi('contacts', {
            limit : 5,
            sortfield: 't.rowid',
            sortorder: 'DESC',
            sqlfilters: "(t.email:like:'"+safeAuthorEmail+"')"
        }, 'GET', {}, (resData)=>{

            resData = resData.pop();

            if(parseInt(resData.socid) > 0){

                // Populate company data
                setSocInfos({
                    id: resData.socid,
                    name: resData.socname
                });

                loadDocumentsInfos({
                    socId : resData.socid
                })

            }else{
                setSocInfos({
                    id: 0, // In this case contact is probaly not attached to soc
                    name: 'Contact found but not attached to company'
                })
            }
            

        },(errorMsg)=>{
            console.log("contacts not found now search Thirdparties And Populate By Email " + authorEmail);
            searchThirdpartiesAndPopulateByEmail(authorEmail);
        });


    }


    function searchThirdpartiesAndPopulateByEmail(authorEmail){
        // Sécuriser l'email contre les injections SQL
        const safeAuthorEmail = sanitizeEmail(authorEmail);
        
        if (!safeAuthorEmail) {
            console.error('[Dolibarr Security] Email invalide, recherche annulée');
            setSocInfos({});
            return;
        }
        
        // console.error(msg);
        dolLib.callDolibarrApi('thirdparties', {
            limit : 1,
            sortfield: 't.rowid',
            sortorder: 'DESC',
            sqlfilters: "(t.email:like:'"+safeAuthorEmail+"')"
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
        
        // Sécuriser le domaine contre les injections SQL
        const safeDomain = sanitizeDomain(emailDomain);
        
        if (!safeDomain) {
            console.error('[Dolibarr Security] Domaine invalide, recherche annulée');
            setSocInfos({});
            return;
        }
        
        getExcludedDomains().then(emailPublicDomains => {
            if(!emailPublicDomains.includes(emailDomain.toLowerCase())){
                console.log("not public email " + emailDomain);

                // console.error(msg);
                dolLib.callDolibarrApi('thirdparties', {
                    limit : 5,
                    sortfield: 't.rowid',
                    sortorder: 'DESC',
                    sqlfilters: "(t.email:like:'%@"+safeDomain+"')"
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



            let newThirdURL = new URL(confDolibarUrl + "societe/card.php");
            newThirdURL.searchParams.set('action', "create");
            newThirdURL.searchParams.set('email', authorEmail);
            newThirdURL.searchParams.set('name', soc.name);
            newThirdURL.searchParams.set('phone',  soc.phone_pro);
            newSocieteLink.href = newThirdURL;

            titleDiv.textContent =  soc.name;

            let newContactURL = new URL(confDolibarUrl + "contact/card.php");
            newContactURL.searchParams.set('action', "create");
            newContactURL.searchParams.set('email', authorEmail);
            newContactURL.searchParams.set('firstname', dolLib.parseName(soc.name).firstName);
            newContactURL.searchParams.set('lastname', dolLib.parseName(soc.name).lastName);
            newContactURL.searchParams.set('phone_pro',  soc.phone_pro);
            newContactURL.searchParams.set('phone_mobile',  soc.phone_mobile);
            newContactURL.searchParams.set('phone_perso',  soc.phone_perso);
            newContactLink.href = newContactURL;


            return;
        }

        displayTpl("soc-link");

        titleDiv.textContent =  soc.name;
        let url = new URL(confDolibarUrl + "societe/card.php");
        url.searchParams.set('socid', soc.id);
        linkSociete.href = url;

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

            if(!Array.isArray(dataLastPropals) || dataLastPropals.length == 0){
                // No contact found in database
                return;
            }

            let tableItems = [];
            dataLastPropals.forEach((propal) => {

                let item = {
                    'ref': '',
                    'refClient': '',
                    'date': '',
                    'total_ht': ''
                }

                item.ref = {
                    html: '<a href="'+ confDolibarUrl + 'comm/propal/card.php?id=' + propal.id+'" >' + propal.ref + '</a>',
                    hightLight : propal.ref,
                    class : 'text-center'
                };

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
                    'total_ht': chrome.i18n.getMessage('Total')
                },
                tableItems,
                document.getElementById("data-from-dolibarr"),
                'dolibarr-table dolibarr-table-stripped',
                message.subject  + ' ' + messageBody.html
            );

        },(errorMsg)=>{
            console.error("setQuotationsInfos" + errorMsg);
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

            if(!Array.isArray(dataLastOrders) || dataLastOrders.length == 0){
                // No contact found in database
                return;
            }

            let tableItems = [];
            dataLastOrders.forEach((order) => {

                let item = {
                    'ref': '',
                    'refClient': '',
                    'date': '',
                    'total_ht': ''
                }

                item.ref = {
                    html: '<a href="'+ confDolibarUrl + 'commande/card.php?id=' + order.id+'" >' + order.ref + '</a>',
                    hightLight : order.ref,
                    class : 'text-center'
                };

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
                    'total_ht': chrome.i18n.getMessage('Total')
                },
                tableItems,
                document.getElementById("data-from-dolibarr"),
                'dolibarr-table dolibarr-table-stripped',
                message.subject  + ' ' + messageBody.html
            );


        },(errorMsg)=>{
            console.error("setQuotationsInfos" + errorMsg);
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

        if(!Array.isArray(dataLastInvoices) || dataLastInvoices.length == 0){
            // No contact found in database
            return;
        }

        let tableItems = [];
        dataLastInvoices.forEach((invoice) => {

            let item = {
                'ref': '',
                'refClient': '',
                'date': '',
                'total_ht': ''
            }

            item.ref = {
                html: '<a href="'+ confDolibarUrl + 'compta/facture/card.php?id=' + invoice.id+'" >' + invoice.ref + '</a>',
                hightLight : invoice.ref,
                class : 'text-center'
            };

            
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
                'total_ht': chrome.i18n.getMessage('Total')
            },
            tableItems,
            document.getElementById("data-from-dolibarr"),
            'dolibarr-table dolibarr-table-stripped',
            message.subject  + ' ' + messageBody.html
        );


    },(errorMsg)=>{
        console.error("setQuotationsInfos " + errorMsg);
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

        if(!Array.isArray(dataLastSupplierorders) || dataLastSupplierorders.length == 0){
            // No contact found in database
            return;
        }

        let tableItems = [];
        dataLastSupplierorders.forEach((supplierorder) => {

            let item = {
                'ref': '',
                'refFourn': '',//todo translate
                'date': '',
                'total_ht': ''
            }

            item.ref = {
                html: '<a href="'+ confDolibarUrl + 'fourn/commande/card.php?id=' + supplierorder.id+'" >' + supplierorder.ref + '</a>',
                hightLight : supplierorder.ref,
                class : 'text-center'
            };

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
                'total_ht': chrome.i18n.getMessage('Total')
            },
            tableItems,
            document.getElementById("data-from-dolibarr")
        );


    },(errorMsg)=>{
        console.error("setQuotationsInfos : " + errorMsg);
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

})(); // Fin de la fonction initPopup IIFE