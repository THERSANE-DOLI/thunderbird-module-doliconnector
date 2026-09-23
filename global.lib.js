/**
 * Show a dismissible toast in the top-right corner of the page, instead of an inline
 * success/error message in the page body (which shifts surrounding content around). Creates its
 * own fixed-position container on first use, so no host page markup is required - usable from
 * any page in the extension. Appended to <html> (not <body>) and given its fixed positioning
 * inline (on top of the same rule in global.css) : on a long, scrollable page (e.g. options.html,
 * whose form can be taller than the visible area), a container appended under <body> can end up
 * positioned relative to something other than the true viewport (a body-level CSS quirk, or a
 * host embedding the page in a way that resizes <body> to its full content height rather than
 * scrolling it) - this otherwise made the toast scroll away with the page's own content instead
 * of staying pinned in the corner as intended.
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
        container.setAttribute('style', 'position:fixed!important;top:10px!important;right:10px!important;left:auto!important;bottom:auto!important;');
        document.documentElement.appendChild(container);
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

// Shared by buildConfirmDropdown() and buildDropdownMenu(): the closer of whichever one of their
// instances is currently open on the page, so opening a new one can explicitly close it. Outside-
// click alone can't do this: each trigger's own click handler calls stopPropagation() (so its
// click doesn't also register as the "outside click" that would close it right back), which as a
// side effect stops that same click from ever bubbling to document, where every OTHER dropdown's
// outside-click listener lives - so without this, clicking one open dropdown's trigger while
// another is open never reaches the first one's close logic and both stay open.
let openDropdownCloser = null;

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
    let closeThisDropdown = () => {
        setOpen(false);
        document.removeEventListener('click', onOutsideClick);
        if(openDropdownCloser === closeThisDropdown){ openDropdownCloser = null; }
    };
    let onOutsideClick = (event) => {
        if(!wrapper.contains(event.target)){
            closeThisDropdown();
        }
    };

    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        let willOpen = menu.classList.contains('hidden-field');
        if(openDropdownCloser){ openDropdownCloser(); }
        if(willOpen){
            setOpen(true);
            openDropdownCloser = closeThisDropdown;
            // Deferred, so the click that opened the menu isn't also the outside click that closes it.
            setTimeout(() => document.addEventListener('click', onOutsideClick), 0);
        }
    });

    confirmBtn.addEventListener('click', (event) => {
        event.preventDefault();
        closeThisDropdown();
        onConfirm();
    });

    return wrapper;
}

/**
 * Build an action button that opens a dropdown menu of items - either plain navigation links
 * (e.g. "View card" plus a few "create X for this thirdparty" shortcuts) or, when an item gives
 * onClick instead of href, a plain button running that handler (e.g. a row-level "Lier" action
 * that must call linkDocument() and show a toast, not navigate anywhere). Same trigger/menu/
 * outside-click interaction as buildConfirmDropdown(), generalized to a list of items instead of
 * a single confirm action. discreet:true renders the same small "⋯" trigger
 * buildConfirmDropdown() uses (for e.g. a table row's own actions menu) instead of the default
 * full-size .btn.btn-primary trigger.
 * @param {{triggerLabel: string, triggerTitle?: string, discreet?: boolean, items: Array<{label: string, href?: string, target?: string, onClick?: () => void, icon?: string, iconChar?: string, separatorBefore?: boolean}>}} options
 *   icon: a dolicon CSS class (e.g. "icon-plus"), rendered as an <i>. iconChar: a plain
 *   character/glyph instead, for when no matching dolicon glyph exists (e.g. a refresh symbol) -
 *   at most one of the two is used, icon wins if both are given. separatorBefore: renders a
 *   divider line above this item, for a single item (or run of items) that isn't the same kind
 *   of action as the rest (e.g. "Refresh" among a list of "create X" shortcuts).
 * @returns {HTMLElement} the dropdown wrapper element (trigger + menu)
 */
