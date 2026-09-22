/**
 * Show a dismissible toast in the top-right corner of the page, instead of an inline
 * success/error message in the page body (which shifts surrounding content around). Creates its
 * own fixed-position container on first use, so no host page markup is required - usable from
 * any page in the extension.
 * @param {string} message
 * @param {'success'|'error'} type
 * @param {number} durationMs auto-dismiss delay (0 disables auto-dismiss, close button still works)
 * @returns {HTMLElement} the toast element
 */
export function showToast(message, type = 'success', durationMs = 4000){
    let container = document.getElementById('dolconnector-toast-container');
    if(!container){
        container = document.createElement('div');
        container.id = 'dolconnector-toast-container';
        document.body.appendChild(container);
    }

    let toast = document.createElement('div');
    toast.classList.add('dolconnector-toast', 'dolconnector-toast--'+type);

    let text = document.createElement('span');
    text.classList.add('dolconnector-toast__text');
    text.textContent = message;
    toast.appendChild(text);

    let closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.classList.add('dolconnector-toast__close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => toast.remove());
    toast.appendChild(closeBtn);

    container.appendChild(toast);

    if(durationMs > 0){
        setTimeout(() => toast.remove(), durationMs);
    }

    return toast;
}

/**
 * Build a small dropdown with a single confirm action, used in place of a double-click or a
 * blocking confirm() dialog for actions that need a deliberate second step (e.g. unlinking or
 * deleting something) - closes on an outside click or after the action runs. The trigger is
 * either a text label or an icon (e.g. the existing trash icon), whichever is passed.
 * @param {{triggerLabel?: string, triggerIcon?: string, triggerTitle?: string, confirmLabel: string, onConfirm: () => void, danger?: boolean, solidConfirm?: boolean}} options
 * @returns {HTMLElement} the dropdown wrapper element (trigger + menu)
 */
export function buildConfirmDropdown({triggerLabel, triggerIcon, triggerTitle, confirmLabel, onConfirm, danger = false, solidConfirm = false, onToggle}){
    let wrapper = document.createElement('div');
    wrapper.classList.add('confirm-dropdown');

    let trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.classList.add('btn-tiny-action', 'confirm-dropdown__trigger');
    if(danger){ trigger.classList.add('--delete-btn'); }
    if(triggerIcon){
        let icon = document.createElement('img');
        icon.src = triggerIcon;
        icon.classList.add('btn-tiny-action-icon');
        trigger.appendChild(icon);
    }else{
        trigger.textContent = triggerLabel;
    }
    if(triggerTitle){ trigger.title = triggerTitle; }
    wrapper.appendChild(trigger);

    let menu = document.createElement('div');
    menu.classList.add('confirm-dropdown__menu', 'hidden-field');

    let confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.classList.add('confirm-dropdown__item');
    if(danger){ confirmBtn.classList.add('confirm-dropdown__item--danger'); }
    if(solidConfirm){ confirmBtn.classList.add('confirm-dropdown__item--solid'); }
    confirmBtn.textContent = confirmLabel;
    menu.appendChild(confirmBtn);

    wrapper.appendChild(menu);

    // Also toggles wrapper.confirm-dropdown--open and calls onToggle(), so a caller whose trigger
    // only shows on hover (e.g. getMsgTpl()'s .action-btn-list) can force it to stay visible while
    // the menu is open - otherwise the mouse leaving the row fades the trigger via CSS opacity,
    // which (being on an ancestor) hides the still-open menu with it, and it silently reappears
    // open the next time the mouse passes back over the row.
    let setOpen = (open) => {
        menu.classList.toggle('hidden-field', !open);
        wrapper.classList.toggle('confirm-dropdown--open', open);
        if(onToggle){ onToggle(open); }
    };
    let onOutsideClick = (event) => {
        if(!wrapper.contains(event.target)){
            setOpen(false);
            document.removeEventListener('click', onOutsideClick);
        }
    };

    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        let willOpen = menu.classList.contains('hidden-field');
        setOpen(false);
        if(willOpen){
            setOpen(true);
            // Deferred, so the click that opened the menu isn't also the outside click that closes it.
            setTimeout(() => document.addEventListener('click', onOutsideClick), 0);
        }
    });

    confirmBtn.addEventListener('click', (event) => {
        event.preventDefault();
        setOpen(false);
        document.removeEventListener('click', onOutsideClick);
        onConfirm();
    });

    return wrapper;
}

/**
 * Build an action button that opens a dropdown menu of plain navigation links (e.g. "View card"
 * plus a few "create X for this thirdparty" shortcuts) - same trigger/menu/outside-click
 * interaction as buildConfirmDropdown(), but for a list of links instead of a single confirm
 * action, and with a full-size .btn.btn-primary trigger rather than a small icon-only one.
 * @param {{triggerLabel: string, triggerTitle?: string, items: Array<{label: string, href: string, target？: string}>}} options
 * @returns {HTMLElement} the dropdown wrapper element (trigger + menu)
 */
