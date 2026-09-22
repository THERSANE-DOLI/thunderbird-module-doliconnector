import * as dolLib from '../global.lib.js';

document.addEventListener("DOMContentLoaded", restoreOptions);

document.getElementById("save-dolibarr-options").addEventListener("click", saveOptions);
document.getElementById("add-dolibarr-connection").addEventListener("click", addConnection);
document.getElementById("request-all-urls-permission").addEventListener("click", requestAllUrlsPermission);

// In-memory state, loaded by restoreOptions() and written back to storage by saveOptions().
// Each connection field is bound live (its own change/input listener updates this array
// directly, see renderConnectionCard()) rather than re-read from the DOM on save, since a
// connection is a repeatable/removable unit unlike the rest of this form's fixed fields.
let connections = [];
let accountConnections = {};
let thunderbirdAccounts = [];

// Which connection's <details> should be expanded on the next renderConnectionsList() - null
// means "use the default connection" (the initial state). Kept in sync with the user's own
// clicks (see renderConnectionsList()'s toggle listener) so a re-render triggered by something
// else (saving, adding/removing another connection) doesn't silently collapse the one they were
// looking at back to the default.
let openConnectionId = null;


function isValidHttpUrl(string) {
	let url;

	try {
		url = new URL(string);
	} catch (_) {
		return false;
	}

	return url.protocol === "http:" || url.protocol === "https:";
}

function generateConnectionId(){
	return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('conn-' + Date.now() + '-' + Math.random().toString(36).slice(2));
}


async function restoreOptions() {

    function onError(error) {
        console.log(`Error: ${error}`);
    }

    function setCurrentChoice(data) {
		document.getElementById("dolibarr-propal-canceled").checked = data.dolibarrPropalCanceled;
		document.getElementById("dolibarr-propal-draft").checked = data.dolibarrPropalDraft;
		document.getElementById("dolibarr-propal-validated").checked = data.dolibarrPropalValidated;
		document.getElementById("dolibarr-propal-signed").checked = data.dolibarrPropalSigned;
		document.getElementById("dolibarr-propal-notsigned").checked = data.dolibarrPropalNotSigned;
		document.getElementById("dolibarr-propal-billed").checked = data.dolibarrPropalBilled;
		document.getElementById("dolibarr-search-domain").checked = data.dolibarrSearchDomain;
		document.getElementById("dolibarr-quotation-trusted-senders").value = data.dolibarrQuotationTrustedSenders;
	}


	//localization
	document.title = browser.i18n.getMessage("extensionName") + " " + browser.i18n.getMessage("options.options");
	document.getElementById("dolibarr-connections-title").textContent = browser.i18n.getMessage("DolibarrConnections");
	document.getElementById("add-dolibarr-connection").textContent = browser.i18n.getMessage("AddDolibarrConnection");
	document.getElementById("dolibarr-account-mapping-title").textContent = browser.i18n.getMessage("DolibarrAccountMapping");
	document.getElementById("dolibarr-account-mapping-desc").textContent = browser.i18n.getMessage("DolibarrAccountMappingDesc");
	document.getElementById("dolibarr-permission-notice-text").textContent = browser.i18n.getMessage("DolibarrPermissionNotice");
	document.getElementById("request-all-urls-permission").textContent = browser.i18n.getMessage("DolibarrRequestPermission");
	document.getElementById("dolibarr-permission-notice-fallback-text").textContent = browser.i18n.getMessage("DolibarrPermissionNoticeFallback");
	let permissionSteps = document.getElementById("dolibarr-permission-notice-steps");
	permissionSteps.innerHTML = '';
	["DolibarrPermissionStep1", "DolibarrPermissionStep2", "DolibarrPermissionStep3", "DolibarrPermissionStep4"].forEach((key) => {
		let li = document.createElement('li');
		li.textContent = browser.i18n.getMessage(key);
		permissionSteps.appendChild(li);
	});
	document.getElementById("dolibarr-usage-options-title").textContent = browser.i18n.getMessage("DolibarrUsageOptionsTitle");
	document.getElementById("more-propal-option-title").textContent = browser.i18n.getMessage("MorePropalOptions");
	document.getElementById("dolibarr-propal").textContent = browser.i18n.getMessage("dolibarrPropal");
	document.getElementById("label-for-dolibarr-propal-canceled").textContent = browser.i18n.getMessage("dolibarrCanceled");
	document.getElementById("label-for-dolibarr-propal-draft").textContent = browser.i18n.getMessage("dolibarrDraft");
	document.getElementById("label-for-dolibarr-propal-validated").textContent = browser.i18n.getMessage("dolibarrValidated");
	document.getElementById("label-for-dolibarr-propal-signed").textContent = browser.i18n.getMessage("dolibarrSigned");
	document.getElementById("label-for-dolibarr-propal-notsigned").textContent = browser.i18n.getMessage("dolibarrNotSigned");
	document.getElementById("label-for-dolibarr-propal-billed").textContent = browser.i18n.getMessage("dolibarrBilled");
    document.getElementById("save-dolibarr-options").textContent = browser.i18n.getMessage("Save");
    document.getElementById("label-for-dolibarr-search-domain").textContent = browser.i18n.getMessage("dolibarrOptSearchDomain");
    document.getElementById("label-for-link-to-modules-doc").textContent = browser.i18n.getMessage("SeeModuleDoc");
    document.getElementById("label-for-dolibarr-quotation-trusted-senders").textContent = browser.i18n.getMessage("dolibarrQuotationTrustedSenders");
    document.getElementById("label-for-dolibarr-quotation-trusted-senders_desc").textContent = browser.i18n.getMessage("dolibarrQuotationTrustedSendersDesc");
    document.getElementById("dolibarr-quotation-trusted-senders").placeholder = browser.i18n.getMessage("dolibarrQuotationTrustedSendersPlaceholder");


	let connectionData = await dolLib.getDolibarrConnections();
	connections = connectionData.connections;
	accountConnections = connectionData.accountConnections;
	thunderbirdAccounts = await browser.accounts.list();

	renderConnectionsList();
	renderAccountMappingTable();

    var getting = browser.storage.local.get({
		dolibarrPropalCanceled: false,
		dolibarrPropalDraft:  false,
		dolibarrPropalValidated:  false,
		dolibarrPropalSigned:  false,
		dolibarrPropalNotSigned:  false,
		dolibarrPropalBilled:  false,
		dolibarrSearchDomain:  false,
		dolibarrQuotationTrustedSenders: ''
    }).then(setCurrentChoice, onError);
}


