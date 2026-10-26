// background.js (ES module)
import * as dolLib from '../global.lib.js';

/**
 * Open the popup UI in its own detached window rather than the small toolbar dropdown - used by
 * the "comment" button injected in the mail body, and by Ctrl+click on the toolbar/message
 * display action buttons (see onClicked listeners below).
 * @param tabId tab the mail is displayed in, used to know which message to load in the popup
 */
async function openDetachedPopupWindow(tabId){
    let message = await browser.messageDisplay.getDisplayedMessage(tabId);
    await browser.storage.local.set({dolibarrMsg: message});

    browser.windows.create({
        url: browser.runtime.getURL("messagePopup/popup.html"),
        type: "popup",
        width: 600,
        height: 500
    });
}

/**
 * Neither messageDisplayAction nor browserAction have a default_popup configured (see
 * manifest.json) : this is what lets onClicked fire at all, so we can check for Ctrl before
 * deciding what to open. On a plain click, the popup is opened the same way it would have been
 * with a default_popup set (set it, open it, then clear it again so onClicked keeps firing on
 * the next click - see https://bugzilla.mozilla.org/show_bug.cgi?id=1681131).
 * @param action browser.messageDisplayAction or browser.browserAction
 * @param tab tab passed to the onClicked listener
 * @param info OnClickData passed to the onClicked listener
 */
async function handleActionClick(action, tab, info){
    // Note: on macOS, Ctrl+click is treated as a right click by default and MacCtrl is not
    // forwarded here, so this only reliably works on Windows/Linux.
    if(info && Array.isArray(info.modifiers) && info.modifiers.includes('Ctrl')){
        await openDetachedPopupWindow(tab.id);
        return;
    }

    await action.setPopup({tabId: tab.id, popup: 'messagePopup/popup.html'});
    await action.openPopup();
    await action.setPopup({tabId: tab.id, popup: ''});
}

browser.messageDisplayAction.onClicked.addListener((tab, info) => handleActionClick(browser.messageDisplayAction, tab, info));
browser.browserAction.onClicked.addListener((tab, info) => handleActionClick(browser.browserAction, tab, info));

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

    // Not handled by this listener - do not claim the message so other listeners can respond.
    return undefined;
});


browser.messageDisplay.onMessageDisplayed.addListener(async (tab, message) => {
    checkAndInjectDolibarrBanner(tab, message);
    updateSenderIcon(tab, message);
});


/**
 * Icons of the Dolibarr button of the message display (issue #24) : green dot when the sender is
 * a contact or a thirdparty of Dolibarr, orange dot when only a thirdparty of the same email
 * domain is known (« also search by domain » option), plain icon otherwise.
 */
const SENDER_ICONS = {
    known: {16: 'images/dolibarr-16-known.png', 32: 'images/dolibarr-32-known.png'},
    domain: {16: 'images/dolibarr-16-domain.png', 32: 'images/dolibarr-32-domain.png'},
    unknown: {16: 'images/dolibarr-16.png', 32: 'images/dolibarr-32.png'}
};

/**
 * Lookups of the senders are kept 10 minutes (per mailbox and email), so going back and forth
 * between the emails of a same sender doesn't call Dolibarr each time. storage.session when the
 * Thunderbird version has it (the background page isn't persistent), in memory otherwise.
 */
const SENDER_LOOKUP_TTL = 10 * 60 * 1000;
const senderLookupMemoryCache = new Map();

async function getCachedSenderLookup(key){
    let entry = null;
    if(browser.storage.session){
        entry = (await browser.storage.session.get({['senderLookup:' + key]: null}))['senderLookup:' + key];
    }else{
        entry = senderLookupMemoryCache.get(key) || null;
    }
    return (entry && entry.time > Date.now() - SENDER_LOOKUP_TTL) ? entry.result : null;
}

async function setCachedSenderLookup(key, result){
    let entry = {time: Date.now(), result: result};
    if(browser.storage.session){
        await browser.storage.session.set({['senderLookup:' + key]: entry});
    }else{
        senderLookupMemoryCache.set(key, entry);
    }
}

/**
 * Sets the icon and title of the Dolibarr button of this tab from the lookup of the sender (see
 * resolveSenderLookup()). Reset to the plain icon first, so the icon of the previous email never
 * stays while the lookup runs.
 * @param tab
 * @param message
 */
