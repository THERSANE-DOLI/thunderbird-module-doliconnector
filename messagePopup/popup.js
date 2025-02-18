import * as dolLib from '../global.lib.js';
import {searchPhonesInString} from "../global.lib.js";

// Localisation de la page
dolLib.localizeHtmlPage();

   // The user clicked our button, get the active tab in the current window using
    // the tabs API.
    let tabs = await messenger.tabs.query({ active: true, currentWindow: true });

    // Get the message currently displayed in the active tab, using the
        // messageDisplay API. Note: This needs the messagesRead permission.
        // The returned message is a MessageHeader object with the most relevant
        // information.
    let message = await messenger.messageDisplay.getDisplayedMessage(tabs[0].id);
    let messageBody = await dolLib.getMessageBody(message.id);
    let fullMessage = await messenger.messages.getFull(message.id);
    let attachments = await getMessageAttachments(message.id);

        // Request the full message to access its full set of headers.
    // let full = await messenger.messages.getFull(message.id);
    // document.getElementById("received").textContent = full.headers.received[0];

    let checkConfig = await dolLib.checkConfig();

    // Extract email from author
    let authorEmail = dolLib.extractEmailAddressFromString(message.author)[0];

    //Filter on propal objects status
     let propalDisplayStatus = await dolLib.filterPropalStatus();

    let confDolibarrUrl = await dolLib.getDolibarrUrl();