/**
 * Builds one connection's editable card, collapsed into a <details> named after the connection
 * (see renderConnectionsList() for the "opening one closes the others" accordion behaviour) -
 * name, URL, API key, entity, HTTP Basic Auth (conditionally-shown user/password, same toggle
 * pattern the old single-connection form used), CRM Client Connector toggle, "default connection"
 * radio and a remove button. Every field is bound live : its own listener writes straight into
 * the matching object in the module-level `connections` array (no separate draft/re-read-on-save
 * step), since connections are a repeatable/removable list rather than fixed fields.
 * @param {object} connection
 * @returns {HTMLElement}
 */
function renderConnectionCard(connection){
	let details = document.createElement('details');
	details.classList.add('dolibarr-connection-details');
	details.dataset.connectionId = connection.id;

	let summary = document.createElement('summary');
	summary.textContent = connection.name || browser.i18n.getMessage("DolibarrConnectionName");
	details.appendChild(summary);

	let card = document.createElement('div');
	card.classList.add('dolibarr-connection-card');
	details.appendChild(card);

	let table = document.createElement('table');
	table.classList.add('dolibarr-table');
	card.appendChild(table);

	function addRow(labelText, inputEl, descText){
		let row = document.createElement('tr');
		let labelCell = document.createElement('td');
		let label = document.createElement('label');
		label.textContent = labelText;
		labelCell.appendChild(label);
		if(descText){
			labelCell.appendChild(document.createElement('br'));
			let small = document.createElement('small');
			small.textContent = descText;
			labelCell.appendChild(small);
		}
		let inputCell = document.createElement('td');
		inputCell.appendChild(inputEl);
		row.appendChild(labelCell);
		row.appendChild(inputCell);
		table.appendChild(row);
		return row;
	}

	let nameInput = document.createElement('input');
	nameInput.className = 'dol-input';
	nameInput.type = 'text';
	nameInput.value = connection.name || '';
	nameInput.addEventListener('input', () => {
		connection.name = nameInput.value;
		summary.textContent = connection.name || browser.i18n.getMessage("DolibarrConnectionName");
		renderAccountMappingTable();
	});
	addRow(browser.i18n.getMessage("DolibarrConnectionName"), nameInput);

	let urlInput = document.createElement('input');
	urlInput.className = 'dol-input';
	urlInput.type = 'text';
	urlInput.value = connection.apiUrl || '';
	urlInput.addEventListener('input', () => { connection.apiUrl = urlInput.value; });
	addRow(browser.i18n.getMessage("dolibarrUrl"), urlInput);

	let keyInput = document.createElement('input');
	keyInput.className = 'dol-input';
	keyInput.type = 'password';
	keyInput.value = connection.apiKey || '';
	keyInput.addEventListener('input', () => { connection.apiKey = keyInput.value; });
	addRow(browser.i18n.getMessage("dolibarrApiKey"), keyInput);

	let entityInput = document.createElement('input');
	entityInput.className = 'dol-input';
	entityInput.type = 'number';
	entityInput.step = '1';
	entityInput.min = '1';
	entityInput.value = connection.apiEntity || 1;
	entityInput.addEventListener('input', () => { connection.apiEntity = entityInput.value; });
	addRow(browser.i18n.getMessage("dolibarrApiEntity"), entityInput);

	let httpAuthSwitch = document.createElement('label');
	httpAuthSwitch.className = 'dol-input-swith';
	let httpAuthInput = document.createElement('input');
	httpAuthInput.type = 'checkbox';
	httpAuthInput.className = 'dol-input';
	httpAuthInput.checked = !!connection.httpAuthEnabled;
	httpAuthSwitch.appendChild(httpAuthInput);
	let httpAuthSlider = document.createElement('span');
	httpAuthSlider.className = 'dol-input-slider';
	httpAuthSwitch.appendChild(httpAuthSlider);
	addRow(browser.i18n.getMessage("dolibarrHttpAuthEnabled"), httpAuthSwitch, browser.i18n.getMessage("dolibarrHttpAuthEnabledDesc"));

	let httpAuthUserInput = document.createElement('input');
	httpAuthUserInput.className = 'dol-input';
	httpAuthUserInput.type = 'text';
	httpAuthUserInput.autocomplete = 'off';
	httpAuthUserInput.value = connection.httpAuthUser || '';
	httpAuthUserInput.addEventListener('input', () => { connection.httpAuthUser = httpAuthUserInput.value; });
	let httpAuthUserRow = addRow(browser.i18n.getMessage("dolibarrHttpAuthUser"), httpAuthUserInput);

	let httpAuthPasswordInput = document.createElement('input');
	httpAuthPasswordInput.className = 'dol-input';
	httpAuthPasswordInput.type = 'password';
	httpAuthPasswordInput.autocomplete = 'off';
	httpAuthPasswordInput.value = connection.httpAuthPassword || '';
	httpAuthPasswordInput.addEventListener('input', () => { connection.httpAuthPassword = httpAuthPasswordInput.value; });
	let httpAuthPasswordRow = addRow(browser.i18n.getMessage("dolibarrHttpAuthPassword"), httpAuthPasswordInput);

	let toggleHttpAuthRows = () => {
		httpAuthUserRow.classList.toggle('hidden-field', !httpAuthInput.checked);
		httpAuthPasswordRow.classList.toggle('hidden-field', !httpAuthInput.checked);
	};
	toggleHttpAuthRows();
	httpAuthInput.addEventListener('change', () => { connection.httpAuthEnabled = httpAuthInput.checked; toggleHttpAuthRows(); });

	let crmSwitch = document.createElement('label');
	crmSwitch.className = 'dol-input-swith';
	let crmInput = document.createElement('input');
	crmInput.type = 'checkbox';
	crmInput.className = 'dol-input';
	crmInput.checked = !!connection.crmConnectorEnabled;
	crmInput.addEventListener('change', () => { connection.crmConnectorEnabled = crmInput.checked; });
	crmSwitch.appendChild(crmInput);
	let crmSlider = document.createElement('span');
	crmSlider.className = 'dol-input-slider';
	crmSwitch.appendChild(crmSlider);
	addRow(browser.i18n.getMessage("DolibarrCrmConnectorEnabled"), crmSwitch, browser.i18n.getMessage("DolibarrCrmConnectorEnabledDesc"));

	let defaultRow = document.createElement('tr');
	let defaultLabelCell = document.createElement('td');
	let defaultLabel = document.createElement('label');
	defaultLabel.textContent = browser.i18n.getMessage("DolibarrConnectionSetDefault");
	defaultLabelCell.appendChild(defaultLabel);
	let defaultInputCell = document.createElement('td');
	let defaultInput = document.createElement('input');
	defaultInput.type = 'radio';
	defaultInput.name = 'dolibarr-connection-default';
	defaultInput.checked = !!connection.isDefault;
	defaultInput.addEventListener('change', () => {
		connections.forEach((c) => { c.isDefault = (c.id === connection.id); });
		renderAccountMappingTable();
	});
	defaultInputCell.appendChild(defaultInput);
	defaultRow.appendChild(defaultLabelCell);
	defaultRow.appendChild(defaultInputCell);
	table.appendChild(defaultRow);

	let removeBtn = document.createElement('button');
	removeBtn.type = 'button';
	removeBtn.className = 'btn';
	removeBtn.textContent = browser.i18n.getMessage("DolibarrConnectionRemove");
	removeBtn.addEventListener('click', () => removeConnection(connection.id));
	card.appendChild(removeBtn);

	// Open the connection tracked by openConnectionId (the one just added, or the last one the
	// user expanded themselves - see renderConnectionsList()'s toggle listener) if there is one,
	// otherwise fall back to the default connection (addConnection()/removeConnection() keep
	// exactly one connection flagged isDefault whenever the list isn't empty) - see
	// renderConnectionsList() for the "opening one closes the others" accordion behaviour.
	details.open = openConnectionId ? (connection.id === openConnectionId) : !!connection.isDefault;

	return details;
}