export function buildDropdownMenu({triggerLabel, triggerTitle, discreet = false, items}){
    let wrapper = document.createElement('div');
    wrapper.classList.add('confirm-dropdown', 'action-menu-dropdown');

    let trigger = document.createElement('button');
    trigger.type = 'button';
    if(triggerTitle){ trigger.title = triggerTitle; }

    if(discreet){
        // Same small trigger as buildConfirmDropdown()'s "⋯", for a menu that shouldn't draw as
        // much attention as the popup header's main "Actions" button (e.g. one per table row).
        trigger.classList.add('btn-tiny-action', 'confirm-dropdown__trigger');
        trigger.textContent = triggerLabel;
    }else{
        trigger.classList.add('action-menu-dropdown__trigger');

        let triggerText = document.createElement('span');
        triggerText.textContent = triggerLabel;
        trigger.appendChild(triggerText);

        let caret = document.createElement('span');
        caret.classList.add('action-menu-dropdown__caret');
        caret.textContent = '▾';
        trigger.appendChild(caret);
    }

    wrapper.appendChild(trigger);

    let menu = document.createElement('div');
    menu.classList.add('confirm-dropdown__menu', 'hidden-field');

    items.forEach((item) => {
        if(item.separatorBefore){
            let separator = document.createElement('hr');
            separator.classList.add('confirm-dropdown__separator');
            menu.appendChild(separator);
        }

        let link = document.createElement(item.onClick ? 'button' : 'a');
        link.classList.add('confirm-dropdown__item');
        if(item.onClick){
            link.type = 'button';
        }

        if(item.icon){
            let icon = document.createElement('i');
            icon.classList.add(item.icon, 'confirm-dropdown__item-icon');
            link.appendChild(icon);
        }else if(item.iconChar){
            let icon = document.createElement('span');
            icon.classList.add('confirm-dropdown__item-icon', 'confirm-dropdown__item-icon--char');
            icon.textContent = item.iconChar;
            link.appendChild(icon);
        }

        link.append(item.label);

        if(item.onClick){
            link.addEventListener('click', (event) => {
                event.preventDefault();
                item.onClick(event);
            });
        }else{
            link.href = item.href;
            if(item.target){ link.target = item.target; }
        }

        menu.appendChild(link);
    });

    wrapper.appendChild(menu);

    let setOpen = (open) => {
        menu.classList.toggle('hidden-field', !open);
        wrapper.classList.toggle('action-menu-dropdown--open', open);
    };
    let closeThisDropdown = () => {
        setOpen(false);
        document.removeEventListener('click', onOutsideClick);
        if(openDropdownCloser === closeThisDropdown){ openDropdownCloser = null; }
    };
    let onOutsideClick = (event) => {
        if(!wrapper.contains(event.target)){
            closeThisDropdown();
        }
    };

    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        let willOpen = menu.classList.contains('hidden-field');
        if(openDropdownCloser){ openDropdownCloser(); }
        if(willOpen){
            setOpen(true);
            openDropdownCloser = closeThisDropdown;
            // Deferred, so the click that opened the menu isn't also the outside click that closes it.
            setTimeout(() => document.addEventListener('click', onOutsideClick), 0);
        }
    });

    // Link items are left as plain links (so ctrl/middle-click "open in new tab" works as
    // expected) rather than intercepted - either way (link or onClick button), just close the
    // menu once an item is clicked.
    menu.addEventListener('click', (event) => {
        if(event.target.closest('.confirm-dropdown__item')){
            closeThisDropdown();
        }
    });

    return wrapper;
}

/**
 * A mailbox can only ever talk to one Dolibarr at a time, but the extension can be configured
 * with several Dolibarr "connections" (see getDolibarrConnections() below) - this is the shared
 * per-page context that tells every config-dependent function (checkConfig, callDolibarrApi,
 * etc.) which one to resolve when a call site doesn't pass an explicit accountId. Set once, near
 * the top of messagePopup/popup.js, right after the displayed message is resolved - popup.js is a
 * fresh module instance per popup open (one message, no concurrency), so a shared mutable flag is
 * safe there, same as forceFreshLoad/setForceFreshLoad() above. background.js is a shared,
 * non-persistent event page that can process onMessageDisplayed for two different tabs
 * concurrently, so it does NOT use this - it resolves and threads an explicit accountId through
 * its own call chain instead (see checkAndInjectDolibarrBanner()).
 */
let activeAccountId = null;

/**
 * @param {string|null} accountId Thunderbird account id (MessageHeader.folder.accountId), or null
 *   to fall back to the default connection for every subsequent unqualified call on this page.
 */
export function setActiveAccountContext(accountId){
    activeAccountId = accountId || null;
}

/**
 * Reads (and lazily migrates) the multi-Dolibarr connection list. If dolibarrConnections doesn't
 * exist yet but the legacy single-server flat keys (dolibarrApiUrl, dolibarrApiKey,
 * dolibarrApiEntity, dolibarrHttpAuth..., dolibarrCrmConnectorEnabled) do, synthesizes one
 * connection from them - flagged as the default - and
 * persists it, so a user who never reopens the options page after updating keeps working exactly
 * as before (this runs lazily from any entry point, not just the options page). Legacy keys are
 * left in storage afterwards (unused, but harmless) rather than removed, to avoid any
 * write-ordering risk with a concurrent options.js save.
 * @returns {Promise<{connections: Array<object>, accountConnections: Object<string,string>}>}
 */