if (!checkConfig) {
  displayTpl("check-module-config");
} else {
  displayTpl("main-popup");



  // Get contact infos

  dolLib.callDolibarrApi(
    'contacts',
    {
      limit: 5,
      sortfield: 't.rowid',
      sortorder: 'DESC',
      sqlfilters: "(t.email:like:'" + authorEmail + "')"
    }, 'GET', {}, (resData) => {
      if (Array.isArray(resData) && resData.length > 0) {
        resData = resData.pop();

        if (parseInt(resData.socid) > 0) {

          // Populate company data
          setSocInfos({ 
            id: resData.socid, 
            name: resData.socname 
          });

          loadDocumentsInfos({ 
              socId: resData.socid 
            })

    function searchThirdpartieAndPopulateByEmailDomain(authorEmail){
        console.log("search for same domain soc");

        let emailDomain = authorEmail.split('@').pop();

        fetch(browser.runtime.getURL("exclude-domains.json"))
            .then(response => response.json())
            .then(emailPublicDomains => {
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
                        console.log("not found ");
                        setSocInfos({});
                    });

                }else{
                    setSocInfos({});
                }
            })
            .catch(error => console.error("Erreur de chargement du JSON :", error));

    }

}

function searchThirdpartieAndPopulateByEmailDomain(authorEmail) {
  console.log("search for same domain soc:", authorEmail);
  // TODO check if email domain isn't in FAI list
  let emailPulbicDomains = [
    'google.com','live.fr','live.com','orange.fr','yopmail.com',
    "orange.fr","hotmail.fr","wanadoo.fr","free.fr","yahoo.fr",
    "hotmail.com","sfr.fr","laposte.net","outlook.fr","live.fr",
    "neuf.fr","aol.com","yahoo.com","bbox.fr","icloud.com",
    "outlook.com","msn.com","cegetel.net",
    "club-internet.fr","gmx.fr","aliceadsl.fr","me.com",
    "numericable.fr","nordnet.fr","protonmail.com",
    "ymail.com","hotmail.be","9online.fr","live.be",
    "libertysurf.fr","live.com","skynet.be","gmail.fr","aol.fr",
    "ac-versailles.fr", "ac-creteil.fr", "ac-amiens.fr", "ac-aix-marseille.fr",
    "ac-besancon.fr", "ac-bordeaux.fr", "ac-caen.fr", "ac-clermont.fr", "ac-dijon.fr",
    "ac-grenoble.fr", "ac-lille.fr", "ac-lyon.fr", "ac-montpellier.fr",
    "ac-nancy-metz.fr", "ac-nantes.fr", "ac-nice.fr", "ac-orleans-tours.fr",
    "ac-paris.fr", "ac-poitiers.fr", "ac-reims.fr", "ac-rennes.fr",
    "ac-rouen.fr", "ac-strasbourg.fr", "ac-toulouse.fr", "ac-limoges.fr",
    "ac-guadeloupe.fr", "ac-guyane.fr", "ac-martinique.fr", "ac-reunion.fr",
    "ac-mayotte.fr", "johnbost.fr", "apajh-yvelines.org", "apajh95.fr", 
    "lamayotte.fr", "fondation-anais.org", "haarp.fr", "avenirapei.org", 
    "hestia78.fr", "apf.asso.fr", "eu.asso.fr", "autisme-en-idf.org",
    "paris.fr", "cergy.fr", "ville-saintouenlaumone.fr", "ville-pontoise.fr"
  ];
  let emailDomain = authorEmail.split('@').pop();

  if(!emailPulbicDomains.includes(emailDomain.toLowerCase())){
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
          console.log("not found ");
          setSocInfos({});
      });

  }else{
      setSocInfos({});
  }
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



          let newThirdURL = new URL(confDolibarrUrl + "societe/card.php");
          newThirdURL.searchParams.set('action', "create");
          newThirdURL.searchParams.set('email', authorEmail);
          newThirdURL.searchParams.set('name', soc.name);
          newThirdURL.searchParams.set('phone',  soc.phone_pro);
          newSocieteLink.href = newThirdURL;

          titleDiv.textContent =  soc.name;

          let newContactURL = new URL(confDolibarrUrl + "contact/card.php");
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
      let url = new URL(confDolibarrUrl + "societe/card.php");
      url.searchParams.set('socid', soc.id);
      linkSociete.href = url;

  }

     /**
     * display propal history
     * @param object confData
     */

     function setQuotationsInfos(confData) {
      let conf = Object.assign({ 
        socId: 0 
      }, confData);
    
      //defaut no filter
      let sqlfilters = '';
      if (filterDraftCancel === true) {
        //propal values ares STATUS_CANCELED -1, STATUS_DRAFT 0
            //from Dolibarr 19 we can use :
            //sqlfilters = '(t.fk_statut:notin:-1,0)';
        sqlfilters = '(t.fk_statut:in:1) OR (t.fk_statut:in:2) OR (t.fk_statut:in:3) OR (t.fk_statut:in:4)';
      
      }
    
      // Appel à l'API Dolibarr pour récupérer les propositions
      return dolLib.callDolibarrApi('proposals', {
          sortfield: 't.rowid',
          sortorder: 'DESC',
          limit: 5,
          thirdparty_ids: conf.socId,
          sqlfilters: sqlfilters
        }, 'GET', {}, (dataLastPropals) => {

          // Stockage global des propositions pour une utilisation ultérieure
          window.proposalsList = dataLastPropals;
    
          if (!Array.isArray(dataLastPropals) || dataLastPropals.length === 0) {
            // Aucune proposition trouvée en base de données
            return;
          }
    
          let tableItems = [];
          dataLastPropals.forEach((propal) => {
            let item = {
              ref: '',
              refClient: '',
              date: '',
              total_ht: ''
            };
    
            item.ref = {
              html:
                '<a href="' +
                confDolibarrUrl +
                'comm/propal/card.php?id=' +
                propal.id +
                '" >' +
                propal.ref +
                '</a>'
            };
    
            // Vérification poussée de ref_client
            if (
              typeof propal.ref_client !== "undefined" &&
              propal.ref_client !== null &&
              propal.ref_client.length > 0
            ) {
              item.refClient = { html: propal.ref_client };

    
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
    
            let dateP = new Date(parseInt(propal.date) * 1000);
            item.date = { html: dateP.toLocaleDateString() };
    
            let formatedNumber = '';
            try {
              formatedNumber = new Intl.NumberFormat([], {
                style: 'currency',
                currency: propal.multicurrency_code
              }).format(parseFloat(propal.total_ht));
            } catch (error) {
              formatedNumber = parseFloat(propal.total_ht);
            }
            item.total_ht = { html: formatedNumber, class: 'text-right' };
    
            tableItems.push(item);
          });
    
          dolLib.jsonToTable(
            {
              ref: chrome.i18n.getMessage('Ref'),
              refClient: chrome.i18n.getMessage('RefClient'),
              date: chrome.i18n.getMessage('Date'),
              total_ht: chrome.i18n.getMessage('Total')
            },
            tableItems,
            document.getElementById("data-from-dolibarr")
          );
        },
        (errorMsg) => {
          console.error("setQuotationsInfos: " + errorMsg);
        }
      );
    }
    

     /**
     * display propal history
     * @param object confData
     */
function setOrdersInfos(confData) {
  let conf = Object.assign({ 
    socId: 0 
  }, confData);

  // Get contact infos  
  return dolLib.callDolibarrApi('orders', {
      sortfield: 't.rowid',
      sortorder: 'DESC',
      limit: 5,
      thirdparty_ids: conf.socId
    }, 'GET', {}, (dataLastOrders) => {

      if (!Array.isArray(dataLastOrders) || dataLastOrders.length == 0) {
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
                    html: '<a href="'+ confDolibarrUrl + 'commande/card.php?id=' + order.id+'" >' + order.ref + '</a>'
                };

          if (typeof order.ref_client !== "undefined" && order.ref_client !== null && order.ref_client.length > 0) {
          item.refClient = { 
              html: order.ref_client 
            };
        }

        let dateP = new Date(parseInt(order.date) * 1000);
        item.date = {
           html: dateP.toLocaleDateString()
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

        item.total_ht = { html: formatedNumber, class: 'text-right' };
        tableItems.push(item);
      });

      dolLib.jsonToTable(
        {
          ref: chrome.i18n.getMessage('Ref'),
          refClient: chrome.i18n.getMessage('RefClient'),
          date: chrome.i18n.getMessage('Date'),
          total_ht: chrome.i18n.getMessage('Total')
        },
        tableItems,
        document.getElementById("data-from-dolibarr")
      );
    },
    (errorMsg) => {
      console.error("setOrdersInfos : " + errorMsg);
    }
  );
}

