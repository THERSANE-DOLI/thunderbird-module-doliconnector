
document.addEventListener("DOMContentLoaded", restoreOptions);

document.getElementById("save-dolibarr-options").addEventListener("click", saveOptions);






function restoreOptions() {

    function onError(error) {
        console.log(`Error: ${error}`);
    }

    function setCurrentChoice(data) {
        document.getElementById("dolibarr-api-key").value = data.dolibarrApiKey;
        document.getElementById("dolibarr-api-url").value = data.dolibarrApiUrl;
        document.getElementById("dolibarr-propal-canceled").checked = data.dolibarrPropalCanceled;
		document.getElementById("dolibarr-propal-draft").checked = data.dolibarrPropalDraft;
		document.getElementById("dolibarr-propal-validated").checked = data.dolibarrPropalValidated;
		document.getElementById("dolibarr-propal-signed").checked = data.dolibarrPropalSigned;
		document.getElementById("dolibarr-propal-notsigned").checked = data.dolibarrPropalNotSigned;
		document.getElementById("dolibarr-propal-billed").checked = data.dolibarrPropalBilled;
    }


    //localization
    document.title = browser.i18n.getMessage("extensionName") + " " + browser.i18n.getMessage("options.options");
    document.getElementById("label-for-dolibarr-api-url").textContent = browser.i18n.getMessage("dolibarrUrl");
    document.getElementById("label-for-dolibarr-api-key").textContent = browser.i18n.getMessage("dolibarrApiKey");
    document.getElementById("dolibarr-propal").textContent = browser.i18n.getMessage("dolibarrPropal");
	document.getElementById("label-for-dolibarr-propal-canceled").textContent = browser.i18n.getMessage("dolibarrCanceled");
	document.getElementById("label-for-dolibarr-propal-draft").textContent = browser.i18n.getMessage("dolibarrDraft");
	document.getElementById("label-for-dolibarr-propal-validated").textContent = browser.i18n.getMessage("dolibarrValidated");
	document.getElementById("label-for-dolibarr-propal-signed").textContent = browser.i18n.getMessage("dolibarrSigned");
	document.getElementById("label-for-dolibarr-propal-notsigned").textContent = browser.i18n.getMessage("dolibarrNotSigned");
	document.getElementById("label-for-dolibarr-propal-billed").textContent = browser.i18n.getMessage("dolibarrBilled");
    document.getElementById("save-dolibarr-options").textContent = browser.i18n.getMessage("Save");



    var getting = browser.storage.local.get({dolibarrApiKey:'', dolibarrApiUrl:''}).then(setCurrentChoice, onError);
}



function isInputType(node, type) {
    return node.nodeName.toLowerCase() == "input" && node.type.toLowerCase() == type.toLowerCase();
}


function saveOptions(e) {
    e.preventDefault();
    browser.storage.local.set({
        dolibarrApiKey: document.getElementById("dolibarr-api-key").value,
        dolibarrApiUrl: document.getElementById("dolibarr-api-url").value,
        dolibarrPropalCanceled: document.getElementById("dolibarr-propal-canceled").checked,
		dolibarrPropalDraft: document.getElementById("dolibarr-propal-draft").checked,
		dolibarrPropalValidated: document.getElementById("dolibarr-propal-validated").checked,
		dolibarrPropalSigned: document.getElementById("dolibarr-propal-signed").checked,
		dolibarrPropalNotSigned: document.getElementById("dolibarr-propal-notsigned").checked,
		dolibarrPropalBilled: document.getElementById("dolibarr-propal-billed").checked
    });
}
