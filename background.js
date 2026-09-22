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
 * @param tab
 * @param message
 */
async function checkAndInjectDolibarrBanner(tab, message){
    let hasConfig = await dolLib.checkConfig();
    if(!hasConfig){
        // Extension not connected to a Dolibarr at all : nothing to check against, so this isn't
        // the "no Dolibarr content for this mail" case the empty banner is about - stay silent.
        return;
    }

    let crmConnectorEnabled = await dolLib.isCrmConnectorEnabled();

    let [trackidInfo, notesInfo, linkedDocsInfo] = await Promise.all([
        resolveTrackidInfo(message),
        crmConnectorEnabled ? resolveNotesInfo(tab, message) : Promise.resolve(null),
        crmConnectorEnabled ? resolveLinkedDocsInfo(message) : Promise.resolve([])
    ]);

    injectDoliCss(tab.id);

    let html = renderDolibarrBanner(trackidInfo, notesInfo, linkedDocsInfo);

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
 * @returns {Promise<{type:string, id:number, typeLabel:string, refLabel:string}|null>}
 */
async function resolveTrackidInfo(message){
    let ref = await dolLib.getDolibarrTrackIdFromMessage(message.id);
    if(!ref){
        return null;
    }

    let meta = dolLib.getDolibarrObjectTypeMeta(ref.type);
    if(!meta){
        console.log("[DoliConnector background] trackid type is unknown/unmapped, ignoring", ref.type);
        return null;
    }

    let dolUrl = await dolLib.getDolibarrUrl();
    if(!dolLib.getDolibarrCardUrl(dolUrl, ref.type, ref.id)){
        return null;
    }

    return new Promise((resolve) => {
        // cache:true - this same endpoint may also be fetched moments later by the popup's own
        // trackid resolution (see resolveSocFromId()'s caller in messagePopup/popup.js), so
        // either request can potentially be served from the browser's HTTP cache.
        dolLib.callDolibarrApi(meta.api + '/' + ref.id, {}, 'GET', {}, (objData) => {
            resolve({
                type: ref.type,
                id: ref.id,
                typeLabel: browser.i18n.getMessage(meta.labelKey),
                refLabel: (objData && objData.ref) ? objData.ref : ('#' + ref.id)
            });
        }, (errorMsg) => {
            console.log("[DoliConnector background] failed to fetch referenced object, showing a generic link", errorMsg);
            resolve({
                type: ref.type,
                id: ref.id,
                typeLabel: browser.i18n.getMessage(meta.labelKey),
                refLabel: '#' + ref.id
            });
        }, true);
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
 * @returns {Promise<Array|null>}
 */
async function resolveNotesInfo(tab, message){
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
            }, () => resolve(null));
        }, () => resolve(null));
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
 * @returns {Promise<Array>}
 */
async function resolveLinkedDocsInfo(message){
    const accountEmail = await resolveAccountEmailForMessage(message);
    if(!accountEmail){
        return [];
    }

    let msgId = message.headerMessageId;

    return new Promise((resolve) => {
        dolLib.callDolibarrApi('crmclientconnector/emaillinks/linkedobjects', {accountEmail: accountEmail, msgId: msgId}, 'GET', {}, (resData)=>{
            resolve(Array.isArray(resData) ? resData : []);
        }, () => resolve([]));
    });
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
             <div class="doli-last-note" style="font-style:normal">${typeLabel} ${refLabel}</div>
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
 * than repeating "Commande fournisseur" on two separate chips.
 * @param {Array<{typeLabel:string, refLabel:string}>} refs
 */
function renderDolibarrRefGroupRow(refs){
    let refLabelsByType = new Map();
    refs.forEach((ref) => {
        if(!refLabelsByType.has(ref.typeLabel)){ refLabelsByType.set(ref.typeLabel, []); }
        refLabelsByType.get(ref.typeLabel).push(ref.refLabel);
    });

    let chips = Array.from(refLabelsByType, ([typeLabel, refLabels]) => {
        return `<span class="doli-ref-chip">${typeLabel} ${refLabels.join(', ')}</span>`;
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
 */
function renderDolibarrBanner(trackidInfo, notesInfo, linkedDocsInfo){
    let lastNote = (notesInfo && notesInfo.length > 0) ? notesInfo[notesInfo.length - 1] : null;
    let otherLinkedDocs = (linkedDocsInfo || []).filter((doc) => {
        return !(trackidInfo && String(doc.type) === String(trackidInfo.type) && String(doc.id) === String(trackidInfo.id));
    });

    if(!trackidInfo && otherLinkedDocs.length === 0 && !lastNote){
        return renderEmptyDolibarrBox();
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
                refLabel: doc.ref || ('#' + doc.id)
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
                  src="https://www.gravatar.com/avatar/${lastNote.user_mail_hash}?d=identicon"
                  class="mail-msg-box__img_user"
                  title="${lastNote.user_full_name}"
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
                 <div class="doli-last-note">"${lastNote.message}"</div>
                 <div class="doli-meta">${lastNote.user_full_name} - ${dateLocal}</div>
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
