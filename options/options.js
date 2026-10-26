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

// Per-connection trackid instance lists ({[connectionId]: {own: [], foreign: []}}, see
// dolLib.getDolibarrInstanceIds()), and which connections' lists were edited on this page : only
// those are written back on save, so an instance learned meanwhile by the popup (for this or any
// other connection) isn't wiped by this page's older copy.
let instanceIds = {};
let dirtyInstanceIds = new Set();

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
		document.getElementById("dolibarr-banner-display-mode").value = data.dolibarrBannerDisplayMode;
		document.getElementById("dolibarr-project-draft").checked = data.dolibarrProjectStatuses.includes(0);
		document.getElementById("dolibarr-project-open").checked = data.dolibarrProjectStatuses.includes(1);
		document.getElementById("dolibarr-project-closed").checked = data.dolibarrProjectStatuses.includes(2);
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
	document.getElementById("more-project-option-title").textContent = browser.i18n.getMessage("MoreProjectOptions");
	document.getElementById("dolibarr-project-statuses").textContent = browser.i18n.getMessage("dolibarrProjectStatuses");
	document.getElementById("label-for-dolibarr-project-draft").textContent = browser.i18n.getMessage("StatusDraftShort");
	document.getElementById("label-for-dolibarr-project-open").textContent = browser.i18n.getMessage("StatusOpenShort");
	document.getElementById("label-for-dolibarr-project-closed").textContent = browser.i18n.getMessage("StatusClosed");
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
    document.getElementById("label-for-dolibarr-banner-display-mode").textContent = browser.i18n.getMessage("dolibarrBannerDisplayMode");
    document.getElementById("label-for-dolibarr-banner-display-mode_desc").textContent = browser.i18n.getMessage("dolibarrBannerDisplayModeDesc");
    document.getElementById("dolibarr-banner-display-mode-always").textContent = browser.i18n.getMessage("dolibarrBannerDisplayModeAlways");
    document.getElementById("dolibarr-banner-display-mode-content").textContent = browser.i18n.getMessage("dolibarrBannerDisplayModeContent");
    document.getElementById("dolibarr-banner-display-mode-never").textContent = browser.i18n.getMessage("dolibarrBannerDisplayModeNever");


	let connectionData = await dolLib.getDolibarrConnections();
	connections = connectionData.connections;
	accountConnections = connectionData.accountConnections;
	thunderbirdAccounts = await browser.accounts.list();
	instanceIds = (await browser.storage.local.get({dolibarrInstanceIds: {}})).dolibarrInstanceIds;

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
		dolibarrQuotationTrustedSenders: '',
		dolibarrBannerDisplayMode: 'always',
		dolibarrProjectStatuses: dolLib.DEFAULT_PROJECT_STATUSES
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
	let keyWrapper = document.createElement('div');
	keyWrapper.className = 'dol-input-with-btn';
	keyWrapper.appendChild(keyInput);
	let keyLoginBtn = document.createElement('button');
	keyLoginBtn.type = 'button';
	keyLoginBtn.className = 'btn';
	keyLoginBtn.textContent = browser.i18n.getMessage("dolibarrApiKeyFromLogin");
	keyLoginBtn.addEventListener('click', () => openApiKeyLoginDialog(connection, keyInput));
	keyWrapper.appendChild(keyLoginBtn);
	addRow(browser.i18n.getMessage("dolibarrApiKey"), keyWrapper);

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

	// Trackid instance lists : one id per line, bound live like every other field of the card
	function addInstanceIdsRow(listName, labelKey, descKey){
		let textarea = document.createElement('textarea');
		textarea.className = 'dol-input';
		textarea.rows = 2;
		textarea.value = ((instanceIds[connection.id] || {})[listName] || []).join("\n");
		textarea.addEventListener('input', () => {
			let ids = instanceIds[connection.id] || {own: [], foreign: []};
			ids[listName] = textarea.value.split(/\s+/).map((v) => v.trim().toLowerCase()).filter((v) => v.length > 0);
			instanceIds[connection.id] = ids;
			dirtyInstanceIds.add(connection.id);
		});
		addRow(browser.i18n.getMessage(labelKey), textarea, descKey ? browser.i18n.getMessage(descKey) : '');
	}
	addInstanceIdsRow('own', "dolibarrOwnInstanceIds", "dolibarrOwnInstanceIdsDesc");
	addInstanceIdsRow('foreign', "dolibarrForeignInstanceIds");

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
 * « Get it with my login » button of the API key field (issue #21) : asks the Dolibarr login and
 * password in a dialog and gets the user's API key from Dolibarr's POST /login endpoint. The
 * password is only sent to Dolibarr, never stored. Always reset=0 : asking a new key would break
 * every other client (another Thunderbird, a script...) using the current one. Doesn't work when
 * the login API is disabled on the Dolibarr side (API_DISABLE_LOGIN_API), nor with an external
 * authentication (SSO / OAuth) or a second factor : the key is then entered by hand as before.
 * @param {object} connection
 * @param {HTMLInputElement} keyInput
 */
async function openApiKeyLoginDialog(connection, keyInput){
	let apiUrl = (connection.apiUrl || '').replace(/\/+$/, '');
	if(!isValidHttpUrl(apiUrl)){
		dolLib.showToast(browser.i18n.getMessage("dolibarrApiKeyLoginNoUrl"), 'error');
		return;
	}
	// The host permission is needed to call this Dolibarr from the options page, asked here while
	// the click (user gesture) is still running.
	try {
		await browser.permissions.request({origins: [apiUrl + '/*']});
	} catch (e) {
		console.warn('[DoliConnector options] host permission request failed', e);
	}

	let dialog = document.createElement('dialog');
	dialog.className = 'dol-dialog';

	let form = document.createElement('form');
	form.method = 'dialog';
	dialog.appendChild(form);

	let title = document.createElement('h3');
	title.textContent = browser.i18n.getMessage("dolibarrApiKeyFromLogin");
	form.appendChild(title);

	let intro = document.createElement('p');
	intro.className = 'dol-dialog__intro';
	intro.textContent = browser.i18n.getMessage("dolibarrApiKeyLoginIntro", [apiUrl]);
	form.appendChild(intro);

	if(apiUrl.startsWith('http:')){
		let warning = document.createElement('p');
		warning.className = 'dolibarr-notice';
		warning.textContent = browser.i18n.getMessage("dolibarrApiKeyLoginHttpWarning");
		form.appendChild(warning);
	}

	let addField = (labelKey, type, autocomplete) => {
		let label = document.createElement('label');
		label.className = 'dol-dialog__field';
		let span = document.createElement('span');
		span.textContent = browser.i18n.getMessage(labelKey);
		let input = document.createElement('input');
		input.className = 'dol-input';
		input.type = type;
		input.autocomplete = autocomplete;
		input.required = true;
		label.appendChild(span);
		label.appendChild(input);
		form.appendChild(label);
		return input;
	};
	let loginInput = addField("dolibarrLogin", 'text', 'username');
	let passwordInput = addField("dolibarrPassword", 'password', 'current-password');

	let error = document.createElement('p');
	error.className = 'dol-dialog__error hidden-field';
	form.appendChild(error);

	let buttons = document.createElement('div');
	buttons.className = 'dol-dialog__buttons';
	let cancelBtn = document.createElement('button');
	cancelBtn.type = 'button';
	cancelBtn.className = 'btn';
	cancelBtn.textContent = browser.i18n.getMessage("Cancel");
	cancelBtn.addEventListener('click', () => dialog.close());
	let submitBtn = document.createElement('button');
	submitBtn.type = 'submit';
	submitBtn.className = 'btn btn-primary';
	submitBtn.textContent = browser.i18n.getMessage("dolibarrApiKeyLoginSubmit");
	buttons.appendChild(cancelBtn);
	buttons.appendChild(submitBtn);
	form.appendChild(buttons);

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		error.classList.add('hidden-field');
		submitBtn.disabled = true;
		try {
			let token = await requestApiKeyFromLogin(connection, apiUrl, loginInput.value, passwordInput.value);
			keyInput.value = token;
			connection.apiKey = token;
			dialog.close();
			dolLib.showToast(browser.i18n.getMessage("dolibarrApiKeyLoginSuccess"), 'success');
		} catch (e) {
			error.textContent = e.message;
			error.classList.remove('hidden-field');
		} finally {
			passwordInput.value = '';
			submitBtn.disabled = false;
		}
	});
	dialog.addEventListener('close', () => dialog.remove());

	document.body.appendChild(dialog);
	dialog.showModal();
	loginInput.focus();
}

