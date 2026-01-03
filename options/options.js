// Importer le module de chiffrement
import * as cryptoLib from '../crypto.lib.js';
import { localizeHtmlPage } from '../global.lib.js';

// Attendre que le DOM soit chargé avant d'initialiser
document.addEventListener("DOMContentLoaded", function() {
	// Localiser la page
	localizeHtmlPage();
	
	// Charger les options sauvegardées
	restoreOptions();
	
	// Ajouter le listener pour le bouton de sauvegarde
	document.getElementById("save-dolibarr-options").addEventListener("click", saveOptions);
	
	// Gérer l'affichage des champs de mot de passe maître
	document.getElementById("use-master-password").addEventListener("change", function() {
		const masterPasswordRow = document.getElementById("master-password-row");
		const confirmPasswordRow = document.getElementById("confirm-password-row");
		
		if (this.checked) {
			masterPasswordRow.style.display = "table-row";
			confirmPasswordRow.style.display = "table-row";
		} else {
			masterPasswordRow.style.display = "none";
			confirmPasswordRow.style.display = "none";
			document.getElementById("master-password").value = "";
			document.getElementById("confirm-master-password").value = "";
			document.getElementById("password-error").textContent = "";
		}
	});
});



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

    async function setCurrentChoice(data) {
		// Gérer la clé API (peut être chiffrée ou en clair pour migration)
		let apiKeyValue = '';
		if (data.dolibarrApiKey) {
			// Vérifier si la clé est chiffrée
			if (cryptoLib.isEncrypted(data.dolibarrApiKey)) {
				// La clé est chiffrée, on affiche juste un placeholder
				apiKeyValue = '••••••••••••••••'; // Ne pas afficher la clé chiffrée
				document.getElementById("label-api-key-encrypted-info").textContent = 
					browser.i18n.getMessage("ApiKeyWillBeEncrypted");
			} else {
				// Ancienne clé en clair (pour migration)
				apiKeyValue = data.dolibarrApiKey;
			}
		}
		
		document.getElementById("dolibarr-api-key").value = apiKeyValue;
		document.getElementById("dolibarr-api-url").value = data.dolibarrApiUrl;
		document.getElementById("dolibarr-api-entity").value = data.dolibarrApiEntity;
		document.getElementById("dolibarr-propal-canceled").checked = data.dolibarrPropalCanceled;
		document.getElementById("dolibarr-propal-draft").checked = data.dolibarrPropalDraft;
		document.getElementById("dolibarr-propal-validated").checked = data.dolibarrPropalValidated;
		document.getElementById("dolibarr-propal-signed").checked = data.dolibarrPropalSigned;
		document.getElementById("dolibarr-propal-notsigned").checked = data.dolibarrPropalNotSigned;
		document.getElementById("dolibarr-propal-billed").checked = data.dolibarrPropalBilled;
		document.getElementById("dolibarr-search-domain").checked = data.dolibarrSearchDomain;
		document.getElementById("dolibarr-use-notes").checked = data.dolibarrUseNotes;
		document.getElementById("dolibarr-use-gravatar").checked = data.dolibarrUseGravatar;
		
		// Gérer le mot de passe maître
		const useMasterPassword = data.useMasterPassword || false;
		document.getElementById("use-master-password").checked = useMasterPassword;
		
		// Déclencher l'événement pour afficher/masquer les champs
		if (useMasterPassword) {
			document.getElementById("master-password-row").style.display = "table-row";
			document.getElementById("confirm-password-row").style.display = "table-row";
		}
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
    document.getElementById("label-for-dolibarr-use-notes").textContent = browser.i18n.getMessage("DolibarrUseNotes");
    document.getElementById("label-for-dolibarr-use-notes_desc").textContent = browser.i18n.getMessage("DolibarrUseNotesDesc");
    document.getElementById("label-for-dolibarr-use-gravatar").textContent = browser.i18n.getMessage("DolibarrUseGravatar");
    document.getElementById("label-for-dolibarr-use-gravatar_desc").textContent = browser.i18n.getMessage("DolibarrUseGravatarDesc");
    
    // Traductions pour la sécurité
    document.getElementById("security-options-title").textContent = browser.i18n.getMessage("SecurityOptions");
    document.getElementById("label-for-use-master-password").textContent = browser.i18n.getMessage("UseMasterPassword");
    document.getElementById("label-for-use-master-password_desc").textContent = browser.i18n.getMessage("UseMasterPasswordDesc");
    document.getElementById("label-for-master-password").textContent = browser.i18n.getMessage("MasterPassword");
    document.getElementById("master-password").placeholder = browser.i18n.getMessage("MasterPasswordPlaceholder");
    document.getElementById("label-for-confirm-master-password").textContent = browser.i18n.getMessage("ConfirmMasterPassword");
    document.getElementById("confirm-master-password").placeholder = browser.i18n.getMessage("MasterPasswordPlaceholder");




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
		dolibarrUseNotes:  false,
		dolibarrSearchDomain:  false,
		dolibarrUseGravatar:  false,
		useMasterPassword:  false
    }).then(setCurrentChoice, onError);
}