export function buildDropdownMenu({triggerLabel, triggerTitle, items}){
    let wrapper = document.createElement('div');
    wrapper.classList.add('confirm-dropdown', 'action-menu-dropdown');

    let trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.classList.add('action-menu-dropdown__trigger');
    if(triggerTitle){ trigger.title = triggerTitle; }

    let triggerText = document.createElement('span');
    triggerText.textContent = triggerLabel;
    trigger.appendChild(triggerText);

    let caret = document.createElement('span');
    caret.classList.add('action-menu-dropdown__caret');
    caret.textContent = '▾';
    trigger.appendChild(caret);

    wrapper.appendChild(trigger);

    let menu = document.createElement('div');
    menu.classList.add('confirm-dropdown__menu', 'hidden-field');

    items.forEach((item) => {
        let link = document.createElement('a');
        link.classList.add('confirm-dropdown__item');
        link.textContent = item.label;
        link.href = item.href;
        if(item.target){ link.target = item.target; }
        menu.appendChild(link);
    });

    wrapper.appendChild(menu);

    let setOpen = (open) => {
        menu.classList.toggle('hidden-field', !open);
        wrapper.classList.toggle('action-menu-dropdown--open', open);
    };
    let onOutsideClick = (event) => {
        if(!wrapper.contains(event.target)){
            setOpen(false);
            document.removeEventListener('click', onOutsideClick);
        }
    };

    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        let willOpen = menu.classList.contains('hidden-field');
        setOpen(false);
        if(willOpen){
            setOpen(true);
            // Deferred, so the click that opened the menu isn't also the outside click that closes it.
            setTimeout(() => document.addEventListener('click', onOutsideClick), 0);
        }
    });

    // Menu items are plain links (so ctrl/middle-click "open in new tab" works as expected) -
    // just close the menu once one is clicked instead of intercepting the navigation.
    menu.addEventListener('click', (event) => {
        if(event.target.closest('.confirm-dropdown__item')){
            setOpen(false);
            document.removeEventListener('click', onOutsideClick);
        }
    });

    return wrapper;
}

/**
 * Whether the Dolibarr crmclientconnector module (custom/crmclientconnector on the Dolibarr
 * side) is installed and enabled - every feature built on its REST endpoints
 * (crmclientconnector/*: shared notes, the "Lier" tab and detected-ref card's Link button,
 * linked documents on the Info tab, ref auto-detection via numbering patterns, the domain
 * exclusion list) must check this before calling one of them, since those calls 404/500
 * otherwise. Falls back to the old dolibarrUseNotes key (this setting used to only gate the
 * notes feature) so users who already enabled it keep working after the rename.
 * @returns {Promise<boolean>}
 */
export async function isCrmConnectorEnabled(){
    let data = await browser.storage.local.get({dolibarrCrmConnectorEnabled: undefined, dolibarrUseNotes: false});
    return data.dolibarrCrmConnectorEnabled !== undefined ? data.dolibarrCrmConnectorEnabled : data.dolibarrUseNotes;
}

export async function checkConfig(){

    let configData = await browser.storage.local.get({
        dolibarrApiKey:'',
        dolibarrApiUrl:'',
        dolibarrApiEntity:1,
        dolibarrHttpAuthEnabled: false,
        dolibarrHttpAuthUser: '',
        dolibarrHttpAuthPassword: ''
    });


    let apiKey = configData.dolibarrApiKey;
    let dolUrl = configData.dolibarrApiUrl;
	let apiEntity = configData.dolibarrApiEntity;

    if(apiKey.length == 0 || dolUrl ==0 || apiEntity.length == 0){  return false; }

    if(configData.dolibarrHttpAuthEnabled
        && (configData.dolibarrHttpAuthUser.length == 0 || configData.dolibarrHttpAuthPassword.length == 0)){
        return false;
    }

    return true;
}

/**
 * Calls users/info (Dolibarr's standard "who am I" REST endpoint) to verify that the
 * configured API key (and HTTP Basic Auth credentials, if enabled) actually work and that
 * the server can be reached, so the UI can tell an invalid-credentials problem apart from
 * a connection problem - both look like "config incomplete" otherwise.
 * @returns {Promise<{status: 'ok'|'auth'|'connection', message: (string|null)}>}
 */
export async function checkDolibarrConnection(){
    return new Promise((resolve) => {
        callDolibarrApi('users/info', {}, 'GET', {}, () => {
            resolve({status: 'ok', message: null});
        }, (errorMsg, errorInfo) => {
            let status = (errorInfo && errorInfo.type === 'auth') ? 'auth' : 'connection';
            resolve({status, message: errorMsg});
        });
    });
}