/**
 * POST {apiUrl}/api/index.php/login (never the GET variant, which puts the password in the URL
 * and so in the server logs). HTTP Basic Auth of the connection added when enabled.
 * @param {object} connection
 * @param {string} apiUrl  without trailing slash
 * @param {string} login
 * @param {string} password
 * @returns {Promise<string>} the API key
 * @throws {Error} with a message for the user
 */
async function requestApiKeyFromLogin(connection, apiUrl, login, password){
	let headers = {'Content-Type': 'application/json', 'Accept': 'application/json'};
	if(connection.httpAuthEnabled && (connection.httpAuthUser || '').length > 0){
		headers['Authorization'] = 'Basic ' + btoa(connection.httpAuthUser + ':' + (connection.httpAuthPassword || ''));
	}
	let entity = parseInt(connection.apiEntity) > 0 ? String(parseInt(connection.apiEntity)) : '';

	let response;
	try {
		response = await fetch(apiUrl + '/api/index.php/login', {
			method: 'POST',
			headers: headers,
			cache: 'no-store',
			body: JSON.stringify({login: login, password: password, entity: entity, reset: 0})
		});
	} catch (e) {
		throw new Error(browser.i18n.getMessage("dolibarrApiKeyLoginNetworkError"));
	}

	let data = null;
	try {
		data = await response.json();
	} catch (e) {
		data = null;
	}
	if(response.ok && data && data.success && data.success.token){
		return data.success.token;
	}

	let dolibarrMessage = (data && data.error && data.error.message) ? data.error.message : '';
	if(response.status === 401 && !dolibarrMessage){
		// HTTP Basic Auth of a reverse proxy, before Dolibarr
		throw new Error(browser.i18n.getMessage("dolibarrApiKeyLoginHttpAuthError"));
	}
	if(/disabled/i.test(dolibarrMessage)){
		throw new Error(browser.i18n.getMessage("dolibarrApiKeyLoginDisabled"));
	}
	if(/Access denied/i.test(dolibarrMessage)){
		throw new Error(browser.i18n.getMessage("dolibarrApiKeyLoginBadCredentials"));
	}
	if(/No API token set/i.test(dolibarrMessage)){
		throw new Error(browser.i18n.getMessage("dolibarrApiKeyLoginNoToken"));
	}
	if(response.status === 404){
		throw new Error(browser.i18n.getMessage("dolibarrApiKeyLoginNotFound"));
	}
	throw new Error(browser.i18n.getMessage("dolibarrApiKeyLoginError", [String(response.status), dolibarrMessage || response.statusText || '']));
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


/**
 * Writes back the instance lists edited on this page (see dirtyInstanceIds) over a fresh read of
 * storage, drops the lists of removed connections, and reloads the result.
 */
async function saveInstanceIds(){
	let stored = (await browser.storage.local.get({dolibarrInstanceIds: {}})).dolibarrInstanceIds;
	dirtyInstanceIds.forEach((connectionId) => {
		stored[connectionId] = instanceIds[connectionId];
	});
	Object.keys(stored).forEach((connectionId) => {
		if(!connections.some((c) => c.id === connectionId)){
			delete stored[connectionId];
		}
	});
	await browser.storage.local.set({dolibarrInstanceIds: stored});
	instanceIds = stored;
	dirtyInstanceIds.clear();
}


async function saveOptions(e) {
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
        dolibarrQuotationTrustedSenders: document.getElementById("dolibarr-quotation-trusted-senders").value,
        dolibarrBannerDisplayMode: document.getElementById("dolibarr-banner-display-mode").value,
        dolibarrProjectStatuses: ['dolibarr-project-draft', 'dolibarr-project-open', 'dolibarr-project-closed']
            .map((id) => document.getElementById(id))
            .filter((input) => input.checked)
            .map((input) => parseInt(input.value))
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
    await saveInstanceIds();


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