async function updateSenderIcon(tab, message){
    try {
        await browser.messageDisplayAction.setIcon({tabId: tab.id, path: SENDER_ICONS.unknown});
        await browser.messageDisplayAction.setTitle({tabId: tab.id, title: browser.i18n.getMessage("extensionName")});

        let accountId = message.folder ? message.folder.accountId : undefined;
        if(!(await dolLib.checkConfig(accountId))){
            return;
        }
        let emails = dolLib.extractEmailAddressFromString(message.author || '');
        let email = emails ? emails[0].toLowerCase() : '';
        if(!email){
            return;
        }

        let cacheKey = accountId + '|' + email;
        let result = await getCachedSenderLookup(cacheKey);
        if(!result){
            result = await resolveSenderLookup(email, accountId);
            await setCachedSenderLookup(cacheKey, result);
        }
        if(!result.found){
            return;
        }

        let name = result.contactname && result.socname ? result.contactname + ' (' + result.socname + ')' : (result.socname || result.contactname);
        await browser.messageDisplayAction.setIcon({tabId: tab.id, path: result.matchedBy === 'domain' ? SENDER_ICONS.domain : SENDER_ICONS.known});
        await browser.messageDisplayAction.setTitle({
            tabId: tab.id,
            title: browser.i18n.getMessage(result.matchedBy === 'domain' ? "SenderKnownByDomainTitle" : "SenderKnownTitle", [name])
        });
    } catch (e) {
        console.warn("[DoliConnector background] could not update the icon of the sender", e);
    }
}

/**
 * Finds the thirdparty of the sender, same order as the popup's own search : contact having this
 * email, thirdparty having this email, then thirdparty of the same email domain (only with the
 * « also search by domain » option, never for a public domain). One call to
 * crmclientconnector/lookup when the CRM Client Connector module is enabled (1.9.0 or later), else
 * (or on an older module) the core contacts / thirdparties endpoints.
 * @param {string} email
 * @param {string} accountId
 * @returns {Promise<{found: boolean, matchedBy: string, socid: number, socname: string, contactid: number, contactname: string}>}
 */
async function resolveSenderLookup(email, accountId){
    let notFound = {found: false, matchedBy: '', socid: 0, socname: '', contactid: 0, contactname: ''};
    let searchDomain = (await browser.storage.local.get({dolibarrSearchDomain: false})).dolibarrSearchDomain;
    let emailDomain = email.split('@').pop();
    let publicDomains = await fetch(browser.runtime.getURL("exclude-domains.json")).then(response => response.json()).catch(() => []);
    let domainAllowed = searchDomain && !publicDomains.includes(emailDomain);

    let callApi = (endPoint, params) => new Promise((resolve) => {
        dolLib.callDolibarrApi(endPoint, params, 'GET', {}, (data) => resolve({data: data, error: null}), (message, info) => resolve({data: null, error: info || {}}), false, accountId);
    });

    if(await dolLib.isCrmConnectorEnabled(accountId)){
        let res = await callApi('crmclientconnector/lookup', {email: email, domain: domainAllowed ? 1 : 0});
        if(res.data && typeof res.data.found === 'boolean'){
            return res.data;
        }
        if(!res.error || res.error.status !== 404){
            // Error other than an older module without this endpoint : not known for now
            return notFound;
        }
    }

    let res = await callApi('contacts', {limit: 1, sortfield: 't.rowid', sortorder: 'DESC', sqlfilters: "(t.email:=:'" + email + "')"});
    if(Array.isArray(res.data) && res.data.length > 0){
        let contact = res.data[0];
        return Object.assign({}, notFound, {
            found: true, matchedBy: 'contact', contactid: parseInt(contact.id),
            contactname: [contact.firstname, contact.lastname].filter(Boolean).join(' '),
            socid: parseInt(contact.socid) || 0, socname: contact.socname || ''
        });
    }

    res = await callApi('thirdparties', {limit: 1, sortfield: 't.rowid', sortorder: 'DESC', sqlfilters: "(t.email:=:'" + email + "')"});
    if(Array.isArray(res.data) && res.data.length > 0){
        return Object.assign({}, notFound, {found: true, matchedBy: 'thirdparty', socid: parseInt(res.data[0].id), socname: res.data[0].name || ''});
    }

    if(domainAllowed){
        res = await callApi('thirdparties', {limit: 1, sortfield: 't.rowid', sortorder: 'DESC', sqlfilters: "(t.email:like:'%@" + emailDomain + "')"});
        if(Array.isArray(res.data) && res.data.length > 0){
            return Object.assign({}, notFound, {found: true, matchedBy: 'domain', socid: parseInt(res.data[0].id), socname: res.data[0].name || ''});
        }
    }

    return notFound;
}