/**
 * Renders every connection as its own <details> (see renderConnectionCard()) and wires them into
 * an accordion : opening one (native <details> "toggle" event, fired after the browser already
 * applied the new open/closed state) closes every other one, so at most one connection's fields
 * are expanded at a time. Also keeps openConnectionId in sync with the user's own clicks, so a
 * later re-render (saving, adding/removing another connection) reopens the same one instead of
 * always reverting to the default connection.
 */
function renderConnectionsList(){
	let container = document.getElementById('dolibarr-connections-list');
	container.innerHTML = '';
	connections.forEach((connection) => {
		container.appendChild(renderConnectionCard(connection));
	});

	let allDetails = Array.from(container.querySelectorAll(':scope > details.dolibarr-connection-details'));
	allDetails.forEach((details) => {
		details.addEventListener('toggle', () => {
			if(details.open){
				openConnectionId = details.dataset.connectionId;
				allDetails.forEach((other) => {
					if(other !== details){ other.open = false; }
				});
			}
		});
	});
}

/**
 * Requests the <all_urls> optional permission (declared in manifest.json) directly from a click
 * in this page, instead of only relying on saveOptions()'s per-connection-URL request or sending
 * the user to the Add-ons Manager's Permissions tab manually (see the steps listed next to this
 * button in options.html). browser.permissions.request() must run in direct response to a user
 * gesture - it still shows Thunderbird's own native confirmation popup, this only avoids the
 * detour through the Add-ons Manager to reach it.
 */