/**
 * display invoices history
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
                html: '<a href="'+ confDolibarrUrl + 'compta/facture/card.php?id=' + invoice.id+'" >' + invoice.ref + '</a>'
            };

            
            if(typeof invoice.ref_client != undefined  && invoice.ref_client != null && invoice.ref_client.length > 0){
                item.refClient = {
                    html: invoice.ref_client
                };
            }

            let dateP = new Date(parseInt(invoice.date) * 1000);
            item.date = {
                html: dateP.toLocaleDateString()
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
            document.getElementById("data-from-dolibarr")
        );


    },(errorMsg)=>{
        console.error("setQuotationsInfos" + errorMsg);
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
              html: '<a href="'+ confDolibarrUrl + 'fourn/commande/card.php?id=' + supplierorder.id+'" >' + supplierorder.ref + '</a>'
          };

          if(typeof supplierorder.ref_supplier != undefined && supplierorder.ref_supplier != null && supplierorder.ref_supplier.length > 0){
              item.refFourn= {
                  html: supplierorder.ref_supplier
              };
          }

          let dateP = new Date(parseInt(supplierorder.date) * 1000);
          item.date = {
              html: dateP.toLocaleDateString()
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
      console.error("setQuotationsInfos" + errorMsg);
  });

}

function displayTpl(id) {
  let tpl = document.getElementById(id);
  if (!tpl) return;
  tpl.classList.remove("hidden-field");
}

function loadDocumentsInfos(data) {
  setQuotationsInfos(data);
  setOrdersInfos(data);
  setInvoicesInfos(data);
  setSupplierordersInfos(data);
}

/* === Fonctions de recherche dans Thirdparties par email === */
function searchThirdpartiesAndPopulateByEmail(authorEmail) {
  dolLib.callDolibarrApi(
    'thirdparties',
    {
      limit: 1,
      sortfield: 't.rowid',
      sortorder: 'DESC',
      sqlfilters: "(t.email:like:'" + authorEmail + "')"
    },
    'GET',
    {},
    (resData) => {
      console.log("Résultat de searchThirdpartiesAndPopulateByEmail:", resData);
      if (Array.isArray(resData) && resData.length > 0) {
        resData = resData.pop();
        setSocInfos({ id: resData.id, name: resData.name });
        loadDocumentsInfos({ socId: resData.id });
      } else {
        console.log("Aucun résultat exact trouvé, recherche par domaine...");
        searchThirdpartieAndPopulateByEmailDomain(authorEmail);
      }
    },
    (errorMsg) => {
      console.log("Erreur lors de la recherche par email exact:", errorMsg);
      searchThirdpartieAndPopulateByEmailDomain(authorEmail);
    }
  );
}