/**
 * IMAP keyword set by the anti-spam of the Dolibarr module CRM Client Connector on an email whose
 * sender uses the address of a known customer, supplier or contact but fails the authentication
 * (DMARC / DKIM / SPF) of the receiving server. Thunderbird only exposes (and shows in the message
 * list) the keywords matching a known tag, hence ensureSpoofTag() below.
 */
const SPOOF_TAG_KEY = 'doliconnector_spoof';
const SPOOF_TAG_COLOR = '#D32F2F';

/**
 * Creates the red "possible spoofing" tag of the anti-spam keyword when it doesn't exist yet : the
 * flagged emails then show in red in the message list, before being opened. An existing tag (maybe
 * renamed or recolored by the user) is left as is.
 */
async function ensureSpoofTag(){
    try {
        const tagsApi = browser.messages.tags;
        const tags = (tagsApi && tagsApi.list) ? await tagsApi.list() : await browser.messages.listTags();
        if (tags.some(tag => String(tag.key).toLowerCase() === SPOOF_TAG_KEY)) {
            return;
        }
        const label = browser.i18n.getMessage("SpoofTagLabel");
        if (tagsApi && tagsApi.create) {
            await tagsApi.create(SPOOF_TAG_KEY, label, SPOOF_TAG_COLOR);
        } else {
            await browser.messages.createTag(SPOOF_TAG_KEY, label, SPOOF_TAG_COLOR);
        }
    } catch (e) {
        console.warn("[DoliConnector background] could not create the anti-spam tag", e);
    }
}

