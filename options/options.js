
document.addEventListener("DOMContentLoaded", restoreOptions);

document.getElementById("save-dolibarr-options").addEventListener("click", saveOptions);






function restoreOptions() {

    function onError(error) {
        console.log(`Error: ${error}`);
    }

    function setCurrentChoice(data) {
        document.getElementById("dolibarr-api-key").value = data.dolibarrApiKey;
        document.getElementById("dolibarr-api-url").value = data.dolibarrApiUrl;
        document.getElementById("dolibarr-draft-cancel").checked= data.dolibarrDraftCancel;
    }


    //localization
    document.title = browser.i18n.getMessage("extensionName") + " " + browser.i18n.getMessage("options.options");
    document.getElementById("label-for-dolibarr-api-url").textContent = browser.i18n.getMessage("dolibarrUrl");
    document.getElementById("label-for-dolibarr-api-key").textContent = browser.i18n.getMessage("dolibarrApiKey");
    document.getElementById("label-for-dolibarr-draft-cancel").textContent = browser.i18n.getMessage("dolibarrDraftCancel");
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
        dolibarrDraftCancel: document.getElementById("dolibarr-draft-cancel").checked
    });
}
