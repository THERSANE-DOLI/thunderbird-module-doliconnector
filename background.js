// background.js (ES module)
import * as dolLib from '../global.lib.js';

browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === "getEmailAccount") {
        return (async () => {
            try {
                const msg = await browser.messages.get(message.messageId);
                const folder = msg.folder;
                const accounts = await browser.accounts.list();
                const account = accounts.find(acc => acc.id === folder.accountId);

                if (account && account.identities.length > 0) {
                    return { email: account.identities[0].email };
                }
            } catch (err) {
                console.error("Erreur récupération compte :", err);
            }

            return { email: null };
        })();
    }

    if (message.action === "openDolibarr") {
        return (async () => {
            // Dans le cas d'une ouverture depuis le mail il faut récupérer les infos de la tab source d'ouverture et les envoyer à la popup
            let tabId = sender.tab.id;
            let message = await browser.messageDisplay.getDisplayedMessage(tabId);
            await browser.storage.local.set({dolibarrMsg: message});

            browser.windows.create({
                url: browser.runtime.getURL("messagePopup/popup.html"),
                type: "popup",
                width: 600,
                height: 500
            });
        })();
    }

    // Not handled by this listener - do not claim the message so other listeners can respond.
    return undefined;
});


browser.messageDisplay.onMessageDisplayed.addListener(async (tab, message) => {

    // Independent of the notes feature below: if this message carries a
    // Dolibarr trackid, show a banner linking to the record it's about.
    checkAndInjectTrackidBanner(tab, message);

    let config = await browser.storage.local.get({dolibarrUseNotes: false});

    if (!config.dolibarrUseNotes) {
        return;
    }

    const folder = message.folder;

    const accounts = await browser.accounts.list();
    const account = accounts.find(acc => acc.id === folder.accountId);

    if (!account || account.identities.length == 0) {
        console.warn("Impossible de déterminer l'adresse du compte 1.");
        return;
    }

    const accountEmail = { email: account.identities[0].email };
    if (!accountEmail) {
        console.warn("Impossible de déterminer l'adresse du compte 2.");
        return;
    }

    let msgId = message.headerMessageId; // ou gFolderDisplay.selectedMessage ?


    // Get all notes
    dolLib.updateBadgeMessageDisplayAction(tab,0);
    dolLib.callDolibarrApi('crmclientconnector/emaillinks/quicksearch', {accountEmail: accountEmail.email, msgId: msgId}, 'GET', {}, (resData)=>{
        dolLib.callDolibarrApi('crmclientconnector/emailusermsgs', {sqlfilters: `(fk_email_link:=:${resData.id})`}, 'GET', {}, (resDataMsg)=>{
            dolLib.updateBadgeMessageDisplayAction(tab, resDataMsg.length);


            injectDoliCss(tab.id);

            let html = renderDolibarrBox(resDataMsg);

            // Injecte le script directement dans le tab du message
            browser.tabs.executeScript(tab.id, {
                code: `
            (function() {
                const div = document.createElement("div");
                div.className = 'doli-banner-container';
                div.innerHTML = ${JSON.stringify(html)};
                if (document.body) { document.body.prepend(div); }
                else if (document.documentElement) { document.documentElement.prepend(div); }
                console.log("Div injecté avec succès");
                
                document.addEventListener("click", (ev) => {
                  if (ev.target && ev.target.id === "doli-open-btn") {
                    browser.runtime.sendMessage({action: "openDolibarr"});
                  }
                });
            })();
            
            
        `
            });

        });
    });


});


/**
 * Injects content/doli-injector.css into the message tab, once. Both the
 * "last comment" banner and the trackid banner rely on it.
 * @param tabId
 */
function injectDoliCss(tabId){
    const cssPath = browser.runtime.getURL("content/doli-injector.css");
    fetch(cssPath)
        .then(res => res.text())
        .then(css => {
            browser.tabs.executeScript(tabId, {
                code: `
                  (function() {
                      if (document.getElementById('doli-injected-css')) { return; }
                      const style = document.createElement("style");
                      style.id = 'doli-injected-css';
                      style.type = "text/css";
                      style.innerHTML = ${JSON.stringify(css)};
                      (document.head || document.documentElement).appendChild(style);
                  })();
                `
            });
        });
}

/**
 * If the displayed message carries a Dolibarr trackid (X-Dolibarr-TRACKID,
 * Feedback-ID, or embedded in References/In-Reply-To on a reply), inject a
 * banner in the message body linking to the Dolibarr record it's about -
 * same visual treatment as the "last comment" banner above.
 * @param tab
 * @param message
 */