ensureSpoofTag();


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
 * Always injects exactly one banner in the message body, merging what used to be two separate
 * banners (trackid-linked record, last shared note) into a single one : either it summarizes
 * whatever Dolibarr content was found for this mail, or - when nothing was found - it shows a
 * deliberately neutral grey notice instead of staying silent.
 *
 * This "always inject something" behaviour is a deliberate anti-phishing measure. A forged mail
 * that fakes this module's usual yellow "content found" banner to look legitimate will, once the
 * extension also injects its own grey "nothing found" banner right next to it, show two banners
 * where there should only ever be one - see the empty banner's own <details> explanation
 * (renderEmptyDolibarrBox()) for the user-facing wording.
 *
 * The user can give up this protection with the banner display mode option (see
 * dolLib.getBannerDisplayMode()) : 'content' drops the grey banner, 'never' drops the whole content
 * part (trackid and linked documents aren't even fetched then). The spoofing alert of the anti-spam
 * is a security alert, not an information banner : it is shown whatever the mode.
 *
 * @param tab
 * @param message
 */
async function checkAndInjectDolibarrBanner(tab, message){
    // A mailbox always talks to exactly one Dolibarr connection (see
    // dolLib.resolveDolibarrConnection()'s doc comment). Unlike messagePopup/popup.js (one
    // message per page load), this background script is a shared, non-persistent event page that
    // can process onMessageDisplayed for two different tabs/accounts concurrently - so accountId
    // is resolved once here and threaded explicitly through every call below instead of relying
    // on dolLib's shared setActiveAccountContext(), which would race between concurrent calls.
    let accountId = message.folder.accountId;

    let hasConfig = await dolLib.checkConfig(accountId);
    if(!hasConfig){
        // Extension not connected to a Dolibarr at all : nothing to check against, so this isn't
        // the "no Dolibarr content for this mail" case the empty banner is about - stay silent.
        return;
    }

    let crmConnectorEnabled = await dolLib.isCrmConnectorEnabled(accountId);
    let displayMode = await dolLib.getBannerDisplayMode();
    let showContent = displayMode !== 'never';

    // Notes are still resolved in 'never' mode : they also drive the badge of the message display
    // action button, which isn't part of the banner.
    let [trackidInfo, notesInfo, linkedDocsInfo, spoofInfo] = await Promise.all([
        showContent ? resolveTrackidInfo(message, accountId) : Promise.resolve(null),
        crmConnectorEnabled ? resolveNotesInfo(tab, message, accountId) : Promise.resolve(null),
        (crmConnectorEnabled && showContent) ? resolveLinkedDocsInfo(message, accountId) : Promise.resolve([]),
        crmConnectorEnabled ? resolveSpoofInfo(message, accountId) : Promise.resolve(null)
    ]);

    let html = renderDolibarrBanner(trackidInfo, notesInfo, linkedDocsInfo, spoofInfo, displayMode);
    if(html === ''){
        return;
    }

    injectDoliCss(tab.id);

    browser.tabs.executeScript(tab.id, {
        code: `
            (function() {
                const div = document.createElement("div");
                div.className = 'doli-banner-container';
                div.setAttribute('style', ${JSON.stringify(DOLI_BANNER_CONTAINER_STYLE)});
                div.innerHTML = ${JSON.stringify(html)};
                if (document.body) { document.body.prepend(div); }
                else if (document.documentElement) { document.documentElement.prepend(div); }
            })();
        `
    });
}

/**
 * Inline !important styles forced onto the two outermost layers of the injected banner, on top
 * of their normal CSS classes (see content/doli-injector.css) - defends the anti-phishing
 * "always visible" banner against a hostile mail's own <style> block trying to hide it (e.g.
 * ".doli-banner-container{display:none!important}", or even a class-agnostic
 * "body>div:first-child{display:none!important}" guessing at how the banner is inserted). Per
 * the CSS cascade, an inline declaration always outranks a selector-based one at the same
 * importance tier, so these beat any !important rule the mail's own CSS could throw at the
 * exact same properties on this exact element - a plain class selector alone would lose that
 * fight. The container also gets position+z-index, so it can't simply be visually covered by
 * another element the mail stacks on top of it. This does not defend against a stacking context
 * created higher up (e.g. via transform/filter on an ancestor), which is a limit inherent to
 * injecting into the mail's own DOM rather than truly isolated browser chrome.
 */
const DOLI_BANNER_CONTAINER_STYLE =
    'display:block!important;visibility:visible!important;opacity:1!important;' +
    'position:relative!important;z-index:2147483647!important;';
const DOLI_BOX_STYLE = 'display:flex!important;visibility:visible!important;opacity:1!important;';

/**
 * Resolves the trackid part of the merged banner : type label + ref of the record referenced by
 * the mail's Dolibarr trackid (X-Dolibarr-TRACKID, Feedback-ID, or embedded in
 * References/In-Reply-To on a reply), or null if there's no trackid, its type isn't a recognized
 * one, or the configured Dolibarr URL isn't set. Independent of the CRM Client Connector module -
 * unlike resolveNotesInfo() below, this only needs the regular Dolibarr REST API.
 * @param message
 * @param {string} accountId
 * @returns {Promise<{type:string, id:number, typeLabel:string, refLabel:string}|null>}
 */
async function resolveTrackidInfo(message, accountId){
    let ref = await dolLib.getDolibarrTrackIdFromMessage(message.id, accountId);
    if(!ref){
        return null;
    }

    let meta = dolLib.getDolibarrObjectTypeMeta(ref.type);
    if(!meta){
        console.log("[DoliConnector background] trackid type is unknown/unmapped, ignoring", ref.type);
        return null;
    }

    let dolUrl = await dolLib.getDolibarrUrl(accountId);
    if(!dolLib.getDolibarrCardUrl(dolUrl, ref.type, ref.id)){
        return null;
    }

    let senderEmails = dolLib.extractEmailAddressFromString(message.author || '');
    let senderEmail = senderEmails ? senderEmails[0] : '';

    return new Promise((resolve) => {
        // cache:true - this same endpoint may also be fetched moments later by the popup's own
        // trackid resolution (see resolveSocFromId()'s caller in messagePopup/popup.js), so
        // either request can potentially be served from the browser's HTTP cache.
        dolLib.callDolibarrApi(meta.api + '/' + ref.id, {}, 'GET', {}, async (objData) => {
            if(ref.origin === 'unknown' && !(await dolLib.isUnknownDolibarrRefConsistent(objData, senderEmail, accountId))){
                console.log("[DoliConnector background] trackid of unknown instance does not match the sender thirdparty, ignoring", ref);
                resolve(null);
                return;
            }
            resolve({
                type: ref.type,
                id: ref.id,
                typeLabel: browser.i18n.getMessage(meta.labelKey),
                refLabel: (objData && objData.ref) ? objData.ref : ('#' + ref.id)
            });
        }, (errorMsg) => {
            if(ref.origin === 'unknown'){
                console.log("[DoliConnector background] trackid of unknown instance not found in our Dolibarr, ignoring", ref, errorMsg);
                resolve(null);
                return;
            }
            console.log("[DoliConnector background] failed to fetch referenced object, showing a generic link", errorMsg);
            resolve({
                type: ref.type,
                id: ref.id,
                typeLabel: browser.i18n.getMessage(meta.labelKey),
                refLabel: '#' + ref.id
            });
        }, true, accountId);
    });
}

/**
 * The mail account's own address for this message (folder's account first identity) - shared by
 * resolveNotesInfo() and resolveLinkedDocsInfo() below, both of which need it (with the mail's
 * Message-Id) to find its crmclientconnector EmailLink.
 * @param message
 * @returns {Promise<string|null>}
 */
async function resolveAccountEmailForMessage(message){
    const folder = message.folder;
    const accounts = await browser.accounts.list();
    const account = accounts.find(acc => acc.id === folder.accountId);

    if (!account || account.identities.length == 0) {
        console.warn("Impossible de déterminer l'adresse du compte 1.");
        return null;
    }

    return account.identities[0].email;
}

/**
 * Resolves the shared-notes part of the merged banner : the crmclientconnector emailusermsgs for
 * this mail's EmailLink (needs the CRM Client Connector module, see isCrmConnectorEnabled() -
 * only called when it's enabled), and updates the message display action's badge to match. Null
 * if there's no EmailLink for this mail at all (nothing shared on it yet).
 * @param tab
 * @param message
 * @param {string} accountId
 * @returns {Promise<Array|null>}
 */
async function resolveNotesInfo(tab, message, accountId){
    const accountEmail = await resolveAccountEmailForMessage(message);
    if(!accountEmail){
        return null;
    }

    let msgId = message.headerMessageId; // ou gFolderDisplay.selectedMessage ?

    dolLib.updateBadgeMessageDisplayAction(tab, 0);

    return new Promise((resolve) => {
        dolLib.callDolibarrApi('crmclientconnector/emaillinks/quicksearch', {accountEmail: accountEmail, msgId: msgId}, 'GET', {}, (resData)=>{
            dolLib.callDolibarrApi('crmclientconnector/emailusermsgs', {sqlfilters: `(fk_email_link:=:${resData.id})`}, 'GET', {}, (resDataMsg)=>{
                dolLib.updateBadgeMessageDisplayAction(tab, resDataMsg.length);
                resolve(resDataMsg);
            }, () => resolve(null), false, accountId);
        }, () => resolve(null), false, accountId);
    });
}

/**
 * Resolves the linked-documents part of the merged banner : every document linked to this mail's
 * EmailLink via crmclientconnector/emaillinks (both auto-linked by the PROPAL_CREATE/ORDER_CREATE/
 * TICKET_CREATE trigger and manually linked from the popup's "Lier" tab - see linkDocument() in
 * messagePopup/popup.js). Needs the CRM Client Connector module, see isCrmConnectorEnabled() -
 * only called when it's enabled. Empty array if there's no EmailLink for this mail, or nothing
 * linked to it yet.
 * @param message
 * @param {string} accountId
 * @returns {Promise<Array>}
 */
async function resolveLinkedDocsInfo(message, accountId){
    const accountEmail = await resolveAccountEmailForMessage(message);
    if(!accountEmail){
        return [];
    }

    let msgId = message.headerMessageId;

    return new Promise((resolve) => {
        dolLib.callDolibarrApi('crmclientconnector/emaillinks/linkedobjects', {accountEmail: accountEmail, msgId: msgId}, 'GET', {}, (resData)=>{
            resolve(Array.isArray(resData) ? resData : []);
        }, () => resolve([]), false, accountId);
    });
}

/**
 * Resolves the spoofing alert of the merged banner (anti-spam of the CRM Client Connector module) :
 * - email flagged by the scheduled scan of the anti-spam (tag SPOOF_TAG_KEY) : details read from
 *   crmclientconnector/antispam/alerts ;
 * - else immediate check of its sender with crmclientconnector/antispam/check, so the alert shows
 *   even before the next scan. Only the headers the check needs are sent (From, Authentication-
 *   Results, Received-SPF), in their order ; the rule itself lives on the Dolibarr side only.
 * Null when there is nothing to show, or when the anti-spam is not available on this Dolibarr
 * (feature disabled, older module or mailbox not in its list : 404, silently ignored).
 * @param message
 * @param {string} accountId
 * @returns {Promise<{thirdparty:string, contact:string, from:string, detail:string}|null>}
 */
async function resolveSpoofInfo(message, accountId){
    const accountEmail = await resolveAccountEmailForMessage(message);
    if(!accountEmail){
        return null;
    }

    const flagged = Array.isArray(message.tags) && message.tags.some(tag => String(tag).toLowerCase() === SPOOF_TAG_KEY);
    if(flagged){
        let alerts = await new Promise((resolve) => {
            dolLib.callDolibarrApi('crmclientconnector/antispam/alerts', {accountEmail: accountEmail, msgId: message.headerMessageId}, 'GET', {}, (resData)=>{
                resolve(Array.isArray(resData) ? resData : []);
            }, () => resolve([]), false, accountId);
        });
        let alert = alerts.length > 0 ? alerts[0] : {};
        return {
            thirdparty: alert.thirdparty ? alert.thirdparty.name : '',
            contact: alert.contact ? alert.contact.name : '',
            from: alert.from || message.author || '',
            detail: alert.detail || ''
        };
    }

    let headers = '';
    try {
        const full = await browser.messages.getFull(message.id);
        for (const name of ['from', 'authentication-results', 'received-spf']) {
            for (const value of ((full.headers || {})[name] || [])) {
                headers += name + ': ' + String(value).replace(/[\r\n]+/g, ' ') + '\n';
            }
        }
    } catch (e) {
        console.warn("[DoliConnector background] could not read the headers for the anti-spam check", e);
        return null;
    }
    if(headers === ''){
        return null;
    }

    return new Promise((resolve) => {
        dolLib.callDolibarrApi('crmclientconnector/antispam/check', {}, 'POST', JSON.stringify({accountEmail: accountEmail, headers: headers}), (resData)=>{
            if(!resData || !resData.spoof){
                resolve(null);
                return;
            }
            resolve({
                thirdparty: resData.thirdparty ? resData.thirdparty.name : '',
                contact: resData.contact ? resData.contact.name : '',
                from: resData.from || '',
                detail: resData.detail || ''
            });
        }, () => resolve(null), false, accountId);
    });
}

/**
 * The banner is injected in the mail body : every value coming from Dolibarr or from the email is
 * HTML-escaped first (unescaped, a note or a reference could inject HTML there, for example a fake
 * banner).
 */
const escapeHtml = dolLib.escapeHtml;

/**
 * Red spoofing alert, shown on top of the merged banner (see resolveSpoofInfo()).
 * @param {{thirdparty:string, contact:string, from:string, detail:string}} spoofInfo
 * @returns {string}
 */
function renderSpoofAlert(spoofInfo){
    let warningIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D32F2F" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    let who = spoofInfo.thirdparty || spoofInfo.contact || spoofInfo.from;
    if(spoofInfo.thirdparty && spoofInfo.contact){
        who = spoofInfo.contact + ' (' + spoofInfo.thirdparty + ')';
    }

    return `
      <div class="doli-box doli-box--spoof" style="${DOLI_BOX_STYLE}">
        <div class="flex-1">
           <div class="doli-content-wrapper">
              <div class="doli-icon-circle">${warningIcon}</div>
              <div style="flex:1">
                 <div class="doli-spoof-title">${escapeHtml(browser.i18n.getMessage("SpoofAlertTitle"))}</div>
                 <div class="doli-last-note">${escapeHtml(browser.i18n.getMessage("SpoofAlertText", [who]))}</div>
                 ${spoofInfo.detail ? `<div class="doli-meta">${escapeHtml(spoofInfo.from)} : ${escapeHtml(spoofInfo.detail)}</div>` : ''}
              </div>
           </div>
        </div>
      </div>
    `;
}

const DOLI_LINK_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FBC02D" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;

/**
 * One "record reference" row (link icon + type label + ref) - used for the trackid-detected
 * record in renderDolibarrBanner(), the only case left rendering as its own full row (it's the
 * record the mail is directly about, so it stays visually prominent) - see
 * renderDolibarrRefGroupRow() for the other linked documents, grouped instead of repeating this.
 * @param {string} typeLabel
 * @param {string} refLabel
 */
function renderDolibarrRefRow(typeLabel, refLabel){
    return `
       <div class="doli-content-wrapper">
          <div class="doli-icon-circle">${DOLI_LINK_ICON_SVG}</div>
          <div style="flex:1">
             <div class="doli-last-note" style="font-style:normal">${escapeHtml(typeLabel)} ${escapeHtml(refLabel)}</div>
          </div>
       </div>
    `;
}

/**
 * Compact grouped row for every "other" linked document (see renderDolibarrBanner()) : a single
 * icon + heading, with one small chip per document instead of a full renderDolibarrRefRow() each -
 * keeps the banner readable and compact when several documents are linked to the same mail (e.g.
 * a quotation auto-linked by its trigger plus a couple more linked manually from the "Lier" tab),
 * instead of repeating the icon and row padding once per document. Documents sharing the same
 * type share a single chip too (typeLabel stated once, followed by their refs comma-separated) -
 * e.g. two linked supplier orders show as one "Commande fournisseur CF001, CF002" chip rather
 * than repeating "Commande fournisseur" on two separate chips. Each ref gets its own status badge
 * next to it when available (same statusCode -> color/label mapping as the popup's own document
 * cards, see dolLib.getDocumentStatusBadgeInfo()), so e.g. a signed quotation and a still-draft one
 * of the same type are told apart at a glance without opening the popup.
 * @param {Array<{typeLabel:string, refLabel:string, statusBadge:?{code:number,label:string}}>} refs
 */
function renderDolibarrRefGroupRow(refs){
    let itemsByType = new Map();
    refs.forEach((ref) => {
        if(!itemsByType.has(ref.typeLabel)){ itemsByType.set(ref.typeLabel, []); }
        itemsByType.get(ref.typeLabel).push(ref);
    });

    let chips = Array.from(itemsByType, ([typeLabel, items]) => {
        let refsHtml = items.map((item) => {
            let badgeHtml = item.statusBadge
                ? ` <span class="doli-status-badge doli-status-badge--${escapeHtml(item.statusBadge.code)}">${escapeHtml(item.statusBadge.label)}</span>`
                : '';
            return escapeHtml(item.refLabel) + badgeHtml;
        }).join(', ');
        return `<span class="doli-ref-chip">${escapeHtml(typeLabel)} ${refsHtml}</span>`;
    }).join('');
    return `
       <div class="doli-content-wrapper">
          <div class="doli-icon-circle">${DOLI_LINK_ICON_SVG}</div>
          <div style="flex:1">
             <div class="doli-ref-group-heading">${browser.i18n.getMessage("LinkedDocuments")}</div>
             <div class="doli-ref-chips">${chips}</div>
          </div>
       </div>
    `;
}

/**
 * Renders the single merged banner : one row for the trackid-detected record (if any), one row
 * for each linked document (if any - both auto-linked and manually linked from the "Lier" tab
 * count, see resolveLinkedDocsInfo()), one row for the last shared note (if any), or - when none
 * of those is present - the neutral grey "nothing found" notice (see
 * checkAndInjectDolibarrBanner()'s doc comment for why that's always injected instead of
 * nothing). The trackid-detected record is often also the linked one (its own auto-link trigger
 * put it there) - that one is dropped from the linked-documents rows so it isn't shown twice.
 * @param {{type:string, id:number, typeLabel:string, refLabel:string}|null} trackidInfo
 * @param {Array|null} notesInfo
 * @param {Array} linkedDocsInfo
 * @param {{thirdparty:string, contact:string, from:string, detail:string}|null} spoofInfo  anti-spam alert, see resolveSpoofInfo()
 * @param {'always'|'content'|'never'} displayMode  see dolLib.getBannerDisplayMode()
 * @returns {string} empty string when there is nothing to inject
 */
function renderDolibarrBanner(trackidInfo, notesInfo, linkedDocsInfo, spoofInfo, displayMode){
    // The spoofing alert always comes first, whatever else is (or isn't) found for this mail, and
    // whatever the display mode
    let spoofHtml = spoofInfo ? renderSpoofAlert(spoofInfo) : '';
    if(displayMode === 'never'){
        return spoofHtml;
    }
    return spoofHtml + renderDolibarrContentBanner(trackidInfo, notesInfo, linkedDocsInfo, displayMode === 'always');
}

/**
 * Content part of the merged banner (see renderDolibarrBanner()).
 * @param {{type:string, id:number, typeLabel:string, refLabel:string}|null} trackidInfo
 * @param {Array|null} notesInfo
 * @param {Array} linkedDocsInfo
 * @param {boolean} showEmptyBox  grey "nothing found" notice when there is no content, else ''
 */
function renderDolibarrContentBanner(trackidInfo, notesInfo, linkedDocsInfo, showEmptyBox){
    let lastNote = (notesInfo && notesInfo.length > 0) ? notesInfo[notesInfo.length - 1] : null;
    let otherLinkedDocs = (linkedDocsInfo || []).filter((doc) => {
        return !(trackidInfo && String(doc.type) === String(trackidInfo.type) && String(doc.id) === String(trackidInfo.id));
    });

    if(!trackidInfo && otherLinkedDocs.length === 0 && !lastNote){
        return showEmptyBox ? renderEmptyDolibarrBox() : '';
    }

    let rows = '';

    if(trackidInfo){
        rows += renderDolibarrRefRow(trackidInfo.typeLabel, trackidInfo.refLabel);
    }

    if(otherLinkedDocs.length > 0){
        let refs = otherLinkedDocs.map((doc) => {
            let meta = dolLib.getDolibarrObjectTypeMeta(doc.type);
            return {
                typeLabel: meta ? browser.i18n.getMessage(meta.labelKey) : doc.type,
                refLabel: doc.ref || ('#' + doc.id),
                statusBadge: dolLib.getDocumentStatusBadgeInfo(doc.type, doc.statusCode)
            };
        });
        rows += renderDolibarrRefGroupRow(refs);
    }

    if(lastNote){
        let noteIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;

        if(lastNote.user_mail_hash){
            noteIcon = `
              <div class="mail-msg-box__img">
                <img
                  src="https://www.gravatar.com/avatar/${encodeURIComponent(lastNote.user_mail_hash)}?d=identicon"
                  class="mail-msg-box__img_user"
                  title="${escapeHtml(lastNote.user_full_name)}"
                >
              </div>
            `;
        }

        let dateLocal = new Date(parseInt(lastNote.date_creation) * 1000).toLocaleString(undefined, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false // mettre true si tu veux AM/PM
        });

        rows += `
           <div class="doli-content-wrapper">
              <div class="doli-icon-circle">${noteIcon}</div>
              <div style="flex:1">
                 <div class="doli-last-note">"${escapeHtml(lastNote.message).replace(/\r?\n/g, '<br>')}"</div>
                 <div class="doli-meta">${escapeHtml(lastNote.user_full_name)} - ${escapeHtml(dateLocal)}</div>
              </div>
           </div>
        `;
    }

    return `
      <div class="doli-box" style="${DOLI_BOX_STYLE}">
        <div class="flex-1">
           ${rows}
        </div>
      </div>
    `;
}

/**
 * Grey "nothing found" state - see checkAndInjectDolibarrBanner()'s doc comment : injected every
 * time there's no Dolibarr content to show for this mail, instead of injecting nothing, so a
 * phishing mail faking the yellow "content found" banner can't hide behind the extension's own
 * silence. The <details> spells this out for a user who notices the grey banner and wonders why.
 */
function renderEmptyDolibarrBox(){
    let infoIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

    return `
      <div class="doli-box doli-box--empty" style="${DOLI_BOX_STYLE}">
        <div class="flex-1">
           <div class="doli-content-wrapper">
              <div class="doli-icon-circle">${infoIcon}</div>
              <div style="flex:1">
                 <div class="doli-last-note">${browser.i18n.getMessage("NoDolibarrContentDetected")}</div>
                 <details class="doli-details">
                    <summary>${browser.i18n.getMessage("MoreInfo")}</summary>
                    <p>${browser.i18n.getMessage("NoDolibarrContentDetectedDetails")}</p>
                 </details>
              </div>
           </div>
        </div>
      </div>
    `;
}
