document.addEventListener("DOMContentLoaded", restoreOptions);

document.getElementById("save-dolibarr-options").addEventListener("click", saveOptions);



function isValidHttpUrl(string) {
	let url;

	try {
		url = new URL(string);
	} catch (_) {
		return false;
	}

	return url.protocol === "http:" || url.protocol === "https:";
}


function restoreOptions() {

    function onError(error) {
        console.log(`Error: ${error}`);
    }

    function setCurrentChoice(data) {
		document.getElementById("dolibarr-api-key").value = data.dolibarrApiKey;
		document.getElementById("dolibarr-api-url").value = data.dolibarrApiUrl;
		document.getElementById("dolibarr-api-entity").value = data.dolibarrApiEntity;
		document.getElementById("dolibarr-propal-canceled").checked = data.dolibarrPropalCanceled;
		document.getElementById("dolibarr-propal-draft").checked = data.dolibarrPropalDraft;
		document.getElementById("dolibarr-propal-validated").checked = data.dolibarrPropalValidated;
		document.getElementById("dolibarr-propal-signed").checked = data.dolibarrPropalSigned;
		document.getElementById("dolibarr-propal-notsigned").checked = data.dolibarrPropalNotSigned;
		document.getElementById("dolibarr-propal-billed").checked = data.dolibarrPropalBilled;
		document.getElementById("dolibarr-search-domain").checked = data.dolibarrSearchDomain;
		document.getElementById("dolibarr-crm-connector-enabled").checked =
			data.dolibarrCrmConnectorEnabled !== undefined ? data.dolibarrCrmConnectorEnabled : data.dolibarrUseNotes;
		document.getElementById("dolibarr-quotation-trusted-senders").value = data.dolibarrQuotationTrustedSenders;
		document.getElementById("dolibarr-http-auth-enabled").checked = data.dolibarrHttpAuthEnabled;
		document.getElementById("dolibarr-http-auth-user").value = data.dolibarrHttpAuthUser;
		document.getElementById("dolibarr-http-auth-password").value = data.dolibarrHttpAuthPassword;
		toggleHttpAuthFields();
	}


	//localization
	document.title = browser.i18n.getMessage("extensionName") + " " + browser.i18n.getMessage("options.options");
	document.getElementById("label-for-dolibarr-api-url").textContent = browser.i18n.getMessage("dolibarrUrl");
	document.getElementById("label-for-dolibarr-api-key").textContent = browser.i18n.getMessage("dolibarrApiKey");
	document.getElementById("label-for-dolibarr-api-entity").textContent = browser.i18n.getMessage("dolibarrApiEntity");
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
    document.getElementById("label-for-dolibarr-crm-connector-enabled").textContent = browser.i18n.getMessage("DolibarrCrmConnectorEnabled");
    document.getElementById("label-for-dolibarr-crm-connector-enabled_desc").textContent = browser.i18n.getMessage("DolibarrCrmConnectorEnabledDesc");
    document.getElementById("label-for-dolibarr-quotation-trusted-senders").textContent = browser.i18n.getMessage("dolibarrQuotationTrustedSenders");
    document.getElementById("label-for-dolibarr-quotation-trusted-senders_desc").textContent = browser.i18n.getMessage("dolibarrQuotationTrustedSendersDesc");
    document.getElementById("dolibarr-quotation-trusted-senders").placeholder = browser.i18n.getMessage("dolibarrQuotationTrustedSendersPlaceholder");
    document.getElementById("label-for-dolibarr-http-auth-enabled").textContent = browser.i18n.getMessage("dolibarrHttpAuthEnabled");
    document.getElementById("label-for-dolibarr-http-auth-enabled_desc").textContent = browser.i18n.getMessage("dolibarrHttpAuthEnabledDesc");
    document.getElementById("label-for-dolibarr-http-auth-user").textContent = browser.i18n.getMessage("dolibarrHttpAuthUser");
    document.getElementById("label-for-dolibarr-http-auth-password").textContent = browser.i18n.getMessage("dolibarrHttpAuthPassword");




    var getting = browser.storage.local.get({
		dolibarrApiKey:'',
		dolibarrApiUrl:'',
		dolibarrApiEntity:'1',
		dolibarrPropalCanceled: false,
		dolibarrPropalDraft:  false,
		dolibarrPropalValidated:  false,
		dolibarrPropalSigned:  false,
		dolibarrPropalNotSigned:  false,
		dolibarrPropalBilled:  false,
		// dolibarrCrmConnectorEnabled replaces the old dolibarrUseNotes setting (which only
		// gated the notes feature, see saveOptions() below) - left undefined here so
		// setCurrentChoice() can tell "never saved, fall back to dolibarrUseNotes" apart from
		// an explicit false.
		dolibarrCrmConnectorEnabled: undefined,
		dolibarrUseNotes:  false,
		dolibarrSearchDomain:  false,
		dolibarrQuotationTrustedSenders: '',
		dolibarrHttpAuthEnabled: false,
		dolibarrHttpAuthUser: '',
		dolibarrHttpAuthPassword: ''
    }).then(setCurrentChoice, onError);
}