/* === Conversion d'un Blob en Base64 === */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      resolve(base64data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* === Upload d'un document (optionnel) === */
async function uploadDocument(blob, filename, modulepart, ref, subdir) {
  let base64Content = await blobToBase64(blob);
  let bodyData = {
    "filename": filename,
    "modulepart": modulepart,
    "ref": ref,
    "subdir": subdir,
    "filecontent": base64Content,
    "fileencoding": "base64",
    "overwriteifexists": "0"
  };
  let configData = await browser.storage.local.get({ dolibarrApiKey: '', dolibarrApiUrl: '' });
  let apiKey = configData.dolibarrApiKey;
  let dolUrl = configData.dolibarrApiUrl;
  if (dolUrl.slice(-1) !== '/') { dolUrl += '/'; }
  let url = dolUrl + "api/index.php/documents/upload";
  let response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "DOLAPIKEY": apiKey
    },
    body: JSON.stringify(bodyData)
  });
  if (!response.ok) {
    let errorText = await response.text();
    throw new Error("HTTP " + response.status + ": " + errorText);
  }
  let result = await response.text();
  console.log("Document uploadé:", result);
  return result;
}

/* === Extraction des pièces jointes depuis les parts MIME === */
function getAttachmentsFromParts(parts) {
  let attachments = [];
  if (!parts) return attachments;
  parts.forEach(part => {
    console.log("Traitement d'une part:", part);
    if (part.contentType && (part.contentType.startsWith("application/") || part.contentType.startsWith("image/"))) {
      console.log("PJ détectée par contentType:", part.contentType, "avec name:", part.name);
      if (!part.id && part.partName) {
        part.id = part.partName;
        console.log("Affectation de part.id =", part.id);
      }
      attachments.push(part);
    } else if (part.name && part.name.trim() !== "") {
      console.log("PJ détectée par name:", part.name);
      if (!part.id && part.partName) {
        part.id = part.partName;
        console.log("Affectation de part.id =", part.id);
      }
      attachments.push(part);
    }
    if (part.parts) {
      const subAttachments = getAttachmentsFromParts(part.parts);
      if (subAttachments.length > 0) {
        console.log("Sous-PJ trouvées:", subAttachments);
      }
      attachments = attachments.concat(subAttachments);
    }
  });
  console.log("Liste finale des PJ extraites:", attachments);
  return attachments;
}

/* === Récupération des PJ du message === */
async function getMessageAttachments(messageId) {
  console.log("Récupération du message complet pour l'ID:", messageId);
  let fullMsg = await messenger.messages.getFull(messageId);
  console.log("Message complet obtenu:", fullMsg);
  let attachments = [];
  if (fullMsg.parts) {
    console.log("Exploration de fullMsg.parts pour détecter des PJ...");
    attachments = getAttachmentsFromParts(fullMsg.parts);
    console.log("PJ extraites de fullMsg.parts:", attachments);
  } else {
    console.log("Aucune propriété 'parts' trouvée dans le message.");
  }
  return attachments;
}

function showConfirmationPopup(messageText, proposalUrl) {
  let popup = document.createElement("div");
  popup.id = "confirmation-popup";
  popup.style.position = "fixed";
  popup.style.top = "50%";
  popup.style.left = "50%";
  popup.style.transform = "translate(-50%, -50%)";
  popup.style.backgroundColor = "#fff";
  popup.style.border = "1px solid #000";
  popup.style.padding = "20px";
  popup.style.zIndex = 10000;
  popup.style.maxWidth = "90%";     // Nouvelle ligne
  popup.style.maxHeight = "90%";    // Nouvelle ligne
  popup.style.overflowY = "auto";   // Nouvelle ligne
  popup.innerHTML = `
    <p>${messageText}</p>
    <p><a href="${proposalUrl}" target="_blank">Cliquez ici pour ouvrir le devis dans Dolibarr</a></p>
    <button id="close-confirmation-popup">Fermer</button>
  `;
  document.body.appendChild(popup);
  document.getElementById("close-confirmation-popup").addEventListener("click", function(){
    document.body.removeChild(popup);
  });
}

/* === Signature du devis via l'ID interne === */
async function signProposal(proposalId, note) {
  console.log("Signature du devis avec ID:", proposalId);
  let configData = await browser.storage.local.get({ dolibarrApiKey: '', dolibarrApiUrl: '' });
  let apiKey = configData.dolibarrApiKey;
  let dolUrl = configData.dolibarrApiUrl;
  if (dolUrl.slice(-1) !== '/') { dolUrl += '/'; }
  let url = dolUrl + "api/index.php/proposals/" + proposalId + "/close";
  let bodyData = {
    "status": 2,
    "notrigger": 0,
    "note_private": note
  };
  try {
    let response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DOLAPIKEY": apiKey
      },
      body: JSON.stringify(bodyData)
    });
    if (!response.ok) {
      let errorText = await response.text();
      throw new Error("HTTP " + response.status + ": " + errorText);
    }
    let contentType = response.headers.get("Content-Type");
    let data = contentType && contentType.includes("application/json")
      ? await response.json() : await response.text();
    console.log("Devis signé avec succès:", data);
    return data;
  } catch (err) {
    console.error("Erreur lors de la signature du devis:", err);
    throw err;
  }
}

