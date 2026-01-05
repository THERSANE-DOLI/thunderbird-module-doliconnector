# 🎫 Nouvelle Fonctionnalité : Création de Tickets depuis Email

## 📋 Vue d'ensemble

Vous pouvez maintenant créer des tickets Dolibarr directement depuis un email client dans Thunderbird.

---

## ✨ Fonctionnalités Implémentées

### 🎯 Création de Ticket en Un Clic
- **Bouton "🎫 Créer un ticket"** dans la popup Dolibarr
- Le ticket récupère automatiquement :
  - ✅ **Sujet** : L'objet de l'email
  - ✅ **Message initial** : Le contenu complet de l'email
  - ✅ **Date et heure** : La date de réception de l'email
  - ✅ **Email client** : L'adresse email de l'expéditeur
  - ✅ **Lien au tiers** : Si un tiers Dolibarr est trouvé, le ticket lui est automatiquement affecté

### 🔗 Liaison Intelligente au Tiers
- Si l'extension trouve un contact ou tiers correspondant à l'email, le ticket sera **automatiquement lié** à ce tiers
- Si aucun tiers n'est trouvé, le ticket est créé **sans lien** (peut être lié manuellement ensuite dans Dolibarr)

### 🌍 Support Multilingue
- 🇫🇷 Français
- 🇬🇧 Anglais
- 🇬🇷 Grec

---

## 🚀 Comment Utiliser

### 1. Ouvrir un Email Client
- Sélectionnez un email d'un client dans Thunderbird
- Cliquez sur l'icône Dolibarr pour ouvrir la popup

### 2. Créer le Ticket
- Dans la popup, vous verrez le bouton **"🎫 Créer un ticket"**
- Cliquez dessus pour créer le ticket

### 3. Confirmation
- **Succès** : Le bouton affichera "✅ Ticket créé avec succès" (vert)
- **Erreur** : Le bouton affichera "❌ Erreur lors de la création du ticket" (rouge)
- Le bouton se réinitialise automatiquement après 3 secondes

### 4. Consulter le Ticket
- Connectez-vous à votre Dolibarr
- Allez dans **Menu → Tickets**
- Vous trouverez le nouveau ticket avec :
  - Sujet : L'objet de l'email
  - Message initial : Le contenu de l'email
  - Date : La date de l'email
  - Client : Lié au tiers si trouvé

---

## 🔧 Paramètres du Ticket Créé

Les tickets sont créés avec les paramètres par défaut suivants :

| Paramètre | Valeur |
|-----------|--------|
| **Type** | SUPPORT |
| **Catégorie** | OTHER (Autre) |
| **Sévérité** | NORMAL |
| **Email** | Email de l'expéditeur |
| **Date** | Date de réception de l'email |
| **Tiers** | Lié automatiquement si trouvé |

> 💡 **Note** : Ces paramètres peuvent être modifiés dans Dolibarr après la création du ticket.

---

## 📝 Détails Techniques

### Contenu du Ticket

#### Sujet
- Reprend l'**objet de l'email**
- Si l'email n'a pas d'objet : "Email sans objet"

#### Message Initial
- Contenu **complet** de l'email
- Si l'email est en HTML, il est converti en texte brut
- Limite de 5000 caractères (avec indication si tronqué)

#### Date et Heure
- Date de **réception** de l'email (pas la date d'envoi)
- Format timestamp Unix pour compatibilité Dolibarr

### Liaison au Tiers

Le module recherche le tiers dans cet ordre :
1. **Contact** dans Dolibarr avec l'email correspondant
2. **Tiers** avec l'email correspondant
3. **Tiers** avec le domaine de l'email (si option activée)

Si trouvé, le champ `socid` du ticket est automatiquement renseigné.

---

## ⚠️ Prérequis

### Dans Dolibarr
1. **Module Tickets activé**
   - Menu → Configuration → Modules/Applications
   - Activer "Tickets / Helpdesk"

2. **API REST configurée**
   - Votre clé API doit avoir les droits sur les tickets
   - Permissions : "Créer des tickets" (ou droits supérieurs)

3. **Configuration minimale des tickets**
   - Au moins une catégorie définie
   - Au moins un type de ticket

### Dans Thunderbird
- Extension Dolibarr Connector **1.9.1+**
- Configuration complète (URL Dolibarr, Clé API, etc.)

---

## 🧪 Tests à Effectuer

### Test 1 : Email avec Tiers Connu
```
1. Ouvrir un email d'un client existant dans Dolibarr
2. Cliquer sur l'icône Dolibarr
3. Vérifier que le nom du tiers s'affiche
4. Cliquer sur "🎫 Créer un ticket"
5. Vérifier le message de succès
6. Dans Dolibarr → Tickets : Vérifier que le ticket est lié au bon tiers
```