function toggleHttpAuthFields() {
	let enabled = document.getElementById("dolibarr-http-auth-enabled").checked;
	document.getElementById("dolibarr-http-auth-user-row").classList.toggle("hidden-field", !enabled);
	document.getElementById("dolibarr-http-auth-password-row").classList.toggle("hidden-field", !enabled);
}

document.getElementById("dolibarr-http-auth-enabled").addEventListener("change", toggleHttpAuthFields);

// On/off switches (search-domain, CRM connector, HTTP auth) save immediately on toggle instead
// of waiting for the explicit "Save" button - flipping a switch already reads as an immediate
// action to the user, unlike typing into a text field.
document.querySelectorAll('.dol-input-swith input[type="checkbox"]').forEach((toggle) => {
	toggle.addEventListener("change", saveOptions);
});



function isInputType(node, type) {
    return node.nodeName.toLowerCase() == "input" && node.type.toLowerCase() == type.toLowerCase();
}


function saveOptions(e) {
    e.preventDefault();

    let objToStore = {
        dolibarrApiKey: document.getElementById("dolibarr-api-key").value,
        dolibarrApiUrl: document.getElementById("dolibarr-api-url").value,
		dolibarrApiEntity: document.getElementById("dolibarr-api-entity").value,
		// dolibarrMainBtnDisplay: document.getElementById("dolibarr-toggle-main-btn-display").value,
                
		dolibarrPropalCanceled: document.getElementById("dolibarr-propal-canceled").checked,
        dolibarrPropalDraft: document.getElementById("dolibarr-propal-draft").checked,
        dolibarrPropalValidated: document.getElementById("dolibarr-propal-validated").checked,
        dolibarrPropalSigned: document.getElementById("dolibarr-propal-signed").checked,
        dolibarrPropalNotSigned: document.getElementById("dolibarr-propal-notsigned").checked,
        dolibarrPropalBilled: document.getElementById("dolibarr-propal-billed").checked,
        dolibarrCrmConnectorEnabled: document.getElementById("dolibarr-crm-connector-enabled").checked,
        dolibarrSearchDomain: document.getElementById("dolibarr-search-domain").checked,
        dolibarrQuotationTrustedSenders: document.getElementById("dolibarr-quotation-trusted-senders").value,
        dolibarrHttpAuthEnabled: document.getElementById("dolibarr-http-auth-enabled").checked,
        dolibarrHttpAuthUser: document.getElementById("dolibarr-http-auth-user").value,
        dolibarrHttpAuthPassword: document.getElementById("dolibarr-http-auth-password").value
    }
    // console.log(objToStore);

	// remove trailling slash
    if(objToStore.dolibarrApiUrl.substr(-1) === '/') {
		objToStore.dolibarrApiUrl = objToStore.dolibarrApiUrl.substr(0, objToStore.dolibarrApiUrl.length - 1);
	}

    browser.storage.local.set(objToStore);
    // dolibarrUseNotes was renamed to dolibarrCrmConnectorEnabled (see restoreOptions()'s
    // fallback) - drop the old key now that this form has saved the new one.
    browser.storage.local.remove('dolibarrUseNotes');


    const event = new Date();
    const options = { weekday: "long", year: "numeric", month: "long", day: "numeric", minute:"numeric", second:"numeric"};
    const getBrowserLocale = () => navigator.language || navigator.browserLanguage || (navigator.languages || ["en"])[0]
    document.getElementById("save-feed-back").textContent = browser.i18n.getMessage("Saved") + ' ' + event.toLocaleDateString(getBrowserLocale() , options);

    if(objToStore.dolibarrApiUrl.length > 0
		&& isValidHttpUrl(objToStore.dolibarrApiUrl)
		&& !browser.permissions.contains({ origins: [`${objToStore.dolibarrApiUrl}/*`] })){
			browser.permissions.request({ origins: [`${objToStore.dolibarrApiUrl}/*`] });
	}



}