/* === Recherche du devis par référence, signature et upload des PJ sélectionnées === */
function signProposalByRef(proposalRef, selectedAttachments) {
  dolLib.callDolibarrApi(
    'proposals/ref/' + proposalRef,
    { contact_list: 1 },
    'GET',
    {},
    async (proposalData) => {
      console.log("Devis trouvé via référence:", proposalData);
      if (proposalData && proposalData.id) {
        try {
          await signProposal(proposalData.id, "Devis signé via addon");
          let uploadResults = [];
          if (selectedAttachments.length > 0) {
            for (const att of selectedAttachments) {
              try {
                let fileBlob = await messenger.messages.getAttachmentFile(message.id, att.id);
                console.log("Blob récupéré pour", att.name, ":", fileBlob);
                // Conserver le nom original préfixé par la référence
                let filename = proposalRef + "_" + att.name;
                let subdir = "propale/" + proposalRef;
                let uploadedDoc = await uploadDocument(fileBlob, filename, "propale", proposalRef, subdir);
                console.log("Document uploadé pour", att.name, ":", uploadedDoc);
                uploadResults.push({ attName: att.name, result: "Succès" });
              } catch (uploadErr) {
                console.error("Erreur upload pour", att.name, ":", uploadErr);
                uploadResults.push({ attName: att.name, result: "Erreur" });
              }
            }
          }
          let proposalUrl = confDolibarrUrl + "comm/propal/card.php?id=" + proposalData.id;
          let msg = "Devis signé.";
          if (selectedAttachments.length > 0) {
            msg += "<br/>Résultats de l'upload des pièces jointes :<br/>";
            uploadResults.forEach(r => {
              msg += `${r.attName}: ${r.result}<br/>`;
            });
          }
          showConfirmationPopup(msg, proposalUrl);
        } catch (signErr) {
          console.error("Erreur lors de la signature du devis:", signErr);
          let proposalUrl = confDolibarrUrl + "comm/propal/card.php?id=" + proposalData.id;
          showConfirmationPopup("Erreur lors de la signature du devis.", proposalUrl);
        }
      } else {
        alert("Aucun devis correspondant à cette référence n'a été trouvé.");
      }
    },
    (errorMsg) => {
      console.error("Erreur lors de la recherche du devis:", errorMsg);
      alert("Erreur lors de la recherche du devis.");
    }
  );
}

/* === Affichage du bouton de signature si une PJ est présente === */
if (attachments.length > 0) {
  let quoteSignContainer = document.getElementById("quote-sign-container");
  if (quoteSignContainer) {
    quoteSignContainer.classList.remove("hidden-field");
  }
  document.getElementById("sign-quote-btn").addEventListener("click", () => {
    console.log("Bouton de signature cliqué");
    showQuoteNumberModal();
  });
} else {
  console.log("Aucune pièce jointe trouvée dans ce message.");
}
/* === Gestion du modal de saisie/sélection du numéro de devis et des PJ === */
function showQuoteNumberModal() {
  const modal = document.getElementById("quote-number-modal");
  const select = document.getElementById("quote-number-select");
  const customInput = document.getElementById("quote-number-custom");
  const attContainer = document.getElementById("attachment-selection-container");
  console.log("Affichage du modal de numéro de devis.");

  // Réinitialiser le sélecteur (on conserve l'option pour une saisie complète)
  select.innerHTML = '<option value="">-- Aucune sélection --</option>';
  if (window.proposalsList && window.proposalsList.length > 0) {
    console.log("Liste des devis disponibles:", window.proposalsList);
    window.proposalsList.forEach(proposal => {
      let option = document.createElement("option");
      option.value = proposal.ref;
      option.textContent = proposal.ref;
      select.appendChild(option);
    });
  } else {
    console.log("Aucun devis disponible pour le modal.");
  }
  customInput.value = "";
  
  // Remplir la zone de sélection des PJ avec les pièces jointes trouvées
  attContainer.innerHTML = ""; // vider la zone
  if (attachments.length > 0) {
    let p = document.createElement("p");
    p.textContent = "Sélectionnez les pièces jointes à envoyer :";
    attContainer.appendChild(p);
    attachments.forEach((att, index) => {
      let checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "att_" + index;
      checkbox.value = index;
      checkbox.checked = true; // par défaut, toutes sélectionnées
      let label = document.createElement("label");
      label.htmlFor = "att_" + index;
      label.textContent = att.name;
      let div = document.createElement("div");
      div.appendChild(checkbox);
      div.appendChild(label);
      attContainer.appendChild(div);
    });
  }
  
  modal.classList.remove("hidden-field");
}