export async function callDolibarrApi(endPoint, getDataParam, type = 'GET', postData, successCallBackFunction = ()=>{}, errorCallBackFunction = ()=>{}, cache = false){

    let configData = await browser.storage.local.get({
        dolibarrApiKey:'',
        dolibarrApiUrl:'',
        dolibarrApiEntity:1,
        dolibarrHttpAuthEnabled: false,
        dolibarrHttpAuthUser: '',
        dolibarrHttpAuthPassword: ''
    });


    let apiKey = configData.dolibarrApiKey;
    let dolUrl = configData.dolibarrApiUrl;
	let apiEntity = configData.dolibarrApiEntity;
	if(apiEntity.length == 0 || apiEntity <= 0){
        apiEntity = 1;
    }
    if(typeof getDataParam.entity === "undefined"){
        getDataParam.entity = apiEntity;
    }

    if(apiKey.length == 0 || dolUrl ==0){  reject("Fail getting settings"); }
    if(dolUrl.slice(-1) != '/'){ dolUrl = dolUrl + '/';  }
    let dolApiUrl = dolUrl + 'api/index.php/';
    let finalUrl = dolApiUrl + endPoint;


    if(type == 'GET'){
        let queryString = Object.keys(getDataParam).map((key) => {
            return encodeURIComponent(key) + '=' + encodeURIComponent(getDataParam[key])
        }).join('&');

        if(queryString.length>0){
            finalUrl = finalUrl + '?' + queryString;
        }
    }



    let headers = {
        'DOLAPIKEY': apiKey,
        'DOLAPIENTITY': apiEntity,
        "Content-Type": "application/json"
    };
    if(configData.dolibarrHttpAuthEnabled && configData.dolibarrHttpAuthUser.length > 0){
        headers['Authorization'] = 'Basic ' + btoa(configData.dolibarrHttpAuthUser + ':' + configData.dolibarrHttpAuthPassword);
    }

    fetch(finalUrl, {
        method: type,
        headers: headers,
        body: (type.toUpperCase() !== 'GET' && postData) ? postData : undefined,
        cache: cache && type == 'GET' ? "force-cache" : "default"
    })
    .then(response => {
        if (!response.ok) {
            const statusErrorMap = {
                404: "Not found",
                400: "Server understood the request, but request content was invalid.",
                401: "Unauthorized access.",
                403: "Forbidden resource can't be accessed.",
                500: "Internal server error.",
                503: "Service unavailable."
            };
            let errorMsg = statusErrorMap[response.status] || "Unknown Error \n.";
            let error = new Error(errorMsg);
            error.status = response.status;
            throw error;
        }
        return response.json();
    })
    .then(responseJsonObj => {
        if (typeof successCallBackFunction === 'function') {
            successCallBackFunction(responseJsonObj);
        } else {
            console.error('Callback function invalid');
        }
    })
    .catch(error => {
        // No `status` means fetch() itself rejected (network failure, DNS error, CORS,
        // unreachable host, etc.) rather than the server answering with an HTTP error.
        let errorInfo = {
            type: (error.status === 401 || error.status === 403) ? 'auth' : (error.status ? 'http' : 'network'),
            status: error.status || null
        };
        if (typeof errorCallBackFunction === 'function') {
            errorCallBackFunction(error.message, errorInfo);
        } else {
            console.error('Error Callback function invalid');
        }
    });


    //
    // let xhttp = new XMLHttpRequest();
    // xhttp.open(type, finalUrl, true);
    // xhttp.setRequestHeader("DOLAPIKEY", apiKey);
	// xhttp.setRequestHeader("DOLAPIENTITY", apiEntity);
    // xhttp.onreadystatechange = function()
    // {
    //     if (this.readyState == XMLHttpRequest.DONE && this.status == 200)
    //     {
    //         let responseJsonObj = JSON.parse(this.responseText);
    //
    //         if (typeof successCallBackFunction === 'function') {
    //             successCallBackFunction(responseJsonObj);
    //         } else {
    //             console.error('Callback function invalide');
    //         }
    //     }else if (this.readyState == XMLHttpRequest.DONE){
    //         let errorMsg = '' ;
    //         var statusErrorMap = {
    //             '404' : "Not found",
    //             '400' : "Server understood the request, but request content was invalid.",
    //             '401' : "Unauthorized access.",
    //             '403' : "Forbidden resource can't be accessed.",
    //             '500' : "Internal server error.",
    //             '503' : "Service unavailable."
    //         };
    //         if (this.status) {
    //             errorMsg = statusErrorMap[this.status];
    //             if(!errorMsg){
    //                 errorMsg = "Unknown Error \n.";
    //             }
    //         }
    //
    //         if (typeof errorCallBackFunction === 'function') {
    //             errorCallBackFunction(errorMsg);
    //         } else {
    //             console.error('Error Callback function invalid');
    //         }
    //     }
    // };
    //
    // xhttp.send( postData );
    // return xhttp;
}

/**
 * The Dolibarr user identified by the configured API key (GET /users/info, Dolibarr's standard
 * "who am I" REST endpoint) - used to tell whether the current user authored a given comment, see
 * getMsgTpl()'s edit button. Cached for the page's lifetime since the configured API key doesn't
 * change mid-session.
 * @returns {Promise<Object|null>} the user object (has .id), or null on error
 */
let currentDolibarrUserPromise = null;
export function getCurrentDolibarrUser(){
    if(!currentDolibarrUserPromise){
        currentDolibarrUserPromise = new Promise((resolve) => {
            callDolibarrApi('users/info', {}, 'GET', {}, (userData)=>{
                resolve(userData || null);
            }, (errorMsg)=>{
                console.error('getCurrentDolibarrUser failed', errorMsg);
                resolve(null);
            });
        });
    }
    return currentDolibarrUserPromise;
}

