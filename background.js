// background.js (ES module)
import * as dolLib from '../global.lib.js';
import { sanitizeId } from '../global.lib.js';

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

    let config = await browser.storage.local.get({
        dolibarrUseNotes: false,
        useMasterPassword: false
    });

    if (!config.dolibarrUseNotes) {
        return;
    }
    
    // Si un mot de passe maître est requis et pas encore fourni, ne pas appeler l'API
    if (config.useMasterPassword && !dolLib.getMasterPassword()) {
        console.log('[Dolibarr Background] Mot de passe maître requis - skip API call');
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
        // Sécuriser l'ID contre les injections SQL
        const safeEmailLinkId = sanitizeId(resData.id);
        
        if (safeEmailLinkId === 0) {
            console.error('[Dolibarr Security] ID invalide reçu de l\'API');
            return;
        }
        
        dolLib.callDolibarrApi('crmclientconnector/emailusermsgs', {sqlfilters: `(fk_email_link:=:${safeEmailLinkId})`}, 'GET', {}, (resDataMsg)=>{
            dolLib.updateBadgeMessageDisplayAction(tab, resDataMsg.length);
        });
    }, (error) => {
        console.log('[Dolibarr Background] Erreur API:', error);
    });
});

