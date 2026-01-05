/**
 * Module de chiffrement pour protéger la clé API
 * Utilise Web Crypto API avec AES-GCM
 */

/**
 * Convertit une chaîne en ArrayBuffer
 * @param {string} str - La chaîne à convertir
 * @returns {ArrayBuffer}
 */
function stringToArrayBuffer(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str);
}

/**
 * Convertit un ArrayBuffer en chaîne
 * @param {ArrayBuffer} buffer - Le buffer à convertir
 * @returns {string}
 */
function arrayBufferToString(buffer) {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
}

/**
 * Convertit un ArrayBuffer en chaîne Base64
 * @param {ArrayBuffer} buffer - Le buffer à convertir
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Convertit une chaîne Base64 en ArrayBuffer
 * @param {string} base64 - La chaîne Base64
 * @returns {ArrayBuffer}
 */
function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Génère une clé de chiffrement à partir d'un mot de passe
 * Utilise PBKDF2 pour dériver une clé sécurisée
 * @param {string} password - Le mot de passe maître
 * @param {ArrayBuffer} salt - Le sel pour la dérivation
 * @returns {Promise<CryptoKey>}
 */
async function deriveKeyFromPassword(password, salt) {
    // Convertir le mot de passe en clé pour PBKDF2
    const passwordKey = await crypto.subtle.importKey(
        'raw',
        stringToArrayBuffer(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );

    // Dériver une clé AES-GCM à partir du mot de passe
    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000, // 100k itérations pour la sécurité
            hash: 'SHA-256'
        },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Génère une clé de chiffrement par défaut (moins sécurisée)
 * Utilisée si l'utilisateur ne veut pas de mot de passe maître
 * Note: Cette approche est moins sécurisée car la clé peut être retrouvée dans le code
 * @returns {Promise<CryptoKey>}
 */
async function getDefaultKey() {
    // Utiliser une clé dérivée d'une chaîne fixe + identifiant unique du navigateur
    // Note: Ce n'est pas parfaitement sécurisé, mais c'est mieux que du texte clair
    const browserFingerprint = navigator.userAgent + navigator.language;
    const salt = stringToArrayBuffer('dolibarr-connector-salt-v1');
    
    return await deriveKeyFromPassword(browserFingerprint, salt);
}

/**
 * Chiffre une chaîne avec AES-GCM
 * @param {string} plaintext - Le texte à chiffrer
 * @param {string|null} password - Le mot de passe maître (optionnel)
 * @returns {Promise<Object>} - Objet contenant les données chiffrées
 */
export async function encryptData(plaintext, password = null) {
    // Générer un vecteur d'initialisation aléatoire
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Générer un sel pour la dérivation de clé
    const salt = crypto.getRandomValues(new Uint8Array(16));
    
    // Obtenir la clé de chiffrement
    let key;
    if (password && password.length > 0) {
        key = await deriveKeyFromPassword(password, salt);
    } else {
        key = await getDefaultKey();
    }
    
    // Chiffrer les données
    const encrypted = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        key,
        stringToArrayBuffer(plaintext)
    );
    
    // Retourner les données chiffrées avec les métadonnées
    return {
        ciphertext: arrayBufferToBase64(encrypted),
        iv: arrayBufferToBase64(iv),
        salt: arrayBufferToBase64(salt),
        hasPassword: password !== null && password.length > 0,
        version: 1 // Pour la compatibilité future
    };
}

/**
 * Déchiffre une chaîne chiffrée avec AES-GCM
 * @param {Object} encryptedData - Les données chiffrées
 * @param {string|null} password - Le mot de passe maître (optionnel)
 * @returns {Promise<string>} - Le texte déchiffré
 * @throws {Error} Si le déchiffrement échoue
 */
export async function decryptData(encryptedData, password = null) {
    try {
        // Vérifier que les données sont valides
        if (!encryptedData || !encryptedData.ciphertext || !encryptedData.iv) {
            throw new Error('Invalid encrypted data format');
        }
        
        // Convertir les données Base64 en ArrayBuffer
        const ciphertext = base64ToArrayBuffer(encryptedData.ciphertext);
        const iv = base64ToArrayBuffer(encryptedData.iv);
        const salt = base64ToArrayBuffer(encryptedData.salt);
        
        // Obtenir la clé de déchiffrement
        let key;
        if (encryptedData.hasPassword) {
            if (!password || password.length === 0) {
                throw new Error('Password required for decryption');
            }
            key = await deriveKeyFromPassword(password, salt);
        } else {
            key = await getDefaultKey();
        }
        
        // Déchiffrer les données
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            ciphertext
        );
        
        return arrayBufferToString(decrypted);
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt data. Wrong password or corrupted data.');
    }
}

/**
 * Vérifie si une clé API est chiffrée
 * @param {string|Object} data - Les données à vérifier
 * @returns {boolean}
 */
export function isEncrypted(data) {
    if (typeof data === 'object' && data !== null) {
        return data.hasOwnProperty('ciphertext') && 
               data.hasOwnProperty('iv') && 
               data.hasOwnProperty('version');
    }
    return false;
}

/**
 * Migre une clé API en clair vers une version chiffrée
 * @param {string} plaintextKey - La clé API en clair
 * @param {string|null} password - Le mot de passe maître (optionnel)
 * @returns {Promise<Object>} - La clé chiffrée
 */
export async function migrateToEncrypted(plaintextKey, password = null) {
    if (!plaintextKey || plaintextKey.length === 0) {
        return null;
    }
    
    return await encryptData(plaintextKey, password);
}

/**
 * Vérifie si un mot de passe est valide pour déchiffrer les données
 * @param {Object} encryptedData - Les données chiffrées
 * @param {string} password - Le mot de passe à tester
 * @returns {Promise<boolean>}
 */
export async function validatePassword(encryptedData, password) {
    try {
        await decryptData(encryptedData, password);
        return true;
    } catch (error) {
        return false;
    }
}