//wip
export async function filterPropalStatus() {
  let configData = await browser.storage.local.get(
  {dolibarrPropalCanceled:'',
  dolibarrPropalDraft:'',
  dolibarrPropalValidated:'',
  dolibarrPropalSigned:'',
  dolibarrPropalNotSigned:'',
  dolibarrPropalBilled:''}
  );
  let propalCanceled = configData.dolibarrPropalCanceled;
  let propalDraft = configData.dolibarrPropalDraft;
  let propalValidated = configData.dolibarrPropalValidated;
  let propalSigned = configData.dolibarrPropalSigned;
  let propalNotSigned = configData.dolibarrPropalNotSigned;
  let propalBilled = configData.dolibarrPropalBilled;

  let displayStatus= [];//list of status I want to display

  if(propalCanceled == true){displayStatus.push(-1);}
  if(propalDraft == true){displayStatus.push(0);}
  if(propalValidated == true){displayStatus.push(1);}
  if(propalSigned == true){displayStatus.push(2);}
  if(propalNotSigned == true){displayStatus.push(3);}
  if(propalBilled == true){displayStatus.push(4);}

   return displayStatus;

}

export function extractEmailAddressFromString(text){
    // Expression régulière pour rechercher les adresses e-mail
    let emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g;

    // Utilisation de la méthode match() pour obtenir un tableau contenant toutes les correspondances trouvées
    let emails = text.match(emailRegex);

    // Retourner le tableau d'adresses e-mail
    return emails;
}


/**
 * Read the X-Quotation-Mail / X-Quotation-Data headers added by the Prestashop
 * "tsquotationform" module notification email, if present on the message.
 * @param {number} id message id
 * @returns {Promise<{email: string, data: (object|null)}|null>}
 */
export async function getQuotationHeaders(id){
    let full = await messenger.messages.getFull(id);
    if(!full || !full.headers){
        return null;
    }

    let mailHeader = full.headers['x-quotation-mail'];
    if(!Array.isArray(mailHeader) || mailHeader.length === 0){
        return null;
    }

    let quotation = {
        email: mailHeader[0].trim(),
        data: null
    };

    let dataHeader = full.headers['x-quotation-data'];
    if(Array.isArray(dataHeader) && dataHeader.length > 0){
        try {
            // folded headers (RFC 2822) may contain line breaks, unfold before parsing
            let raw = dataHeader[0].replace(/\r?\n/g, '');
            quotation.data = JSON.parse(raw);
        } catch (error) {
            console.error("Erreur de parsing de l'en-tête X-Quotation-Data :", error);
        }
    }

    return quotation;
}

/**
 * List of sender email addresses (or "@domain.tld" domains) allowed to have
 * their X-Quotation-* headers trusted to override the sender-based thirdparty
 * search. Kept empty by default for security : an attacker able to send a mail
 * with a forged X-Quotation-Mail header must not be able to hijack the search.
 * @returns {Promise<string[]>}
 */
export async function getQuotationTrustedSenders(){
    let config = await browser.storage.local.get({dolibarrQuotationTrustedSenders: ''});
    return config.dolibarrQuotationTrustedSenders
        .split(/[\n,;]+/)
        .map(sender => sender.trim().toLowerCase())
        .filter(sender => sender.length > 0);
}

/**
 * @param {string} email
 * @param {string[]} trustedSenders list from getQuotationTrustedSenders()
 * @returns {boolean}
 */
export function isQuotationTrustedSender(email, trustedSenders){
    if(!email || !Array.isArray(trustedSenders) || trustedSenders.length === 0){
        return false;
    }
    email = email.trim().toLowerCase();
    return trustedSenders.some(sender => sender === email || (sender.startsWith('@') && email.endsWith(sender)));
}

/**
 * Dolibarr object types that can appear in an email trackid, keyed by the
 * short prefix Dolibarr puts in front of the object id (see e.g.
 * htdocs/commande/card.php: `$trackid = 'ord'.$object->id;`, and the
 * equivalent line in each other object's card.php).
 */
export const DOLIBARR_OBJECT_TYPES = {
    ord:  { api: 'orders',           card: 'commande/card.php',       labelKey: 'DolibarrTypeOrder' },
    pro:  { api: 'proposals',        card: 'comm/propal/card.php',    labelKey: 'DolibarrTypeProposal' },
    inv:  { api: 'invoices',         card: 'compta/facture/card.php', labelKey: 'DolibarrTypeInvoice' },
    sord: { api: 'supplierorders',   card: 'fourn/commande/card.php', labelKey: 'DolibarrTypeSupplierOrder' },
    sinv: { api: 'supplierinvoices', card: 'fourn/facture/card.php',  labelKey: 'DolibarrTypeSupplierInvoice' },
    shi:  { api: 'shipments',        card: 'expedition/card.php',     labelKey: 'DolibarrTypeShipment' },
    con:  { api: 'contracts',        card: 'contrat/card.php',        labelKey: 'DolibarrTypeContract' },
    tic:  { api: 'tickets',          card: 'ticket/card.php',         labelKey: 'DolibarrTypeTicket' },
    proj: { api: 'projects',         card: 'projet/card.php',         labelKey: 'DolibarrTypeProject' },
    int:  { api: 'interventions',    card: 'fichinter/card.php',      labelKey: 'DolibarrTypeIntervention' },
    mem:  { api: 'members',          card: 'adherents/card.php',      labelKey: 'DolibarrTypeMember' },
};