export async function getDolibarrConnections(){
    let stored = await browser.storage.local.get({
        dolibarrConnections: null,
        dolibarrAccountConnections: {}
    });

    if(Array.isArray(stored.dolibarrConnections)){
        return {connections: stored.dolibarrConnections, accountConnections: stored.dolibarrAccountConnections || {}};
    }

    let legacy = await browser.storage.local.get({
        dolibarrApiKey: '',
        dolibarrApiUrl: '',
        dolibarrApiEntity: 1,
        dolibarrHttpAuthEnabled: false,
        dolibarrHttpAuthUser: '',
        dolibarrHttpAuthPassword: '',
        dolibarrCrmConnectorEnabled: undefined,
        dolibarrUseNotes: false
    });

    if(!legacy.dolibarrApiUrl){
        // Nothing configured yet at all (fresh install) - no connection to migrate.
        return {connections: [], accountConnections: {}};
    }

    let migrated = [{
        id: 'default',
        name: browser.i18n.getMessage('DolibarrConnectionDefaultName') || 'Dolibarr',
        apiUrl: legacy.dolibarrApiUrl,
        apiKey: legacy.dolibarrApiKey,
        apiEntity: legacy.dolibarrApiEntity,
        httpAuthEnabled: legacy.dolibarrHttpAuthEnabled,
        httpAuthUser: legacy.dolibarrHttpAuthUser,
        httpAuthPassword: legacy.dolibarrHttpAuthPassword,
        crmConnectorEnabled: legacy.dolibarrCrmConnectorEnabled !== undefined ? legacy.dolibarrCrmConnectorEnabled : legacy.dolibarrUseNotes,
        isDefault: true
    }];

    await browser.storage.local.set({dolibarrConnections: migrated});

    return {connections: migrated, accountConnections: stored.dolibarrAccountConnections || {}};
}

/**
 * Resolves which Dolibarr connection a given Thunderbird account should use : an explicit mapping
 * in dolibarrAccountConnections if one exists (and still points at a connection that actually
 * exists - a stale mapping to a since-deleted connection falls back the same as "no mapping"),
 * otherwise the connection flagged isDefault, otherwise (defensive, shouldn't normally happen)
 * the first connection. Null if no connection is configured at all.
 * @param {string|null|undefined} accountId defaults to the shared setActiveAccountContext() value
 * @returns {Promise<object|null>}
 */
export async function resolveDolibarrConnection(accountId){
    let resolvedAccountId = accountId !== undefined ? accountId : activeAccountId;
    let {connections, accountConnections} = await getDolibarrConnections();

    if(connections.length === 0){
        return null;
    }

    let mappedId = resolvedAccountId ? accountConnections[resolvedAccountId] : null;
    if(mappedId){
        let mapped = connections.find((c) => c.id === mappedId);
        if(mapped){ return mapped; }
    }

    return connections.find((c) => c.isDefault) || connections[0];
}

/**
 * Whether the Dolibarr crmclientconnector module (custom/crmclientconnector on the Dolibarr
 * side) is installed and enabled - every feature built on its REST endpoints
 * (crmclientconnector/*: shared notes, the "Lier" tab and detected-ref card's Link button,
 * linked documents on the Info tab, ref auto-detection via numbering patterns, the domain
 * exclusion list) must check this before calling one of them, since those calls 404/500
 * otherwise. Resolves the connection for accountId (defaulting to the shared
 * setActiveAccountContext() value, see resolveDolibarrConnection()) rather than a single global
 * setting, since whether the CRM Client Connector module is installed is a property of a specific
 * Dolibarr server, not a user preference.
 * @param {string} [accountId]
 * @returns {Promise<boolean>}
 */
export async function isCrmConnectorEnabled(accountId){
    let connection = await resolveDolibarrConnection(accountId);
    return !!(connection && connection.crmConnectorEnabled);
}

/**
 * @param {string} [accountId]
 * @returns {Promise<boolean>}
 */
export async function checkConfig(accountId){
    let connection = await resolveDolibarrConnection(accountId);
    if(!connection){ return false; }

    let apiKey = connection.apiKey || '';
    let dolUrl = connection.apiUrl || '';
    let apiEntity = connection.apiEntity || '';

    if(apiKey.length == 0 || dolUrl.length == 0 || String(apiEntity).length == 0){  return false; }

    if(connection.httpAuthEnabled
        && ((connection.httpAuthUser || '').length == 0 || (connection.httpAuthPassword || '').length == 0)){
        return false;
    }

    return true;
}

