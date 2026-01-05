// Importer le module de chiffrement
import * as cryptoLib from './crypto.lib.js';

// Variable globale pour stocker le mot de passe en mémoire (session uniquement)
let cachedMasterPassword = null;

/**
 * Échappe les caractères spéciaux pour éviter les injections SQL
 * Protège contre les attaques par injection SQL dans les filtres Dolibarr
 * @param {string} str - La chaîne à échapper
 * @returns {string} - La chaîne échappée et sécurisée
 */
export function escapeSqlString(str) {
    if (!str || typeof str !== 'string') {
        return '';
    }
    
    // Échapper les apostrophes (simple quote) en les doublant
    // En SQL, '' représente une apostrophe littérale
    let escaped = str.replace(/'/g, "''");
    
    // Échapper les backslashes
    escaped = escaped.replace(/\\/g, "\\\\");
    
    // Supprimer les caractères de contrôle dangereux
    escaped = escaped.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Optionnel : limiter la longueur pour éviter les attaques par déni de service
    if (escaped.length > 500) {
        escaped = escaped.substring(0, 500);
    }
    
    return escaped;
}

/**
 * Valide et nettoie une adresse email
 * @param {string} email - L'email à valider
 * @returns {string} - Email nettoyé ou chaîne vide si invalide
 */
export function sanitizeEmail(email) {
    if (!email || typeof email !== 'string') {
        return '';
    }
    
    // Regex simple pour valider le format email
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    // Nettoyer les espaces
    email = email.trim();
    
    // Vérifier le format
    if (!emailRegex.test(email)) {
        console.warn('[Dolibarr Security] Email invalide détecté:', email);
        return '';
    }
    
    // Échapper pour SQL
    return escapeSqlString(email);
}

/**
 * Valide et nettoie un domaine email
 * @param {string} domain - Le domaine à valider
 * @returns {string} - Domaine nettoyé ou chaîne vide si invalide
 */
export function sanitizeDomain(domain) {
    if (!domain || typeof domain !== 'string') {
        return '';
    }
    
    // Regex pour valider le format de domaine
    const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    // Nettoyer
    domain = domain.trim().toLowerCase();
    
    // Vérifier le format
    if (!domainRegex.test(domain)) {
        console.warn('[Dolibarr Security] Domaine invalide détecté:', domain);
        return '';
    }
    
    // Échapper pour SQL
    return escapeSqlString(domain);
}

/**
 * Valide et nettoie un ID numérique
 * @param {any} id - L'ID à valider
 * @returns {number} - ID validé ou 0 si invalide
 */
export function sanitizeId(id) {
    // Convertir en nombre
    const numId = parseInt(id, 10);
    
    // Vérifier que c'est un nombre positif valide
    if (isNaN(numId) || numId < 0 || numId > Number.MAX_SAFE_INTEGER) {
        console.warn('[Dolibarr Security] ID invalide détecté:', id);
        return 0;
    }
    
    return numId;
}

/**
 * Nettoie et sécurise le HTML pour éviter les attaques XSS
 * Supprime tous les scripts, événements JavaScript et éléments dangereux
 * @param {string} html - Le HTML à nettoyer
 * @returns {string} - HTML sécurisé
 */
export function sanitizeHTML(html) {
    if (!html || typeof html !== 'string') {
        return '';
    }
    
    // Créer un élément temporaire pour parser le HTML
    const temp = document.createElement('div');
    temp.textContent = html; // Utilise textContent pour échapper automatiquement
    
    // Si on veut vraiment du HTML (et pas juste du texte), on doit le parser et nettoyer
    // Pour une approche plus permissive mais sécurisée :
    
    // Liste blanche des balises autorisées (sûres)
    const allowedTags = ['b', 'i', 'u', 'strong', 'em', 'br', 'p', 'span', 'div', 'a'];
    
    // Liste blanche des attributs autorisés
    const allowedAttributes = ['href', 'title', 'class'];
    
    // Parser le HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Fonction récursive pour nettoyer les nœuds
    function cleanNode(node) {
        // Si c'est un nœud texte, le garder tel quel
        if (node.nodeType === Node.TEXT_NODE) {
            return node.cloneNode(false);
        }
        
        // Si c'est un élément
        if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            
            // Vérifier si la balise est autorisée
            if (!allowedTags.includes(tagName)) {
                // Si non autorisée, retourner seulement le contenu texte
                return document.createTextNode(node.textContent);
            }
            
            // Créer un nouvel élément propre
            const cleanElement = document.createElement(tagName);
            
            // Copier seulement les attributs autorisés
            for (const attr of node.attributes) {
                if (allowedAttributes.includes(attr.name.toLowerCase())) {
                    // Vérifier que les URLs ne contiennent pas javascript:
                    if (attr.name.toLowerCase() === 'href') {
                        const value = attr.value.trim().toLowerCase();
                        if (value.startsWith('javascript:') || 
                            value.startsWith('data:') || 
                            value.startsWith('vbscript:')) {
                            continue; // Skip cet attribut dangereux
                        }
                    }
                    cleanElement.setAttribute(attr.name, attr.value);
                }
            }
            
            // Nettoyer récursivement les enfants
            for (const child of node.childNodes) {
                const cleanChild = cleanNode(child);
                if (cleanChild) {
                    cleanElement.appendChild(cleanChild);
                }
            }
            
            return cleanElement;
        }
        
        return null;
    }
    
    // Nettoyer le body du document parsé
    const cleanBody = document.createElement('div');
    for (const child of doc.body.childNodes) {
        const cleanChild = cleanNode(child);
        if (cleanChild) {
            cleanBody.appendChild(cleanChild);
        }
    }
    
    return cleanBody.innerHTML;
}