export function getDolibarrObjectTypeMeta(type){
    if(!type){
        return null;
    }
    return DOLIBARR_OBJECT_TYPES[type.toLowerCase()] || null;
}

export function getDolibarrCardUrl(dolUrl, type, id){
    let meta = getDolibarrObjectTypeMeta(type);
    if(!meta || !dolUrl){
        return null;
    }
    let url = new URL(dolUrl + meta.card);
    url.searchParams.set('id', id);
    return url.toString();
}

/**
 * Turn the { type: {addon, example} } map returned by the crmclientconnector
 * `numberingpatterns/` endpoint into { type: RegExp } detection patterns, by escaping the
 * example's literal characters and replacing each run of digits with a \d{n} of the same
 * length (more precise than a generic \d+, so a phone number or date in the mail body is
 * less likely to be mistaken for a ref).
 * @param {Object} numberingData as returned by GET crmclientconnector/numberingpatterns/
 * @returns {Object} { type: RegExp }
 */
export function buildRefDetectionPatterns(numberingData){
    let patterns = {};
    if(!numberingData){
        return patterns;
    }

    Object.entries(numberingData).forEach(([type, info]) => {
        if(!info || !info.example){
            return;
        }
        let escaped = info.example.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let reSource = escaped.replace(/\\?\d+/g, (match) => {
            let digitsOnly = match.replace(/\\/g, '');
            return '\\d{'+digitsOnly.length+'}';
        });
        try {
            patterns[type] = new RegExp(reSource, 'g');
        } catch (error) {
            console.error('buildRefDetectionPatterns: failed to build pattern for type '+type, error);
        }
    });

    return patterns;
}

/**
 * Scan a free text (mail subject/body) for document references matching the patterns built by
 * buildRefDetectionPatterns().
 * @param {string} text
 * @param {Object} patterns { type: RegExp }
 * @returns {Array<{type: string, ref: string}>}
 */
export function detectDolibarrRefsInText(text, patterns){
    let found = [];
    if(!text || !patterns){
        return found;
    }

    Object.entries(patterns).forEach(([type, regex]) => {
        regex.lastIndex = 0;
        let match;
        while((match = regex.exec(text)) !== null){
            found.push({type: type, ref: match[0]});
            if(match.index === regex.lastIndex){
                regex.lastIndex++; // avoid an infinite loop on a zero-length match
            }
        }
    });

    return found;
}

/**
 * Dolibarr embeds a trackid ("<prefix><id>@<sha1>") in outgoing emails as
 * X-Dolibarr-TRACKID and Feedback-ID, and swiftmailer reuses it inside the
 * Message-ID it generates. That Message-ID then shows up in References/
 * In-Reply-To on any reply, which is how we can link a reply back to the
 * Dolibarr record that originated the thread.
 * @param {Object} headers headers map as returned by messenger.messages.getFull() (lower-case header names, array of raw values)
 * @returns {{type: string, id: string}|null}
 */
export function extractDolibarrRef(headers){
    if(!headers){
        return null;
    }

    const trackIdPattern = /([a-z]{2,6})(\d+)@[0-9a-f]{20,64}/i;

    let trackIdHeader = headers['x-dolibarr-trackid'];
    if(Array.isArray(trackIdHeader) && trackIdHeader.length > 0){
        let match = trackIdHeader[0].match(trackIdPattern);
        if(match){
            return { type: match[1].toLowerCase(), id: match[2] };
        }
    }

    let feedbackIdHeader = headers['feedback-id'];
    if(Array.isArray(feedbackIdHeader) && feedbackIdHeader.length > 0){
        let match = feedbackIdHeader[0].match(/^([a-z]{2,6})(\d+):[0-9a-f]{20,64}:/i);
        if(match){
            return { type: match[1].toLowerCase(), id: match[2] };
        }
    }

    let headersToScan = ['references', 'in-reply-to', 'message-id'];
    for (const headerName of headersToScan) {
        let values = headers[headerName];
        if(!Array.isArray(values)){
            continue;
        }
        for (const value of values) {
            let match = value.match(/dolibarr-([a-z]{2,6})(\d+)@[0-9a-f]{20,64}/i);
            if(match){
                return { type: match[1].toLowerCase(), id: match[2] };
            }
        }
    }

    return null;
}

/**
 * Read the trackid off a message's headers (X-Dolibarr-TRACKID, Feedback-ID,
 * or embedded in References/In-Reply-To on a reply) and resolve it against
 * DOLIBARR_OBJECT_TYPES. Mirrors getQuotationHeaders()'s style: fetches the
 * full message itself so callers don't need to.
 * @param {number} id message id
 * @returns {Promise<{type: string, id: string}|null>}
 */
