// background.js (ES module)
import * as dolLib from '../global.lib.js';

browser.runtime.onMessage.addListener(async (message, sender) => {
    if (message.type === "getEmailAccount") {
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
    }
});

browser.messageDisplay.onMessageDisplayed.addListener(async (tab, message) => {


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


            // Dans ton background.js ou callback
            const cssPath = browser.runtime.getURL("content/doli-injector.css");
            fetch(cssPath)
                .then(res => res.text())
                .then(css => {
                    browser.tabs.executeScript(tab.id, {
                        code: `
                          (function() {
                              const style = document.createElement("style");
                              style.type = "text/css";
                              style.innerHTML = ${JSON.stringify(css)};
                              (document.head || document.documentElement).appendChild(style);
                          })();
                        `
                    });
                });

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
            })();
        `
            });

        });
    });


});


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
        const noteIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;

        const lastNoteContent = doliData.lastNote
            ? `<div class="doli-last-note">"${doliData.lastNote.message}"</div>
                <div class="doli-meta">${doliData.lastNote.user_full_name} - ${doliData.lastNote.dateLocal}</div>
            `
            : `<div class="doli-last-note" style="color:#999">Aucun historique récent.</div>`;

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
        <!-- <div class="doli-actions">
           <button id="doli-open-btn" class="doli-btn-history">
              Voir l'historique
              ${doliData.totalEvents > 0 ? `<span class="doli-counter">${doliData.totalEvents}</span>` : ''}
           </button> -->
        </div>
      </div>
    `;

};