function requestAllUrlsPermission(){
	browser.permissions.request({origins: ["<all_urls>"]}).then((granted) => {
		dolLib.showToast(
			browser.i18n.getMessage(granted ? "DolibarrRequestPermissionGranted" : "DolibarrRequestPermissionDenied"),
			granted ? 'success' : 'error'
		);
	});
}

function addConnection(){
	let connection = {
		id: generateConnectionId(),
		name: '',
		apiUrl: '',
		apiKey: '',
		apiEntity: 1,
		httpAuthEnabled: false,
		httpAuthUser: '',
		httpAuthPassword: '',
		crmConnectorEnabled: false,
		// The very first connection ever added is the default (nothing to fall back to
		// otherwise) - later ones are opt-in default via their own radio.
		isDefault: connections.length === 0
	};
	connections.push(connection);
	// The newly created connection is the one the user is about to fill in - expand it and
	// collapse every other one, instead of leaving it closed among the rest.
	openConnectionId = connection.id;
	renderConnectionsList();
	renderAccountMappingTable();
}

function removeConnection(connectionId){
	let wasDefault = connections.some((c) => c.id === connectionId && c.isDefault);
	connections = connections.filter((c) => c.id !== connectionId);
	if(wasDefault && connections.length > 0){
		connections[0].isDefault = true;
	}
	if(openConnectionId === connectionId){
		// Removed while it was the expanded one - fall back to the default connection instead of
		// tracking an id that no longer exists.
		openConnectionId = null;
	}
	// Any account explicitly mapped to the removed connection falls back to the default
	// connection, same as an account that was never mapped at all.
	Object.keys(accountConnections).forEach((accountId) => {
		if(accountConnections[accountId] === connectionId){
			delete accountConnections[accountId];
		}
	});
	renderConnectionsList();
	renderAccountMappingTable();
}