/**
 * Échappe le HTML en texte brut (plus sûr que sanitizeHTML)
 * Convertit tous les caractères HTML en entités
 * À utiliser quand on veut afficher du texte, pas du HTML
 * @param {string} text - Le texte à échapper
 * @returns {string} - Texte échappé
 */
export function escapeHTML(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Nettoie le HTML de manière stricte (texte seul)
 * Retire TOUT le HTML, garde uniquement le texte
 * @param {string} html - Le HTML à nettoyer
 * @returns {string} - Texte pur sans HTML
 */
export function stripHTML(html) {
    if (!html || typeof html !== 'string') {
        return '';
    }
    
    // NOTE SÉCURITÉ: innerHTML utilisé ici de manière sûre
    // On extrait seulement le texte avec textContent (pas d'exécution de script)
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
}

/**
 * Définir le mot de passe maître en cache
 * @param {string} password 
 */
export function setMasterPassword(password) {
    cachedMasterPassword = password;
}

/**
 * Obtenir le mot de passe maître en cache
 * @returns {string|null}
 */
export function getMasterPassword() {
    return cachedMasterPassword;
}

/**
 * Effacer le mot de passe maître du cache
 */
export function clearMasterPassword() {
    cachedMasterPassword = null;
}

/**
 * Déchiffrer la clé API si nécessaire
 * @param {string|Object} apiKey - Clé API (chiffrée ou en clair)
 * @param {boolean} useMasterPassword - Si un mot de passe maître est utilisé
 * @returns {Promise<string>} - Clé API en clair
 */
async function decryptApiKeyIfNeeded(apiKey, useMasterPassword) {
    // Debug
    console.log('[Dolibarr Debug] Type de clé API:', typeof apiKey);
    console.log('[Dolibarr Debug] Clé chiffrée?', cryptoLib.isEncrypted(apiKey));
    console.log('[Dolibarr Debug] Utilise mot de passe?', useMasterPassword);
    
    // Si la clé est chiffrée
    if (cryptoLib.isEncrypted(apiKey)) {
        console.log('[Dolibarr Debug] Déchiffrement de la clé...');
        const password = useMasterPassword ? cachedMasterPassword : null;
        
        if (useMasterPassword && !password) {
            console.error('[Dolibarr Debug] Mot de passe requis mais non fourni');
            throw new Error('Master password required but not provided');
        }
        
        const decrypted = await cryptoLib.decryptData(apiKey, password);
        console.log('[Dolibarr Debug] Clé déchiffrée avec succès');
        return decrypted;
    }
    
    // Sinon, retourner la clé telle quelle (ancien format)
    console.log('[Dolibarr Debug] Utilisation de la clé en clair (ancien format)');
    return apiKey;
}

export async function checkConfig(){

    let configData = await browser.storage.local.get({
        dolibarrApiKey:'', 
        dolibarrApiUrl:'', 
        dolibarrApiEntity:1,
        useMasterPassword: false
    });

    let apiKey = configData.dolibarrApiKey;
    let dolUrl = configData.dolibarrApiUrl;
	let apiEntity = configData.dolibarrApiEntity;
    
    // Vérifier si la clé existe (même chiffrée)
    if(!apiKey || (typeof apiKey === 'string' && apiKey.length === 0)){  
        return false; 
    }
    
    if(dolUrl ==0 || apiEntity.length == 0){  
        return false; 
    }
    
    // Si un mot de passe maître est requis, vérifier qu'il est en cache
    if(configData.useMasterPassword && !cachedMasterPassword){
        return false;
    }

    return true;
}


export async function callDolibarrApi(endPoint, getDataParam, type = 'GET', postData, successCallBackFunction = ()=>{}, errorCallBackFunction = ()=>{}, cache = false){

    console.log('[Dolibarr Debug] callDolibarrApi appelé pour:', endPoint);
    
    let configData = await browser.storage.local.get({
        dolibarrApiKey:'', 
        dolibarrApiUrl:'', 
        dolibarrApiEntity:1,
        useMasterPassword: false
    });

    let apiKey = configData.dolibarrApiKey;
    let dolUrl = configData.dolibarrApiUrl;
	let apiEntity = configData.dolibarrApiEntity;
	
	console.log('[Dolibarr Debug] Configuration:', {
        hasApiKey: !!apiKey,
        apiKeyType: typeof apiKey,
        dolUrl: dolUrl,
        apiEntity: apiEntity,
        useMasterPassword: configData.useMasterPassword
    });
	
	if(apiEntity.length == 0 || apiEntity <= 0){
        apiEntity = 1;
    }
    if(typeof getDataParam.entity === "undefined"){
        getDataParam.entity = apiEntity;
    }

    // Vérifier si la clé existe
    if(!apiKey || (typeof apiKey === 'string' && apiKey.length === 0) || dolUrl == 0){  
        console.error('[Dolibarr Debug] Configuration incomplète');
        if (typeof errorCallBackFunction === 'function') {
            errorCallBackFunction("Fail getting settings");
        }
        return;
    }
    
    // Déchiffrer la clé API si nécessaire
    try {
        apiKey = await decryptApiKeyIfNeeded(apiKey, configData.useMasterPassword);
        console.log('[Dolibarr Debug] Clé API prête pour utilisation');
    } catch (error) {
        console.error("[Dolibarr Debug] Failed to decrypt API key:", error);
        if (typeof errorCallBackFunction === 'function') {
            errorCallBackFunction("Failed to decrypt API key. Please unlock the extension.");
        }
        return;
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

    console.log('[Dolibarr Debug] URL finale:', finalUrl);
    console.log('[Dolibarr Debug] Méthode:', type);

    fetch(finalUrl, {
        method: type,
        headers: {
            'DOLAPIKEY': apiKey,
            'DOLAPIENTITY': apiEntity,
            "Content-Type": "application/json"
        },
        body: (type.toUpperCase() !== 'GET' && postData) ? postData : undefined,
        cache: cache && type == 'GET' ? "force-cache" : "default"
    })
    .then(response => {
        console.log('[Dolibarr Debug] Réponse HTTP:', response.status, response.statusText);
        if (!response.ok) {
            const statusErrorMap = {
                404: "Not found",
                400: "Server understood the request, but request content was invalid.",
                401: "Unauthorized access.",
                403: "Forbidden resource can't be accessed.",
                500: "Internal server error.",
                503: "Service unavailable."
            };
            let errorMsg = statusErrorMap[response.status] || `Unknown Error (HTTP ${response.status}: ${response.statusText})`;
            console.error('[Dolibarr Debug] Erreur HTTP:', errorMsg);
            throw new Error(errorMsg);
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
        console.error('[Dolibarr Debug] Erreur catch:', error);
        if (typeof errorCallBackFunction === 'function') {
            errorCallBackFunction(error.message);
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



function replace_i18n(obj, tag) {
    var msg = tag.replace(/__MSG_(\w+)__/g, function(match, v1) {
        return v1 ? chrome.i18n.getMessage(v1) : '';
    });

    if(msg != tag) {
        // CORRECTION : On remplace seulement dans le innerHTML existant
        // On ne touche pas à la structure HTML, juste au texte des messages
        obj.innerHTML = msg;
        
        // NOTE SÉCURITÉ : Les traductions viennent de messages.json (contrôlé)
        // Risque XSS faible car fichiers locaux, mais à surveiller
    }
}

export function localizeHtmlPage() {
    // Localize using __MSG_***__ data tags
    var data = document.querySelectorAll('[data-localize]');

    for (var i in data) if (data.hasOwnProperty(i)) {
        var obj = data[i];
        var tag = obj.getAttribute('data-localize').toString();

        replace_i18n(obj, tag);
    }

    // Localize everything else by replacing all __MSG_***__ tags
    var page = document.getElementsByTagName('html');

    for (var j = 0; j < page.length; j++) {
        var obj = page[j];
        // NOTE SÉCURITÉ: innerHTML utilisé seulement en LECTURE ici
        // Le contenu est ensuite remplacé par textContent dans replace_i18n()
        var tag = obj.innerHTML.toString();
        replace_i18n(obj, tag);
    }
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
/**
 * Parse une chaîne HTML en élément DOM
 * NOTE SÉCURITÉ: Cette fonction doit être utilisée avec précaution
 * Toujours nettoyer le HTML avec sanitizeHTML() avant d'utiliser parseHTML()
 * @param {string} html - Le HTML à parser
 * @returns {Node} - Le nœud DOM
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
                // Nettoyer le HTML avant de l'injecter (protection XSS)
                const cleanHTML = sanitizeHTML(elem.html);
                
                // Parser le HTML nettoyé
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = cleanHTML;
                
                // Ajouter le contenu nettoyé
                while (tempDiv.firstChild) {
                    td.appendChild(tempDiv.firstChild);
                }

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
 * Génère un avatar par défaut avec les initiales de l'utilisateur
 * @param {string} fullName - Le nom complet de l'utilisateur
 * @returns {string} - Une data URI SVG représentant l'avatar
 */
function generateDefaultAvatar(fullName) {
    // Extraire les initiales (max 2 caractères)
    let initials = 'U'; // Par défaut
    
    if (fullName && fullName.length > 0) {
        const names = fullName.trim().split(' ');
        if (names.length >= 2) {
            // Prendre la première lettre du prénom et du nom
            initials = names[0].charAt(0).toUpperCase() + names[names.length - 1].charAt(0).toUpperCase();
        } else if (names.length === 1 && names[0].length > 0) {
            // Prendre les 2 premières lettres ou juste la première
            initials = names[0].substring(0, 2).toUpperCase();
        }
    }
    
    // Générer une couleur de fond basée sur le nom (pour avoir toujours la même couleur pour le même nom)
    let hash = 0;
    for (let i = 0; i < fullName.length; i++) {
        hash = fullName.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convertir le hash en couleur (teintes variées mais lisibles)
    const hue = Math.abs(hash % 360);
    const backgroundColor = `hsl(${hue}, 60%, 50%)`;
    
    // Créer un SVG simple avec les initiales
    const svg = `
        <svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="20" r="20" fill="${backgroundColor}"/>
            <text x="50%" y="50%" text-anchor="middle" dy="0.35em" 
                  font-family="Arial, sans-serif" font-size="16" fill="white" font-weight="bold">
                ${initials}
            </text>
        </svg>
    `.trim();
    
    // Encoder le SVG en data URI
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

export async function getMsgTpl(msg) {
    // create a new div element
    let container = document.createElement("div");
    container.id = 'mail-message-' + msg.id;
    container.classList.add('mail-msg-box');

    // Vérifier si l'utilisateur veut utiliser Gravatar
    let config = await browser.storage.local.get({dolibarrUseGravatar: false});
    
    if(typeof msg.user_mail_hash !== undefined) {
        let imgContainer = document.createElement("div");
        imgContainer.classList.add('mail-msg-box__img');

        let img = document.createElement("img");
        
        // Utiliser Gravatar seulement si l'option est activée
        if(config.dolibarrUseGravatar) {
            img.src = `https://www.gravatar.com/avatar/${msg.user_mail_hash}?d=identicon`;
        } else {
            // Utiliser une icône par défaut (identicon local ou une image de base)
            // Pour l'instant, on utilise un avatar généré via data URI (cercle avec initiales)
            img.src = generateDefaultAvatar(msg.user_full_name);
        }
        
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


    let deleteBtn = document.createElement("button");
    deleteBtn.classList.add('btn-tiny-action');
    deleteBtn.classList.add('--delete-btn');
    deleteBtn.classList.add('delete-message-btn');
    deleteBtn.title = browser.i18n.getMessage('DoubleClickToDelete');
    deleteBtn.setAttribute('data-msg-id', msg.id);
    deleteBtn.setAttribute('data-action', 'delete');
    deleteBtn.addEventListener("dblclick", (event) => {
        event.preventDefault();
        let commentDolId = deleteBtn.getAttribute('data-msg-id');

        callDolibarrApi(
            'crmclientconnector/emailusermsgs/'+ commentDolId,
            {},
            'DELETE',
            {},
            (resData)=>{
                container.remove();
            }, (err)=>{

            });
    });

    let deleteBtnIcon = document.createElement("img");
    deleteBtnIcon.src = browser.runtime.getURL("images/trash-icon.svg");
    deleteBtnIcon.classList.add('btn-tiny-action-icon');
    deleteBtn.appendChild(deleteBtnIcon);

    messageBtnAction.appendChild(deleteBtn);
    message.appendChild(messageBtnAction);



    let messageTxt = document.createElement("div");
    messageTxt.classList.add('dolibarr-textarea');
    messageTxt.disabled = true;
    messageTxt.innerText = msg.message;
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
        callDolibarrApi('crmclientconnector/emailusermsgs', {sqlfilters: `(fk_email_link:=:${resData.id})`}, 'GET', {}, async (resDataMsg)=>{
            let lisMsgContainer = document.getElementById('dolibarr-notes-list-container');
            if(tabs !== false){
                updateBadgeMessageDisplayAction(tabs, resDataMsg.length);
            }
            lisMsgContainer.textContent = '';
            
            // Utiliser une boucle for...of pour gérer les appels async
            for (const msg of resDataMsg) {
                // create a new div element
                const msgElement = await getMsgTpl(msg);
                lisMsgContainer.appendChild(msgElement);
            }
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