async function checkAndInjectTrackidBanner(tab, message){
    let ref = await dolLib.getDolibarrTrackIdFromMessage(message.id);
    if(!ref){
        return;
    }

    let meta = dolLib.getDolibarrObjectTypeMeta(ref.type);
    if(!meta){
        console.log("[DoliConnector background] trackid type is unknown/unmapped, ignoring", ref.type);
        return;
    }

    let hasConfig = await dolLib.checkConfig();
    if(!hasConfig){
        return;
    }

    let dolUrl = await dolLib.getDolibarrUrl();
    let cardUrl = dolLib.getDolibarrCardUrl(dolUrl, ref.type, ref.id);
    if(!cardUrl){
        return;
    }

    dolLib.callDolibarrApi(meta.api + '/' + ref.id, {}, 'GET', {}, (objData) => {
        injectTrackidBanner(tab.id, {
            typeLabel: browser.i18n.getMessage(meta.labelKey),
            refLabel: (objData && objData.ref) ? objData.ref : ('#' + ref.id),
            cardUrl: cardUrl
        });
    }, (errorMsg) => {
        console.log("[DoliConnector background] failed to fetch referenced object, showing a generic link", errorMsg);
        injectTrackidBanner(tab.id, {
            typeLabel: browser.i18n.getMessage(meta.labelKey),
            refLabel: '#' + ref.id,
            cardUrl: cardUrl
        });
    });
}

function injectTrackidBanner(tabId, info){
    injectDoliCss(tabId);

    let html = renderDolibarrTrackidBox(info);

    browser.tabs.executeScript(tabId, {
        code: `
            (function() {
                const div = document.createElement("div");
                div.className = 'doli-banner-container doli-trackid-banner-container';
                div.innerHTML = ${JSON.stringify(html)};
                if (document.body) { document.body.prepend(div); }
                else if (document.documentElement) { document.documentElement.prepend(div); }
            })();
        `
    });
}

function renderDolibarrTrackidBox(info) {
    let linkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FBC02D" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;

    return `
      <div class="doli-box">
        <div class="doli-content-wrapper">
           <div class="doli-icon-circle">${linkIcon}</div>
           <div style="flex:1">
              <div class="doli-last-note" style="font-style:normal">${info.typeLabel} ${info.refLabel}</div>
           </div>
        </div>
        <div class="doli-actions">
           <a href="${info.cardUrl}" target="_blank" rel="noopener noreferrer" class="doli-btn-history">
              ${browser.i18n.getMessage("OpenDocument")}
           </a>
        </div>
      </div>
    `;
}

function renderDolibarrBox(messages) {

    let doliData = {
        found: true,
        company: "Nom Société",
        totalEvents: messages.length,
        lastNote: messages.length > 0 ? messages[messages.length -1] : false
    };

    if(doliData.lastNote) {
        doliData.lastNote.dateLocal = new Date(parseInt(doliData.lastNote.date_creation) * 1000).toLocaleString(undefined, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false // mettre true si tu veux AM/PM
        });
    }

    // Icone SVG simplifiée
    let noteIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;

    if(typeof doliData.lastNote.user_mail_hash !== undefined) {
        noteIcon = `
          <div class="mail-msg-box__img">
            <img 
              src="https://www.gravatar.com/avatar/${doliData.lastNote.user_mail_hash}?d=identicon" 
              class="mail-msg-box__img_user" 
              title="${doliData.lastNote.user_full_name}"
            >
          </div>
        `;
    }

    const lastNoteContent = doliData.lastNote
        ? `<div class="doli-last-note">"${doliData.lastNote.message}"</div>
            <div class="doli-meta">${doliData.lastNote.user_full_name} - ${doliData.lastNote.dateLocal}</div>
        `
        : `<div class="doli-last-note" style="color:#999">${browser.i18n.getMessage("NoCommentHistory")}.</div>`;



    return `
      <div class="doli-box">
        <div class="flex-1">
           <!-- <div class="doli-header">
              <span class="doli-badge">DOLIBARR</span>
              <span class="doli-company">${doliData.company || 'Contact'}</span>
           </div>-->
           <div class="doli-content-wrapper">
              <div class="doli-icon-circle">${noteIcon}</div>
              <div style="flex:1">
                 ${lastNoteContent}
              </div>
           </div>
        </div>
        <div class="doli-actions">
           <button id="doli-open-btn" class="doli-btn-history">
              ${browser.i18n.getMessage("Comments")} &nbsp;
              ${doliData.totalEvents > 0 ? `<span class="doli-counter">${doliData.totalEvents}</span>` : ''}
           </button>
        </div>
      </div>
    `;

};