document.getElementById("confirm-quote-number-btn").addEventListener("click", async () => {
  const select = document.getElementById("quote-number-select");
  const customInput = document.getElementById("quote-number-custom");
  
  // On détermine la référence à utiliser
  let quoteNumber = select.value;
  console.log("Option sélectionnée:", quoteNumber);
  
  if (quoteNumber === "custom" || quoteNumber === "") {
    quoteNumber = customInput.value.trim();
    console.log("Saisie utilisateur:", quoteNumber);
    // Si la saisie contient exactement 4 chiffres, on effectue la recherche dans l'API
    if (/^\d{4}$/.test(quoteNumber)) {
      console.log("Recherche de devis pour les 4 derniers chiffres:", quoteNumber);
      dolLib.callDolibarrApi(
        'proposals',
        {
          sortfield: 't.rowid',
          sortorder: 'DESC',
          // Recherche de devis dont la référence se termine par ces 4 chiffres
          sqlfilters: "(t.ref:like:'%" + quoteNumber + "')"
        },
        'GET',
        {},
        (results) => {
          console.log("Devis trouvés pour", quoteNumber, ":", results);
          if (Array.isArray(results) && results.length > 0) {
            // Filtrer pour ne garder que ceux dont la référence se termine exactement par les 4 chiffres
            const filtered = results.filter(proposal => {
              return proposal.ref && proposal.ref.endsWith(quoteNumber);
            });
            if (filtered.length === 1) {
              quoteNumber = filtered[0].ref;
              console.log("Référence unique trouvée:", quoteNumber);
              proceedWithSignature(quoteNumber);
            } else if (filtered.length === 0) {
              alert("Aucun devis trouvé dont la référence se termine par ces 4 chiffres.");
            } else {
              alert("Plusieurs devis correspondent aux 4 chiffres saisis. Veuillez saisir la référence complète.");
            }
          } else {
            alert("Aucun devis trouvé pour ces 4 chiffres.");
          }
        },
        (errorMsg) => {
          console.error("Erreur lors de la recherche par 4 chiffres:", errorMsg);
          alert("Erreur lors de la recherche du devis.");
        }
      );
      return; // On attend le retour de l'API
    }
    // Si la saisie contient plus de 4 caractères, on considère qu'il s'agit de la référence complète
  }
  
  if (!quoteNumber) {
    alert("Veuillez saisir ou sélectionner un numéro de devis.");
    return;
  }
  
  // Masquer le modal de saisie
  document.getElementById("quote-number-modal").classList.add("hidden-field");
  
  // Récupérer la liste des PJ sélectionnées
  let selectedAttachments = [];
  attachments.forEach((att, index) => {
    let cb = document.getElementById("att_" + index);
    if (cb && cb.checked) {
      selectedAttachments.push(att);
    }
  });
  console.log("PJ sélectionnées:", selectedAttachments);
  
  // Lancer le process de signature en passant la référence (quoteNumber) et les PJ sélectionnées
  signProposalByRef(quoteNumber, selectedAttachments);
});

document.getElementById("cancel-quote-number-btn").addEventListener("click", () => {
  document.getElementById("quote-number-modal").classList.add("hidden-field");
});

/* Fonction appelée pour lancer le process de signature quand la référence est déjà déterminée */
function proceedWithSignature(quoteNumber) {
  // Récupérer la liste des PJ sélectionnées
  let selectedAttachments = [];
  attachments.forEach((att, index) => {
    let cb = document.getElementById("att_" + index);
    if (cb && cb.checked) {
      selectedAttachments.push(att);
    }
  });
  console.log("PJ sélectionnées:", selectedAttachments);
  signProposalByRef(quoteNumber, selectedAttachments);
}