/**
 * Right(s) required for each Dolibarr REST endpoint this extension calls, keyed by the endpoint's
 * "family" (its path with any trailing numeric id stripped, see getEndpointFamily()) - labels are
 * copied verbatim from Dolibarr's own French permissions screen (Permission{id} in
 * htdocs/langs/fr_FR/*.lang on the Dolibarr side), so a French-speaking Dolibarr admin can find and
 * grant the exact same right with no translation ambiguity. An entry can list several {id, label}
 * alternatives when Dolibarr accepts any one of several rights (OR semantics) - see users/info's
 * own getInfo() check.
 * @type {Object<string, Array<{id:number,label:string}>>}
 */
const DOLIBARR_ENDPOINT_RIGHTS = {
    'users/info': [
        {id: 342, label: "Créer/modifier ses propres informations utilisateur"},
        {id: 251, label: "Consulter les autres utilisateurs, les groupes et leurs permissions"}
    ],
    'thirdparties': [{id: 121, label: "Consulter les tiers (sociétés) liés à l'utilisateur"}],
    'orders': [{id: 81, label: "Consulter les commandes clients"}],
    'proposals': [{id: 21, label: "Consulter les propositions commerciales"}],
    'invoices': [{id: 11, label: "Lire les factures (et paiements) clients"}],
    'supplierorders': [{id: 1182, label: "Consulter les commandes fournisseur"}],
    'supplierinvoices': [{id: 1231, label: "Consulter les factures fournisseur"}],
    'shipments': [{id: 101, label: "Lire les expéditions"}],
    'contracts': [{id: 161, label: "Lire les contrats"}],
    'tickets': [{id: 56001, label: "Voir tickets"}],
    'projects': [{id: 41, label: "Lire les projets et les tâches (projets partagés et projets dont je suis un contact)."}],
    'interventions': [{id: 61, label: "Lire les fiches d'intervention"}],
    'members': [{id: 71, label: "Consulter les fiches adhérents"}],
    'agendaevents': [{id: 2401, label: "Lire les actions (événements ou tâches) liées à son compte utilisateur (si propriétaire de l'événement ou simplement assigné à l'événement)"}],
    // crmclientconnector/objectcategories/{type}/{id} requires the same read right as that type's
    // own core endpoint above (see CATEGORY_TYPE_RIGHTS in api_crmclientconnector.class.php on the
    // Dolibarr side), except 'act' which requires agenda->allactions->read (not myactions), since
    // listing an agenda event's categories isn't restricted to the current user's own events.
    'crmclientconnector/objectcategories/ord':  [{id: 81, label: "Consulter les commandes clients"}],
    'crmclientconnector/objectcategories/pro':  [{id: 21, label: "Consulter les propositions commerciales"}],
    'crmclientconnector/objectcategories/inv':  [{id: 11, label: "Lire les factures (et paiements) clients"}],
    'crmclientconnector/objectcategories/sord': [{id: 1182, label: "Consulter les commandes fournisseur"}],
    'crmclientconnector/objectcategories/sinv': [{id: 1231, label: "Consulter les factures fournisseur"}],
    'crmclientconnector/objectcategories/tic':  [{id: 56001, label: "Voir tickets"}],
    'crmclientconnector/objectcategories/proj': [{id: 41, label: "Lire les projets et les tâches (projets partagés et projets dont je suis un contact)."}],
    'crmclientconnector/objectcategories/int':  [{id: 61, label: "Lire les fiches d'intervention"}],
    'crmclientconnector/objectcategories/mem':  [{id: 71, label: "Consulter les fiches adhérents"}],
    'crmclientconnector/objectcategories/act':  [{id: 2411, label: "Lire les actions (événements ou tâches) des autres"}]
};

/**
 * Strips a trailing numeric id segment (e.g. 'thirdparties/123' -> 'thirdparties',
 * 'crmclientconnector/objectcategories/ord/456' -> 'crmclientconnector/objectcategories/ord') so a
 * call for a specific object matches its endpoint family's static DOLIBARR_ENDPOINT_RIGHTS entry.
 * @param {string} endPoint
 * @returns {string}
 */
function getEndpointFamily(endPoint){
    return endPoint.replace(/\/\d+$/, '');
}

/**
 * In-memory (not persisted - reset on every extension/popup reload) record of Dolibarr endpoints
 * that answered 403 for the current API key, per connection id and endpoint family (see
 * getEndpointFamily()), so the UI can show a discreet "missing rights" warning instead of either
 * staying silent (most callers just log and move on) or, as checkDolibarrConnection() used to,
 * wrongly telling the user their credentials are invalid.
 * @type {Object<string, Object<string, {endpoint:string, dolibarrMessage:?string, requiredRights:?Array<{id:number,label:string}>, timestamp:number}>>}
 */
let forbiddenEndpointsByConnection = {};
let forbiddenEndpointsListeners = [];