export async function getDolibarrTrackIdFromMessage(id){
    let full = await messenger.messages.getFull(id);
    if(!full || !full.headers){
        return null;
    }
    return extractDolibarrRef(full.headers);
}


export async function getDolibarrUrl() {
    let configData = await messenger.storage.local.get({
        dolibarrApiUrl: '',
        dolibarrApiKey: ''
    });

    let apiKey = configData.dolibarrApiKey;
    let dolUrl = configData.dolibarrApiUrl;


    if(dolUrl.length > 0 && dolUrl.slice(-1) != '/'){ dolUrl = dolUrl + '/';  }
    return dolUrl;
}


// function getAllStorageSyncData(top_key) {
//     // Immediately return a promise and start asynchronous work
//     return new Promise((resolve, reject) => {
//         // Asynchronously fetch all data from storage.sync.
//         browser.storage.local.get(top_key, (items) => {
//             // Pass any observed errors down the promise chain.
//             if (browser.runtime.lastError) {
//                 return reject(browser.runtime.lastError);
//             }
//             // Pass the data retrieved from storage down the promise chain.
//             resolve(items);
//         });
//     });
// }



function localizeMsgTags(text) {
    return text.replace(/__MSG_(\w+)__/g, function(match, v1) {
        return v1 ? chrome.i18n.getMessage(v1) : '';
    });
}

export function localizeHtmlPage() {
    // Localize using __MSG_***__ data tags
    var data = document.querySelectorAll('[data-localize]');

    for (var i in data) if (data.hasOwnProperty(i)) {
        var obj = data[i];
        var tag = obj.getAttribute('data-localize').toString();
        var msg = localizeMsgTags(tag);

        if (msg != tag) {
            obj.textContent = msg;
        }
    }

    // Localize everything else by replacing __MSG_***__ tags in text nodes and attributes
    var walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
        if (node.nodeValue.includes('__MSG_')) {
            node.nodeValue = localizeMsgTags(node.nodeValue);
        }
    }

    document.querySelectorAll('*').forEach(function(el) {
        for (var attr of Array.from(el.attributes)) {
            if (attr.value.includes('__MSG_')) {
                el.setAttribute(attr.name, localizeMsgTags(attr.value));
            }
        }
    });
}

/**
 *
 * @param fullName
 * @returns {{}}
 */
export function parseName(fullName) {
    const name = fullName.split(' ')
    const person = {}
    if (name.length > 1) {
        // check if name is first element
        if(name[0] === name[0].toUpperCase()){
            person.firstName = name.pop()
            person.lastName = name.join(' ')
        }else{
            person.lastName = name.pop()
            person.firstName = name.join(' ')
        }

    } else {
        person.lastName = ""
        person.firstName = fullName
    }

    return person
}


/**
 * //stringToEl('<li>text</li>'); //OUTPUT: <li>text</li>
 * @param {*} html 
 * @returns 
 */
export function parseHTML(html) {
    var parser = new DOMParser(),
        content = 'text/html',
        DOM = parser.parseFromString(html, content);

    // return element
    return DOM.body.childNodes[0];
}


/**
 *
 * @param stringToParse
 */
export function searchPhonesInString(stringToParse, stringIsHtml = false){

    // if(stringToParse == undefined){
    //     return [];
    // }

    if(stringIsHtml){
        return searchPhonesInDom(parseHTML(stringToParse));
    }

    let matchPhoneNumbers = [];
    let phoneNumbers = [];
    const regexp = new RegExp("(?:(?:(?:\\+|00)33[ ]?(?:\\(0\\)[ ]?)?)|0){1}[1-9]{1}([ .-]?)(?:\\d{2}\\1?){3}\\d{2}$","gm");
    matchPhoneNumbers = [...stringToParse.matchAll(regexp)];
    for (const match of matchPhoneNumbers) {
        phoneNumbers.push(match[0]);
    }

    return phoneNumbers;
}


/**
 *
 * @param {HTMLElement} el
 */
export function searchPhonesInDom(el){

    let phonesNumbers = [];

    let links = document.getElementsByTagName('a');
    for (var i = 0; i < links.length; i++) {
        let link = links[i];
        if (link.href.startsWith('tel:')) {
            let phone = link.href
            // TODO : Format phone number before push
            phonesNumbers.push(phone);
        }
    }

    if(phonesNumbers.length == 0){
        phonesNumbers = searchPhonesInString(el.textContent);
    }

    return phonesNumbers;
}

export function cleanPhoneNumber(string){
    return string.replace(/[\(\)\s\-]/g, '');
}


export async function getMessageBody(id){
    let messageBody = await messenger.messages.getFull(id);
    if(!messageBody){
        return false;
    }

    let obj = {
      html: '',
      txt: '',
    };


    let multipart = messageExtractMultipart(messageBody);

    if(multipart){
        multipart.parts.forEach((item) => {
            if(item.contentType == "text/html"){
                obj.html = item.body;
            }else if(item.contentType == "text/plain"){
                obj.txt = item.body;
            }
        });
    }


    return obj;
}

