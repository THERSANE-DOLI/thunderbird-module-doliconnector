// background.js (ES module)
import * as dolLib from '../global.lib.js';

// Register the message display script for all newly opened message tabs.
messenger.messageDisplayScripts.register({
    js: [{ file: "messageDisplay/message-content-script.js" }],
    css: [{ file: "messageDisplay/message-content-styles.css" }],
});

// Inject script and CSS in all already open message tabs.
let openTabs = await messenger.tabs.query();
let messageTabs = openTabs.filter(
    tab => ["mail", "messageDisplay"].includes(tab.type)
);
for (let messageTab of messageTabs) {
    // Make sure the tab is displaying a single message. The mail tab could also
    // display a content page or multiple messages, which will cause an error.
    if (messageTab.type == "mail") {
        let messages = await browser.messageDisplay.getDisplayedMessages(
            messageTab.id
        );
        if (messages.length != 1) {
            continue;
        }
    }
    browser.tabs.executeScript(messageTab.id, {
        file: "messageDisplay/message-content-script.js"
    });
    browser.tabs.insertCSS(messageTab.id, {
        file: "messageDisplay/message-content-styles.css"
    });
}




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
        });
    });
});