function recordForbiddenEndpoint(connectionId, endPoint, dolibarrMessage){
    if(!connectionId){ return; }
    let family = getEndpointFamily(endPoint);
    let byConnection = forbiddenEndpointsByConnection[connectionId] || (forbiddenEndpointsByConnection[connectionId] = {});
    byConnection[family] = {
        endpoint: endPoint,
        dolibarrMessage: dolibarrMessage || null,
        requiredRights: DOLIBARR_ENDPOINT_RIGHTS[family] || null,
        timestamp: Date.now()
    };
    forbiddenEndpointsListeners.forEach((callback) => {
        try {
            callback(connectionId);
        } catch (e) {
            console.error('forbiddenEndpoints listener failed', e);
        }
    });
}

/**
 * The Dolibarr endpoints that have answered 403 (missing right, not invalid credentials - see
 * checkDolibarrConnection()) for accountId's connection so far this session.
 * @param {string} [accountId] defaults to the shared setActiveAccountContext() value
 * @returns {Promise<Array<{endpoint:string, dolibarrMessage:?string, requiredRights:?Array<{id:number,label:string}>, timestamp:number}>>}
 */
export async function getForbiddenEndpoints(accountId){
    let connection = await resolveDolibarrConnection(accountId);
    if(!connection){ return []; }
    let byConnection = forbiddenEndpointsByConnection[connection.id] || {};
    return Object.values(byConnection).sort((a, b) => a.endpoint.localeCompare(b.endpoint));
}

/**
 * Subscribes to be notified (with the affected connection's id) whenever a new 403 is recorded, so
 * the popup can refresh its warning icon reactively instead of polling.
 * @param {(connectionId:string)=>void} callback
 * @returns {()=>void} unsubscribe
 */
export function onForbiddenEndpointRecorded(callback){
    forbiddenEndpointsListeners.push(callback);
    return () => {
        forbiddenEndpointsListeners = forbiddenEndpointsListeners.filter((cb) => cb !== callback);
    };
}

/**
 * Calls status (Dolibarr's own REST API status endpoint - api_status.class.php on the Dolibarr
 * side) to verify that the configured API key (and HTTP Basic Auth credentials, if enabled)
 * actually work and that the server can be reached, so the UI can tell an invalid-credentials
 * problem apart from a connection problem - both look like "config incomplete" otherwise.
 *
 * status, not users/info : status checks no business right at all beyond a valid API key (it just
 * returns the Dolibarr version), so it can never 403 for an authenticated user, unlike users/info
 * (which requires user->self->creer, user->user->lire, or being admin - rights most ordinary
 * Dolibarr users don't have - see DOLIBARR_ENDPOINT_RIGHTS['users/info']). That makes it the right
 * endpoint for a pure "is the API reachable with these credentials" check, with no special-casing
 * needed for a 403 that would mean nothing about the credentials themselves. Whether the current
 * user specifically lacks rights on users/info (relevant only as getCurrentDolibarrUser()'s
 * fallback when crmclientconnector's own whoami isn't available) is still surfaced separately, as
 * a discreet non-blocking warning - see getForbiddenEndpoints() - whenever that fallback actually
 * runs and hits it.
 * @param {string} [accountId]
 * @returns {Promise<{status: 'ok'|'auth'|'connection', message: (string|null)}>}
 */
export async function checkDolibarrConnection(accountId){
    return new Promise((resolve) => {
        callDolibarrApi('status', {}, 'GET', {}, () => {
            resolve({status: 'ok', message: null});
        }, (errorMsg, errorInfo) => {
            let status = (errorInfo && errorInfo.type === 'auth') ? 'auth' : 'connection';
            resolve({status, message: errorMsg});
        }, false, accountId);
    });
}


// Set for the rest of the page's lifetime by setForceFreshLoad(), see its own doc comment.
let forceFreshLoad = false;

/**
 * Makes every subsequent callDolibarrApi() GET request on this page bypass the browser's HTTP
 * cache (still updates it with the fresh response, just doesn't read a possibly-stale one) -
 * used by the popup's "Rafraîchir" action, so it actually guarantees fresh data instead of
 * silently serving whatever a cache:true call (see callDolibarrApi() below) happened to cache
 * earlier. A plain page reload alone wouldn't do this : fetch()'s "force-cache" mode is
 * unaffected by navigation/reload, only by the cache entry's own freshness.
 * @param {boolean} enabled
 */
export function setForceFreshLoad(enabled){
    forceFreshLoad = !!enabled;
}