function messageExtractMultipart(item){

    if(item.hasOwnProperty('contentType') && item.contentType == "multipart/alternative"){
        return item;
    }

    let find = false;

    if(item.hasOwnProperty('parts')){
        item.parts.forEach((subItem) => {
            let subExtract = messageExtractMultipart(subItem);
            if(subExtract !== false){
                find = subExtract;
                return ;
            }
        });
    }

    return find;
}

export function isValidHttpUrl(string) {
    let url;

    try {
        url = new URL(string);
    } catch (_) {
        return false;
    }

    return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * Function to convert JSON data to HTML table
 * @param {} JsonTitle
 * @param {} jsonData
 * @param {HTMLElement} container
 */
export function jsonToTable(JsonTitle, jsonData, container, tableClass = 'dolibarr-table dolibarr-table-stripped', searchInText = ''){

    let appendToTable = false;

    if(container.tagName == 'table' ){
        appendToTable = true;
    }

    // Create the table element
    let table  = document.createElement("table");
    if(tableClass.length > 0) {
        table.classList.add(...tableClass.split(" "));
    }




    // Get the keys (column names) of the first object in the JSON data
    let cols = Object.values(JsonTitle);

    // Create the header element
    let thead = document.createElement("thead");
    let tr = document.createElement("tr");
    tr.classList.add('table-title');

    // Loop through the column names and create header cells
    cols.forEach((item) => {
        let th = document.createElement("th");
        th.textContent = item; // Set the column name as the text of the header cell
        tr.appendChild(th); // Append the header cell to the header row
    });
    thead.appendChild(tr); // Append the header row to the header

    if(appendToTable) {
        table.appendChild(tr);  // Append the header to the table
    }
    else{
        container.appendChild(tr);  // Append the header to the table
    }


    // Loop through the JSON data and create table rows
    jsonData.forEach((item) => {
        let tr = document.createElement("tr");

        // Get the values of the current object in the JSON data
        // let vals = Object.values(item);

        // Loop through the values and create table cells
        Object.entries(item).forEach(([colKey, elem]) => {
            let td = document.createElement("td");

            if(typeof elem === 'object' && elem !== null){
                td.appendChild(parseHTML(elem.html));

                if(elem.hasOwnProperty('class') ){
                    td.classList.add(...elem.class.split(" "));
                }

                if(elem.hasOwnProperty('hightLight') && searchInText && searchInText.length > 0){
                    if(searchInText.includes(elem.hightLight)){
                        td.classList.add('hightlight');
                    }
                    td.classList.add(...elem.hightLight.split(" "));
                }
            }
            else{
                td.textContent = elem; // Set the value as the text of the table cell
            }

            tr.appendChild(td); // Append the table cell to the table row
        });



        if(appendToTable) {
            table.appendChild(tr); // Append the table row to the table
        }
        else{
            container.appendChild(tr); // Append the table row to the table
        }
    });

    if(!appendToTable) {
        container.appendChild(table) // Append the table to the container element
    }
}

export function updateBadgeMessageDisplayAction(tab, commentCount){

    browser.messageDisplayAction.setBadgeText({
        tabId: tab.id,
        text: commentCount > 0 ? `${commentCount}` : ""
    });

    browser.messageDisplayAction.setBadgeBackgroundColor({
        tabId: tab.id,
        color: commentCount > 0 ? "#d31b11" : "#BDC3C7"
    });
}

/**
 * @param msg one entry from GET crmclientconnector/emailusermsgs
 * @param {number|string|null} [currentUserId] id of the Dolibarr user behind the configured API
 * key (see getCurrentDolibarrUser()) - when it matches msg.fk_user_creat, an edit icon is shown
 * next to the trash one, letting the author rewrite their own comment in place.
 */
export function getMsgTpl(msg, currentUserId) {
    // create a new div element
    let container = document.createElement("div");
    container.id = 'mail-message-' + msg.id;
    container.classList.add('mail-msg-box');

    if(typeof msg.user_mail_hash !== undefined) {
        let imgContainer = document.createElement("div");
        imgContainer.classList.add('mail-msg-box__img');

        let img = document.createElement("img");
        img.src = `https://www.gravatar.com/avatar/${msg.user_mail_hash}?d=identicon`;
        img.classList.add('mail-msg-box__img_user');
        img.title = msg.user_full_name;
        imgContainer.appendChild(img);

        container.appendChild(imgContainer);
    }


    let message = document.createElement("div");
    message.classList.add('mail-msg-box__message');

    // Add Action BTN
    let messageBtnAction = document.createElement("div");
    messageBtnAction.classList.add('action-btn-list');

    let messageTxt = document.createElement("div");
    messageTxt.classList.add('dolibarr-textarea');
    messageTxt.disabled = true;
    messageTxt.innerText = msg.message;

    let isAuthor = currentUserId !== null && currentUserId !== undefined
        && msg.fk_user_creat !== null && msg.fk_user_creat !== undefined
        && parseInt(msg.fk_user_creat) === parseInt(currentUserId);

    if(isAuthor){
        let editingBox = null;

        // Toggled via inline style rather than the .hidden-field class : both
        // .action-btn-list and ".mail-msg-box-list .dolibarr-textarea" (which matches
        // messageTxt) declare their own "display" at a specificity/source-order .hidden-field
        // can't win against, so adding that class here would silently do nothing.
        let exitEditMode = () => {
            if(editingBox){
                editingBox.remove();
                editingBox = null;
            }
            messageBtnAction.style.display = '';
            messageTxt.style.display = '';
        };

        let enterEditMode = () => {
            if(editingBox){
                return;
            }
            messageBtnAction.style.display = 'none';
            messageTxt.style.display = 'none';

            editingBox = document.createElement('div');
            editingBox.classList.add('mail-msg-box__edit');

            let textarea = document.createElement('textarea');
            textarea.classList.add('dolibarr-textarea');
            textarea.value = msg.message;
            editingBox.appendChild(textarea);
            textareaAutosize(textarea);

            let editActions = document.createElement('div');
            editActions.classList.add('mail-msg-box__edit-actions');

            let saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.classList.add('btn', '--submit');
            saveBtn.textContent = browser.i18n.getMessage('Save');
            saveBtn.addEventListener('click', () => {
                let newMessage = textarea.value;
                saveBtn.disabled = true;
                callDolibarrApi(
                    'crmclientconnector/emailusermsgs/'+ msg.id,
                    {},
                    'PUT',
                    JSON.stringify({message: newMessage}),
                    ()=>{
                        msg.message = newMessage;
                        messageTxt.innerText = newMessage;
                        exitEditMode();
                        showToast(browser.i18n.getMessage('EditSuccess'), 'success');
                    },
                    (err)=>{
                        saveBtn.disabled = false;
                        showToast(browser.i18n.getMessage('EditError')+' ('+err+')', 'error');
                    }
                );
            });
            editActions.appendChild(saveBtn);

            let cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.classList.add('btn-tiny-action');
            cancelBtn.textContent = browser.i18n.getMessage('Cancel');
            cancelBtn.addEventListener('click', () => exitEditMode());
            editActions.appendChild(cancelBtn);

            editingBox.appendChild(editActions);
            messageTxt.after(editingBox);
            textarea.focus();
        };

        let editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.classList.add('btn-tiny-action');
        editBtn.title = browser.i18n.getMessage('Edit');
        let editIcon = document.createElement('img');
        editIcon.src = browser.runtime.getURL("images/edit-icon.svg");
        editIcon.classList.add('btn-tiny-action-icon');
        editBtn.appendChild(editIcon);
        editBtn.addEventListener('click', enterEditMode);
        messageBtnAction.appendChild(editBtn);
    }

    let deleteDropdown = buildConfirmDropdown({
        triggerIcon: browser.runtime.getURL("images/trash-icon.svg"),
        triggerTitle: browser.i18n.getMessage('Actions'),
        confirmLabel: browser.i18n.getMessage('ConfirmDelete'),
        danger: true,
        solidConfirm: true,
        onConfirm: () => {
            callDolibarrApi(
                'crmclientconnector/emailusermsgs/'+ msg.id,
                {},
                'DELETE',
                {},
                (resData)=>{
                    container.remove();
                }, (err)=>{

                });
        },
        onToggle: (open) => {
            messageBtnAction.classList.toggle('action-btn-list--force-visible', open);
        }
    });

    messageBtnAction.appendChild(deleteDropdown);
    message.appendChild(messageBtnAction);



    message.appendChild(messageTxt);

    let date = document.createElement("div");
    date.classList.add('time_date');
    let eventDate = new Date(parseInt(msg.date_creation) * 1000);
    date.innerText = eventDate.toLocaleDateString(navigator.language || navigator.browserLanguage || (navigator.languages || ["en"])[0], {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
    })
    message.appendChild(date);

    container.appendChild(message);
    return container;
}

export function refreshComments(tabs, accountEmail, msgId){
    // Get all notes
    callDolibarrApi('crmclientconnector/emaillinks/quicksearch', {accountEmail: accountEmail, msgId: msgId}, 'GET', {}, (resData)=>{
        callDolibarrApi('crmclientconnector/emailusermsgs', {sqlfilters: `(fk_email_link:=:${resData.id})`}, 'GET', {}, (resDataMsg)=>{
            getCurrentDolibarrUser().then((currentUser)=>{
                let lisMsgContainer = document.getElementById('dolibarr-notes-list-container');
                if(tabs !== false){
                    updateBadgeMessageDisplayAction(tabs, resDataMsg.length);
                }
                lisMsgContainer.textContent = '';
                resDataMsg.forEach((msg) => {
                    // create a new div element
                    lisMsgContainer.appendChild(getMsgTpl(msg, currentUser ? currentUser.id : null));
                });
            });
        });
    });
}

function adjustHeight(input) {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
}

/**
 * Ajuste la hauteur du champ par rapport au contenu
 * @param {NodeList} input Liste d'objets textarea
 */
export function textareaAutosize(input) {
    window.addEventListener('load', () => {adjustHeight(input);});
    window.addEventListener('resize',() => {adjustHeight(input);});
    input.addEventListener('input',() => {adjustHeight(input);});
}