### Test 2 : Email avec Tiers Inconnu
```
1. Ouvrir un email d'un expéditeur inconnu
2. Cliquer sur l'icône Dolibarr
3. Vérifier que le bouton "Créer un ticket" est visible
4. Cliquer dessus
5. Vérifier le message de succès
6. Dans Dolibarr → Tickets : Vérifier que le ticket existe (sans tiers lié)
```

### Test 3 : Contenu du Ticket
```
1. Créer un ticket depuis un email
2. Dans Dolibarr, ouvrir le ticket créé
3. Vérifier :
   ✓ Le sujet correspond à l'objet de l'email
   ✓ Le message initial contient le texte de l'email
   ✓ L'email de l'expéditeur est enregistré
   ✓ La date correspond (environ) à celle de l'email
```

### Test 4 : Gestion d'Erreur
```
1. Désactiver temporairement le module Tickets dans Dolibarr
2. Essayer de créer un ticket depuis Thunderbird
3. Vérifier le message d'erreur s'affiche correctement
4. Réactiver le module et retester
```

---

## 🐛 Dépannage

### Le bouton n'apparaît pas
- ✅ Vérifiez qu'un email est bien sélectionné
- ✅ Vérifiez que la configuration Dolibarr est complète
- ✅ Rechargez l'extension (Ctrl+Shift+A → Recharger)

### Erreur "Ticket creation error"
- ✅ Vérifiez que le module Tickets est activé dans Dolibarr
- ✅ Vérifiez les droits de votre clé API
- ✅ Consultez la console développeur (Ctrl+Shift+J) pour plus de détails

### Le ticket est créé mais pas de tiers lié
- C'est normal si l'expéditeur n'existe pas dans Dolibarr
- Vous pouvez lier manuellement le ticket au tiers dans Dolibarr
- Activez l'option "Rechercher par domaine" dans les paramètres pour plus de résultats

### Le contenu est tronqué
- Si l'email fait plus de 5000 caractères, il est automatiquement tronqué
- Le contenu complet reste dans l'email original
- Vous pouvez copier-coller manuellement plus de contenu si nécessaire

---

## 📊 Logs de Débogage

Pour diagnostiquer les problèmes, consultez la console développeur :

```javascript
// Ouvrir la console : Ctrl+Shift+J dans Thunderbird
// Rechercher les logs commençant par :
[Dolibarr Ticket] Création ticket avec données: {...}
[Dolibarr Ticket] Ticket créé: {...}
[Dolibarr Ticket] Erreur création ticket: {...}
```

---

## 🔮 Améliorations Futures Possibles

### À Court Terme
- [ ] Choix du type de ticket (Support, Bug, Demande)
- [ ] Choix de la catégorie
- [ ] Choix de la sévérité
- [ ] Dialogue de confirmation avant création

### À Moyen Terme
- [ ] Joindre les pièces jointes de l'email au ticket
- [ ] Créer des tickets avec plusieurs emails (conversation)
- [ ] Affecter automatiquement à un utilisateur
- [ ] Définir une priorité

### À Long Terme
- [ ] Suivi des tickets depuis Thunderbird
- [ ] Répondre aux tickets depuis Thunderbird
- [ ] Notifications de changement de statut
- [ ] Statistiques de tickets

---

## 📦 Installation de la Nouvelle Version

### Mode Développement (Recommandé pour test)
```
1. Ctrl + Shift + A
2. Roue dentée → "Déboguer des modules complémentaires"
3. "Charger un module temporaire"
4. Sélectionner manifest.json
```

### Installation XPI
```
1. Désinstaller l'ancienne version
2. Redémarrer Thunderbird
3. Ctrl + Shift + A
4. Roue dentée → "Installer un module depuis un fichier..."
5. Sélectionner thunderbird-module-doliconnector.xpi
```

---

## 🎉 Conclusion

Cette nouvelle fonctionnalité permet de **gagner du temps** en créant des tickets directement depuis les emails clients, sans avoir à :
- Copier-coller l'email dans Dolibarr
- Renseigner manuellement le sujet, le message, la date
- Chercher et lier le tiers manuellement

**Tout est automatique !** 🚀

---

## 📞 Support

En cas de problème :
1. Consultez la console développeur (Ctrl+Shift+J)
2. Vérifiez la configuration Dolibarr (module Tickets, droits API)
3. Testez avec un email simple pour isoler le problème
4. Consultez les logs `[Dolibarr Ticket]` pour plus de détails

**Version** : 1.9.1+  
**Date** : Janvier 2026  
**Fonctionnalité** : Création de tickets depuis email ✅