export async function callDolibarrApi(endPoint, getDataParam, type = 'GET', postData, successCallBackFunction = ()=>{}, errorCallBackFunction = ()=>{}, cache = false, accountId){

    let connection = await resolveDolibarrConnection(accountId);
    if(!connection){
        errorCallBackFunction("Fail getting settings", {type: 'auth', status: null});
        return;
    }

    let apiKey = connection.apiKey || '';
    let dolUrl = connection.apiUrl || '';
	let apiEntity = connection.apiEntity;
	if(String(apiEntity || '').length == 0 || apiEntity <= 0){
        apiEntity = 1;
    }
    if(typeof getDataParam.entity === "undefined"){
        getDataParam.entity = apiEntity;
    }

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
    if(connection.httpAuthEnabled && (connection.httpAuthUser || '').length > 0){
        headers['Authorization'] = 'Basic ' + btoa(connection.httpAuthUser + ':' + (connection.httpAuthPassword || ''));
    }

    let cacheMode = "default";
    if(type == 'GET'){
        // forceFreshLoad wins over a call's own cache:true : "reload" always revalidates against
        // the network (updating the cache for next time) instead of reading a cached response.
        cacheMode = forceFreshLoad ? "reload" : (cache ? "force-cache" : "default");
    }

    fetch(finalUrl, {
        method: type,
        headers: headers,
        body: (type.toUpperCase() !== 'GET' && postData) ? postData : undefined,
        cache: cacheMode
    })
    .then(response => {
        if (!response.ok) {
            // Dolibarr's REST API always answers an error with a JSON body of the form
            // {code, message} (e.g. {code: 403, message: "Forbidden: Not allowed"}) - read it so
            // the real Dolibarr message (and not just a generic "Forbidden resource can't be
            // accessed.") can be shown/stored. Falls back to the generic map below if the body
            // isn't there or isn't JSON (e.g. a reverse proxy's own error page).
            return response.json().catch(() => null).then((body) => {
                const statusErrorMap = {
                    404: "Not found",
                    400: "Server understood the request, but request content was invalid.",
                    401: "Unauthorized access.",
                    403: "Forbidden resource can't be accessed.",
                    500: "Internal server error.",
                    503: "Service unavailable."
                };
                let dolibarrMessage = (body && typeof body.message === 'string') ? body.message : null;
                let error = new Error(dolibarrMessage || statusErrorMap[response.status] || "Unknown Error \n.");
                error.status = response.status;
                error.dolibarrMessage = dolibarrMessage;
                throw error;
            });
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
        // 401 and 403 are NOT the same thing : Dolibarr's auth layer (API key / HTTP Basic Auth
        // check) always runs first and answers 401 on its own for bad credentials, before any
        // endpoint-specific permission check ever runs - so 403 always means "valid credentials,
        // missing right on this endpoint", never "invalid credentials" (see checkDolibarrConnection
        // ()'s own comment).
        let errorInfo = {
            type: error.status === 401 ? 'auth' : (error.status === 403 ? 'forbidden' : (error.status ? 'http' : 'network')),
            status: error.status || null,
            dolibarrMessage: error.dolibarrMessage || null
        };
        if(error.status === 403){
            recordForbiddenEndpoint(connection.id, endPoint, error.dolibarrMessage);
        }
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
 * The Dolibarr user identified by the configured API key - used to tell whether the current user
 * authored a given comment, see getMsgTpl()'s edit button. Cached for the page's lifetime since
 * the configured API key doesn't change mid-session.
 *
 * Tries crmclientconnector's own GET whoami first when that module is enabled : unlike Dolibarr
 * core's GET users/info (which requires user->self->creer, user->user->lire, or being admin - see
 * DOLIBARR_ENDPOINT_RIGHTS - rights most users don't have, making it 403 in the common case),
 * whoami has no permission requirement beyond a valid API key. Falls back to users/info when the
 * crmClientConnector module is disabled, or when whoami 404s (an older crmclientconnector version,
 * installed before this endpoint existed) - and degrades to null, same as before, if that fails too.
 * @param {string} [accountId] defaults to the shared setActiveAccountContext() value
 * @returns {Promise<Object|null>} the user object (has .id), or null on error
 */
let currentDolibarrUserPromise = null;
export function getCurrentDolibarrUser(accountId){
    if(!currentDolibarrUserPromise){
        currentDolibarrUserPromise = new Promise((resolve) => {
            let fallbackToUsersInfo = () => {
                callDolibarrApi('users/info', {}, 'GET', {}, (userData)=>{
                    resolve(userData || null);
                }, (errorMsg, errorInfo)=>{
                    if(!errorInfo || errorInfo.status !== 403){
                        // A 403 here just means the configured user lacks the right (already
                        // surfaced separately, see getForbiddenEndpoints()) - anything else is
                        // unexpected and worth a console.error.
                        console.error('getCurrentDolibarrUser failed (users/info)', errorMsg);
                    }
                    resolve(null);
                }, false, accountId);
            };

            isCrmConnectorEnabled(accountId).then((crmEnabled) => {
                if(!crmEnabled){
                    fallbackToUsersInfo();
                    return;
                }
                callDolibarrApi('crmclientconnector/whoami', {}, 'GET', {}, (userData)=>{
                    resolve(userData || null);
                }, (errorMsg, errorInfo)=>{
                    if(errorInfo && errorInfo.status === 404){
                        fallbackToUsersInfo();
                        return;
                    }
                    console.error('getCurrentDolibarrUser failed (whoami)', errorMsg);
                    resolve(null);
                }, false, accountId);
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
 * Finds the .ics/text-calendar event on a message and parses its first VEVENT, for the popup's
 * "Agenda" tab (see messagePopup/popup.js's initAgendaTab()). Checks two places : most real-world
 * calendar invites (Outlook, Google Calendar, Thunderbird's own Lightning...) send the ICS as an
 * *inline* text/calendar MIME part with no Content-Disposition: attachment - listAttachments()
 * deliberately excludes those (its own doc comment : "these parts ... usually make up the
 * readable content of the message"), so listInlineTextParts() is checked first. A genuine .ics
 * *attachment* (Content-Disposition: attachment, e.g. a forwarded invite) is checked as a
 * fallback.
 * @param {number} messageId
 * @returns {Promise<{uid:?string, summary:?string, location:?string, description:?string, organizer:?string, start:?Date, end:?Date, allDay:boolean}|null>}
 */
export async function detectIcsEventFromMessage(messageId){
    let inlineParts = await messenger.messages.listInlineTextParts(messageId);
    let icsPart = inlineParts.find((part) => part.contentType === 'text/calendar');
    if(icsPart){
        return parseIcsEvent(icsPart.content);
    }

    let attachments = await messenger.messages.listAttachments(messageId);
    let icsAttachment = attachments.find((attachment) => {
        return attachment.contentType === 'text/calendar'
            || /\.ics$/i.test(attachment.name || '');
    });
    if(!icsAttachment){
        return null;
    }

    let file = await messenger.messages.getAttachmentFile(messageId, icsAttachment.partName);
    let text = await file.text();
    return parseIcsEvent(text);
}

/**
 * Parses the first VEVENT block of an iCalendar (.ics) file, extracting just the fields the
 * "Agenda" tab needs to preview a calendar invite and prefill Dolibarr's agenda event create
 * form - a full RFC 5545 parser is out of scope, this only handles the handful of properties
 * (SUMMARY, LOCATION, DESCRIPTION, DTSTART, DTEND, ORGANIZER, UID) real-world calendar invites
 * reliably use.
 * @param {string} icsText raw .ics file content
 * @returns {{uid:?string, summary:?string, location:?string, description:?string, organizer:?string, start:?Date, end:?Date, allDay:boolean}|null}
 */
export function parseIcsEvent(icsText){
    if(!icsText){
        return null;
    }

    // Unfold : a line starting with a space/tab is a continuation of the previous line (RFC
    // 5545 section 3.1), used by real calendar software to wrap long lines (e.g. DESCRIPTION).
    let unfolded = icsText.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
    let lines = unfolded.split('\n');

    let veventStart = lines.findIndex((line) => line.trim().toUpperCase() === 'BEGIN:VEVENT');
    let veventEnd = lines.findIndex((line) => line.trim().toUpperCase() === 'END:VEVENT');
    if(veventStart === -1 || veventEnd === -1 || veventEnd <= veventStart){
        return null;
    }

    let props = {};
    lines.slice(veventStart + 1, veventEnd).forEach((line) => {
        let colonIndex = line.indexOf(':');
        if(colonIndex === -1){
            return;
        }
        let left = line.slice(0, colonIndex);
        let value = line.slice(colonIndex + 1);
        let semiIndex = left.indexOf(';');
        let name = (semiIndex === -1 ? left : left.slice(0, semiIndex)).trim().toUpperCase();
        let params = semiIndex === -1 ? '' : left.slice(semiIndex + 1);
        if(!props[name]){
            // First occurrence wins (e.g. a recurring event's overridden instances add more
            // VEVENT blocks later in the file, out of scope here - we only read the first one).
            props[name] = {value: value.trim(), params};
        }
    });

    let unescapeText = (text) => text
        .replace(/\\n/gi, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');

    let parseIcsDate = (prop) => {
        if(!prop){
            return null;
        }
        let m = prop.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
        if(!m){
            return null;
        }
        let [, y, mo, d, h, mi, s, utc] = m;
        if(!h){
            // DATE (no time) : an all-day event, e.g. DTSTART;VALUE=DATE:20250115.
            return {date: new Date(Date.UTC(+y, +mo - 1, +d)), allDay: true};
        }
        if(utc){
            return {date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false};
        }
        // Floating time or TZID-relative (e.g. DTSTART;TZID=Europe/Paris:...) : no timezone
        // database available client-side to convert precisely, so this is read as local time -
        // close enough for a preview/prefill, not exact calendaring math.
        return {date: new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay: false};
    };

    let startInfo = parseIcsDate(props.DTSTART);
    let endInfo = parseIcsDate(props.DTEND);

    let organizer = null;
    if(props.ORGANIZER){
        let cnMatch = props.ORGANIZER.params.match(/CN=([^;]+)/i);
        let mailMatch = props.ORGANIZER.value.match(/^mailto:(.+)$/i);
        organizer = cnMatch ? cnMatch[1].replace(/^"|"$/g, '') : (mailMatch ? mailMatch[1] : props.ORGANIZER.value);
    }

    return {
        uid: props.UID ? props.UID.value : null,
        summary: props.SUMMARY ? unescapeText(props.SUMMARY.value) : null,
        location: props.LOCATION ? unescapeText(props.LOCATION.value) : null,
        description: props.DESCRIPTION ? unescapeText(props.DESCRIPTION.value) : null,
        organizer: organizer,
        start: startInfo ? startInfo.date : null,
        end: endInfo ? endInfo.date : null,
        allDay: !!(startInfo && startInfo.allDay)
    };
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
    act:  { api: 'agendaevents',     card: 'comm/action/card.php',    labelKey: 'DolibarrTypeAgendaEvent' },
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


/**
 * @param {string} [accountId]
 * @returns {Promise<string>}
 */
export async function getDolibarrUrl(accountId) {
    let connection = await resolveDolibarrConnection(accountId);
    let dolUrl = connection ? (connection.apiUrl || '') : '';

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
 * @param {} jsonData each value is either a plain string/number, {html, class?, hightLight?} for
 *   a static HTML string cell, or {node, class?} for a real DOM node cell (e.g. a
 *   buildDropdownMenu() widget - unlike an html string, its own click handlers survive since it's
 *   inserted as-is instead of being re-parsed).
 * @param {HTMLElement} container
 */
export function jsonToTable(JsonTitle, jsonData, container, tableClass = 'dolibarr-table dolibarr-table-stripped', searchInText = ''){

    // If the container is itself a <table> (e.g. the Documents tab's #data-from-dolibarr, filled
    // by four independent calls - one per document type - each appending their own rows to that
    // same persistent table), rows are appended directly to it and it keeps whatever classes it
    // already has. Otherwise a fresh <table> is created (carrying tableClass), filled, and
    // inserted into the container once done.
    let appendToTable = container.tagName === 'TABLE';
    let table = appendToTable ? container : document.createElement('table');

    if(!appendToTable && tableClass.length > 0){
        table.classList.add(...tableClass.split(' '));
    }

    // Get the keys (column names) of the first object in the JSON data
    let cols = Object.values(JsonTitle);

    // Create and append the header row
    let headerRow = document.createElement('tr');
    headerRow.classList.add('table-title');
    cols.forEach((item) => {
        let th = document.createElement('th');
        th.textContent = item; // Set the column name as the text of the header cell
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    // Loop through the JSON data and create table rows
    jsonData.forEach((item) => {
        let tr = document.createElement('tr');

        // Loop through the values and create table cells
        Object.entries(item).forEach(([colKey, elem]) => {
            let td = document.createElement('td');

            if(typeof elem === 'object' && elem !== null && elem.node instanceof Node){
                // A real DOM node (e.g. a buildDropdownMenu() widget, whose click handlers a
                // parseHTML()'d string would lose) rather than a static HTML string.
                td.appendChild(elem.node);

                if(elem.hasOwnProperty('class') ){
                    td.classList.add(...elem.class.split(' '));
                }
            }
            else if(typeof elem === 'object' && elem !== null){
                td.appendChild(parseHTML(elem.html));

                if(elem.hasOwnProperty('class') ){
                    td.classList.add(...elem.class.split(' '));
                }

                if(elem.hasOwnProperty('hightLight') && searchInText && searchInText.length > 0){
                    if(searchInText.includes(elem.hightLight)){
                        td.classList.add('hightlight');
                    }
                    td.classList.add(...elem.hightLight.split(' '));
                }
            }
            else{
                td.textContent = elem; // Set the value as the text of the table cell
            }

            tr.appendChild(td); // Append the table cell to the table row
        });

        table.appendChild(tr);
    });

    if(!appendToTable) {
        container.appendChild(table); // Append the table to the container element
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