function isInputType(node, type) {
    return node.nodeName.toLowerCase() == "input" && node.type.toLowerCase() == type.toLowerCase();
}


async function saveOptions(e) {
    e.preventDefault();
    
    const useMasterPassword = document.getElementById("use-master-password").checked;
    const password1 = document.getElementById("master-password").value;
    const password2 = document.getElementById("confirm-master-password").value;
    const passwordError = document.getElementById("password-error");
    
    // Vérifier les mots de passe si l'option est activée
    if (useMasterPassword) {
        if (password1.length === 0) {
            passwordError.textContent = browser.i18n.getMessage("MasterPasswordPlaceholder");
            return;
        }
        
        if (password1 !== password2) {
            passwordError.textContent = browser.i18n.getMessage("PasswordsDontMatch");
            return;
        }
        
        if (password1.length < 6) {
            passwordError.textContent = "Mot de passe trop court (minimum 6 caractères)";
            return;
        }
    }
    
    passwordError.textContent = "";
    
    // Récupérer la clé API
    let apiKeyValue = document.getElementById("dolibarr-api-key").value;
    
    // Ne pas sauvegarder si c'est le placeholder
    if (apiKeyValue === '••••••••••••••••') {
        // Récupérer l'ancienne valeur chiffrée
        const oldData = await browser.storage.local.get({dolibarrApiKey: ''});
        apiKeyValue = oldData.dolibarrApiKey;
    } else if (apiKeyValue && apiKeyValue.length > 0) {
        // Chiffrer la nouvelle clé API
        try {
            const encryptedKey = await cryptoLib.encryptData(
                apiKeyValue,
                useMasterPassword ? password1 : null
            );
            apiKeyValue = encryptedKey;
        } catch (error) {
            console.error("Encryption error:", error);
            passwordError.textContent = "Erreur lors du chiffrement de la clé API";
            return;
        }
    }

    let objToStore = {
        dolibarrApiKey: apiKeyValue,
        dolibarrApiUrl: document.getElementById("dolibarr-api-url").value,
		dolibarrApiEntity: document.getElementById("dolibarr-api-entity").value,
		// dolibarrMainBtnDisplay: document.getElementById("dolibarr-toggle-main-btn-display").value,
                
		dolibarrPropalCanceled: document.getElementById("dolibarr-propal-canceled").checked,
        dolibarrPropalDraft: document.getElementById("dolibarr-propal-draft").checked,
        dolibarrPropalValidated: document.getElementById("dolibarr-propal-validated").checked,
        dolibarrPropalSigned: document.getElementById("dolibarr-propal-signed").checked,
        dolibarrPropalNotSigned: document.getElementById("dolibarr-propal-notsigned").checked,
        dolibarrPropalBilled: document.getElementById("dolibarr-propal-billed").checked,
        dolibarrUseNotes: document.getElementById("dolibarr-use-notes").checked,
        dolibarrSearchDomain: document.getElementById("dolibarr-search-domain").checked,
        dolibarrUseGravatar: document.getElementById("dolibarr-use-gravatar").checked,
        useMasterPassword: useMasterPassword
    }
    // console.log(objToStore);

	// remove trailling slash
    if(objToStore.dolibarrApiUrl.substr(-1) === '/') {
		objToStore.dolibarrApiUrl = objToStore.dolibarrApiUrl.substr(0, objToStore.dolibarrApiUrl.length - 1);
	}

    browser.storage.local.set(objToStore);


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
