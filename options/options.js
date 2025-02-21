document.addEventListener("DOMContentLoaded", restoreOptions);

document.getElementById("save-dolibarr-options").addEventListener("click", saveOptions);






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
		dolibarrSearchDomain:  false
    }).then(setCurrentChoice, onError);
}



function isInputType(node, type) {
    return node.nodeName.toLowerCase() == "input" && node.type.toLowerCase() == type.toLowerCase();
}


function saveOptions(e) {
    e.preventDefault();

    let objToStore = {
        dolibarrApiKey: document.getElementById("dolibarr-api-key").value,
        dolibarrApiUrl: document.getElementById("dolibarr-api-url").value,
		dolibarrApiEntity: document.getElementById("dolibarr-api-entity").value,
                
		dolibarrPropalCanceled: document.getElementById("dolibarr-propal-canceled").checked,
        dolibarrPropalDraft: document.getElementById("dolibarr-propal-draft").checked,
        dolibarrPropalValidated: document.getElementById("dolibarr-propal-validated").checked,
        dolibarrPropalSigned: document.getElementById("dolibarr-propal-signed").checked,
        dolibarrPropalNotSigned: document.getElementById("dolibarr-propal-notsigned").checked,
        dolibarrPropalBilled: document.getElementById("dolibarr-propal-billed").checked,
        dolibarrSearchDomain: document.getElementById("dolibarr-search-domain").checked
    }
    // console.log(objToStore);
    browser.storage.local.set(objToStore);


    const event = new Date();
    const options = { weekday: "long", year: "numeric", month: "long", day: "numeric", minute:"numeric", second:"numeric"};
    const getBrowserLocale = () => navigator.language || navigator.browserLanguage || (navigator.languages || ["en"])[0]
    document.getElementById("save-feed-back").textContent = browser.i18n.getMessage("Saved") + ' ' + event.toLocaleDateString(getBrowserLocale() , options);

}