/**
 * One row per Thunderbird account (browser.accounts.list()), each with a <select> of the
 * configured connections - the implicit "(connexion par défaut)" option clears that account's
 * entry in accountConnections rather than storing an explicit id, so it automatically keeps
 * following whichever connection is flagged default later.
 */
function renderAccountMappingTable(){
	let table = document.getElementById('dolibarr-account-mapping-table');
	table.innerHTML = '';

	thunderbirdAccounts.forEach((account) => {
		let row = document.createElement('tr');

		let labelCell = document.createElement('td');
		let email = (account.identities && account.identities.length > 0) ? account.identities[0].email : '';
		labelCell.textContent = account.name + (email ? ' (' + email + ')' : '');
		row.appendChild(labelCell);

		let selectCell = document.createElement('td');
		let select = document.createElement('select');
		select.className = 'dol-input';

		let defaultOption = document.createElement('option');
		defaultOption.value = '';
		let defaultConnection = connections.find((c) => c.isDefault);
		defaultOption.textContent = browser.i18n.getMessage("DolibarrConnectionDefaultOption",
			[defaultConnection ? (defaultConnection.name || browser.i18n.getMessage("DolibarrConnectionName")) : '-']);
		select.appendChild(defaultOption);

		connections.forEach((connection) => {
			let option = document.createElement('option');
			option.value = connection.id;
			option.textContent = connection.name || browser.i18n.getMessage("DolibarrConnectionName");
			select.appendChild(option);
		});

		select.value = accountConnections[account.id] || '';
		select.addEventListener('change', () => {
			if(select.value){
				accountConnections[account.id] = select.value;
			}else{
				delete accountConnections[account.id];
			}
		});

		selectCell.appendChild(select);
		row.appendChild(selectCell);
		table.appendChild(row);
	});
}


function saveOptions(e) {
    e.preventDefault();

    let objToStore = {
        dolibarrConnections: connections,
        dolibarrAccountConnections: accountConnections,
        dolibarrPropalCanceled: document.getElementById("dolibarr-propal-canceled").checked,
        dolibarrPropalDraft: document.getElementById("dolibarr-propal-draft").checked,
        dolibarrPropalValidated: document.getElementById("dolibarr-propal-validated").checked,
        dolibarrPropalSigned: document.getElementById("dolibarr-propal-signed").checked,
        dolibarrPropalNotSigned: document.getElementById("dolibarr-propal-notsigned").checked,
        dolibarrPropalBilled: document.getElementById("dolibarr-propal-billed").checked,
        dolibarrSearchDomain: document.getElementById("dolibarr-search-domain").checked,
        dolibarrQuotationTrustedSenders: document.getElementById("dolibarr-quotation-trusted-senders").value
    }
    // console.log(objToStore);

	// remove trailling slash on every connection's URL
	let permissionUrls = [];
	connections.forEach((connection) => {
		if(connection.apiUrl && connection.apiUrl.substr(-1) === '/') {
			connection.apiUrl = connection.apiUrl.substr(0, connection.apiUrl.length - 1);
		}
		if(connection.apiUrl && connection.apiUrl.length > 0 && isValidHttpUrl(connection.apiUrl)){
			permissionUrls.push(`${connection.apiUrl}/*`);
		}
	});

    browser.storage.local.set(objToStore);


    const event = new Date();
    const options = { weekday: "long", year: "numeric", month: "long", day: "numeric", minute:"numeric", second:"numeric"};
    const getBrowserLocale = () => navigator.language || navigator.browserLanguage || (navigator.languages || ["en"])[0]
    dolLib.showToast(browser.i18n.getMessage("Saved") + ' ' + event.toLocaleDateString(getBrowserLocale() , options), 'success');

	permissionUrls.forEach((origin) => {
		browser.permissions.contains({ origins: [origin] }).then((hasPermission) => {
			if(!hasPermission){
				browser.permissions.request({ origins: [origin] });
			}
		});
	});

	renderConnectionsList();
	renderAccountMappingTable();
}

// On/off switches (search-domain, per-connection HTTP auth/CRM connector) save immediately on
// toggle instead of waiting for the explicit "Save" button - flipping a switch already reads as
// an immediate action to the user, unlike typing into a text field. Delegated on the form itself
// (rather than querySelectorAll'd once at load time) since connection cards are rendered/replaced
// dynamically after this listener is attached.
document.querySelector('form').addEventListener("change", (event) => {
	if(event.target.matches('.dol-input-swith input[type="checkbox"]')){
		saveOptions(event);
	}
});
