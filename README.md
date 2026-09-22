# Dolibarr connector 

## A Dolibarr add-on for Thunderbird

This module need configuration to work 

- [Thersane Add-on page](https://www.thersane.fr/content/60-plugin-thunderbird-pour-dolibarr)
- [See Thunderbird addons page](https://addons.thunderbird.net/fr/thunderbird/addon/dolibarr-connector/)

# How to build package xpi
## On linux 
run command or execute as a program (need zip command ```sudo apt install zip```)
```bash
buildXpi.sh
```
## On other Os
### 1. Build a Zip of the Folder's files
```
cd my-addon-folder
zip -r my-addon.zip *
```
### 2. Rename to `.xpi`
```
mv my-addon.zip my-addon.xpi
```

# install
- Open Thunderbird.
- Go to Add-ons & Themes (Ctrl+Shift+A).
- Click on the gear icon and select Install Add-on From File….
- Select your .xpi file and install it.

## Know issues
 In somes cases CORS errors can appears so try this in your .htaccess (in Dolibarr) and i it work you will need to adapt your Access-Control-Allow-Origin
```
<IfModule mod_headers.c>
    Header always unset Access-Control-Allow-Origin
    Header always set Access-Control-Allow-Origin "*"
    Header always set Access-Control-Allow-Headers "Content-Type, Authorization, DOLAPIKEY, DOLAPIENTITY"
</IfModule>
```

# Contribute
see this start doc : [How to create hello world addon](https://developer.thunderbird.net/add-ons/hello-world-add-on)

# Thunderbird Dolibarr Connector

## Présentation

Thunderbird Dolibarr Connector est une extension open source pour Mozilla Thunderbird permettant d'intégrer Dolibarr directement dans l'interface de messagerie.

L'objectif principal est de permettre à l'utilisateur de consulter les informations Dolibarr liées aux emails qu'il consulte dans Thunderbird, sans avoir à ouvrir Dolibarr manuellement.

Le projet est développé par THERSANE et distribué gratuitement sous licence open source.

Page de présentation :
https://www.thersane.fr/fr/content/60-plugin-thunderbird-pour-dolibarr

Extension Thunderbird :
https://addons.thunderbird.net/

Le projet est actuellement en développement. Il faut donc conserver une architecture permettant de faire évoluer progressivement les fonctionnalités sans casser les fonctionnalités existantes.

---

## Objectifs du projet

L'extension doit permettre de faire le lien entre Thunderbird et Dolibarr.

Les principaux objectifs sont :

- identifier l'expéditeur ou les destinataires d'un email à partir de leurs adresses email ;
- rechercher les tiers et contacts correspondants dans Dolibarr ;
- afficher les informations du tiers ou du contact directement depuis Thunderbird ;
- accéder rapidement à la fiche Dolibarr correspondante ;
- afficher les derniers documents associés ;
- permettre la création rapide d'un contact ou d'un tiers lorsqu'une adresse email n'est pas connue ;
- afficher les informations et commentaires liés aux emails lorsque la fonctionnalité correspondante est activée ;
- permettre à terme d'enrichir l'intégration Thunderbird / Dolibarr.

---

# Fonctionnement général

## Bouton Dolibarr dans Thunderbird

L'extension ajoute un bouton permettant d'interagir avec Dolibarr depuis Thunderbird.

Lorsque l'utilisateur consulte un email, l'extension peut utiliser les adresses email présentes dans le message afin de rechercher les correspondances dans Dolibarr.

Le résultat de cette recherche est ensuite présenté dans l'interface de l'extension.

---

## Recherche d'un contact ou d'un tiers

Lorsqu'un email est ouvert, l'extension récupère les adresses email pertinentes du message.

Ces adresses sont utilisées pour rechercher les contacts et tiers correspondants dans Dolibarr.

Le système doit pouvoir distinguer au minimum :

- une adresse correspondant à un contact Dolibarr ;
- une adresse correspondant à un tiers ;
- une adresse inconnue ;
- une adresse appartenant à un domaine qui doit être ignoré selon la configuration Dolibarr.

La recherche doit rester suffisamment souple pour pouvoir gérer les différents formats d'adresses email rencontrés dans Thunderbird.

---

# Informations affichées

Lorsqu'une correspondance est trouvée, l'extension peut afficher :

- le nom du tiers ou de l'entreprise ;
- le contact correspondant lorsque celui-ci existe ;
- un accès rapide vers la fiche complète dans Dolibarr ;
- les derniers documents associés au contact ou au tiers.

Les documents peuvent notamment inclure :

- devis ;
- commandes ;
- factures.

L'interface doit rester concise afin de ne pas transformer Thunderbird en copie complète de Dolibarr.

Le rôle du plugin est de fournir un accès rapide aux informations utiles depuis la messagerie.

---

# Création rapide d'un contact ou d'un tiers

Lorsqu'une adresse email n'est pas connue dans Dolibarr, l'extension peut proposer une création rapide.

L'objectif est de permettre à l'utilisateur d'enregistrer directement depuis Thunderbird :

- un nouveau contact ;
- ou un nouveau tiers.

Cette fonctionnalité doit éviter à l'utilisateur de devoir quitter Thunderbird puis effectuer manuellement une recherche et une création dans Dolibarr.

La création doit respecter les règles et permissions définies par l'API Dolibarr.

---

# Intégration des notes et commentaires

Une fonctionnalité complémentaire permet d'afficher et d'ajouter des notes ou commentaires Dolibarr directement au niveau des emails consultés dans Thunderbird.

Cette fonctionnalité est optionnelle.

Elle doit être explicitement activée dans les préférences du plugin Thunderbird.

Cette fonctionnalité dépend du module Dolibarr :

`CRM Client Connector`

Elle ne doit donc pas être considérée comme une fonctionnalité autonome du plugin Thunderbird.

---

# Dépendance CRM Client Connector

Le module Dolibarr CRM Client Connector fournit une couche complémentaire permettant aux applications externes de communiquer avec Dolibarr via des APIs spécifiques.

Le plugin Thunderbird utilise cette couche pour certaines fonctionnalités avancées.

Le CRM Client Connector permet notamment de :

- connecter des emails à Dolibarr ;
- récupérer les informations liées aux emails ;
- ajouter des notes ;
- ajouter des commentaires ;
- fournir des fonctionnalités complémentaires destinées aux applications externes.

Lorsqu'une fonctionnalité du plugin nécessite le CRM Client Connector, le plugin doit détecter correctement son absence ou son indisponibilité et éviter d'afficher des fonctionnalités qui ne peuvent pas fonctionner.

---

# Comptes de messagerie autorisés

Le CRM Client Connector ajoute dans Dolibarr un dictionnaire permettant de définir les comptes de messagerie autorisés à utiliser les APIs Dolibarr.

Cette configuration est importante pour les fonctionnalités liées aux notes et commentaires.

Le plugin Thunderbird doit tenir compte de cette configuration.

Si le compte Thunderbird utilisé n'est pas autorisé, les fonctionnalités nécessitant cet accès ne doivent pas être proposées à l'utilisateur.

La configuration doit donc être considérée comme une condition d'accès fonctionnelle.

---

# Domaines email exclus

Le CRM Client Connector permet également de configurer des domaines email exclus de certaines recherches de tiers.

Cette fonctionnalité permet par exemple d'éviter de rechercher automatiquement dans Dolibarr des adresses appartenant à des services de messagerie génériques tels que :

- gmail.com ;
- outlook.com ;
- laposte.net ;
- etc.

Cette liste est destinée principalement à contrôler la recherche automatique de tiers.

Elle ne doit pas être confondue avec la liste des comptes de messagerie autorisés pour les fonctionnalités de notes et commentaires.

---

# Permissions Dolibarr

Les fonctionnalités accessibles depuis Thunderbird dépendent des permissions accordées à l'utilisateur dans Dolibarr.

Le CRM Client Connector introduit notamment des droits permettant de :

- consulter les informations liées aux emails ;
- ajouter des notes ;
- ajouter des commentaires.

Le plugin ne doit jamais contourner les permissions Dolibarr.

Une fonctionnalité nécessitant une permission qui n'est pas accordée doit être masquée ou désactivée.

Les contrôles de permission doivent toujours être effectués côté serveur.

Le contrôle côté Thunderbird est uniquement destiné à améliorer l'expérience utilisateur.

---

# Architecture générale

Le projet est composé de deux parties principales :

## 1. Extension Thunderbird

Cette partie est responsable de :

- l'intégration dans Thunderbird ;
- l'interface utilisateur ;
- la récupération des informations du message courant ;
- l'extraction des adresses email ;
- les appels vers Dolibarr ;
- l'affichage des résultats ;
- les actions utilisateur ;
- la gestion des préférences de l'extension.

Cette partie doit rester indépendante autant que possible de l'implémentation interne de Dolibarr.

Elle doit communiquer avec Dolibarr via les interfaces prévues à cet effet.

## 2. Modules Dolibarr

Certaines fonctionnalités nécessitent des modules Dolibarr complémentaires.

Le plugin doit considérer Dolibarr comme un service distant et ne doit pas accéder directement aux tables SQL de Dolibarr.

Les échanges doivent passer par les APIs ou interfaces prévues par les modules Dolibarr.

---

# Principe important : aucune dépendance directe à la base Dolibarr

Le plugin Thunderbird ne doit jamais :

- se connecter directement à la base MySQL/MariaDB de Dolibarr ;
- exécuter des requêtes SQL sur la base Dolibarr ;
- dépendre directement de la structure des tables Dolibarr ;
- supposer qu'une table ou un champ particulier existe.

Toutes les interactions avec Dolibarr doivent passer par une API.

Cela permet notamment de :

- préserver la sécurité ;
- respecter les permissions Dolibarr ;
- éviter les dépendances à la structure SQL ;
- faciliter les évolutions de Dolibarr ;
- permettre l'utilisation d'un Dolibarr distant.

---

# Gestion des erreurs

Le plugin doit gérer proprement les situations suivantes :

- Dolibarr inaccessible ;
- URL Dolibarr incorrecte ;
- authentification invalide ;
- token invalide ou expiré ;
- module CRM Client Connector absent ;
- permission insuffisante ;
- compte email non autorisé ;
- aucun tiers trouvé ;
- plusieurs correspondances trouvées ;
- erreur API ;
- réponse API invalide ;
- délai d'attente dépassé.

Une erreur API ne doit jamais provoquer une erreur JavaScript non gérée ou rendre l'interface Thunderbird inutilisable.

Les erreurs doivent être présentées à l'utilisateur sous une forme compréhensible.

Les détails techniques peuvent être envoyés dans les logs de développement, mais ne doivent pas être affichés inutilement à l'utilisateur final.

---

# Sécurité

La sécurité est une priorité.

Ne jamais :

- stocker inutilement des identifiants Dolibarr ;
- afficher des tokens dans l'interface ;
- écrire des tokens dans les logs ;
- transmettre des informations sensibles à un service tiers ;
- contourner les permissions Dolibarr ;
- faire confiance aux données reçues de Thunderbird sans validation ;
- faire confiance aux données reçues de Dolibarr sans vérification.

Toutes les données provenant de Thunderbird ou de Dolibarr doivent être considérées comme non fiables avant traitement.

Les appels réseau doivent utiliser HTTPS lorsque cela est disponible.

---

# Interface utilisateur

L'interface doit rester simple et rapide.

Le plugin est destiné à être utilisé pendant la consultation quotidienne des emails.

Il faut éviter :

- les interfaces trop complexes ;
- les informations inutiles ;
- les multiples fenêtres lorsque cela peut être évité ;
- les requêtes réseau inutiles ;
- les temps de chargement longs.

Les informations les plus importantes doivent être immédiatement visibles.

Le nom du tiers et l'accès à sa fiche Dolibarr doivent être facilement accessibles.

---

# Performance

Le plugin doit limiter les appels vers Dolibarr.

Éviter notamment de lancer plusieurs recherches identiques pour un même email.

Lorsque cela est pertinent, utiliser un cache temporaire côté Thunderbird.

Le cache ne doit cependant pas provoquer l'affichage d'informations devenues obsolètes pendant une durée excessive.

Les appels API doivent être asynchrones afin de ne pas bloquer l'interface Thunderbird.

---

# Évolution du projet

Le projet est actuellement en développement.

Il est important de conserver une architecture permettant d'ajouter progressivement de nouvelles fonctionnalités.

Les évolutions possibles peuvent notamment concerner :

- amélioration de la recherche des tiers ;
- amélioration de l'affichage des documents ;
- association plus poussée entre emails et objets Dolibarr ;
- création de prospects ;
- création de contacts ;
- ajout de notes ;
- ajout de commentaires ;
- affichage de l'historique ;
- actions directement depuis Thunderbird ;
- amélioration de la gestion des conversations ;
- nouvelles interactions avec les modules Dolibarr.

Toute nouvelle fonctionnalité doit être conçue de manière à ne pas rendre obligatoire une fonctionnalité optionnelle existante.

---

# Règles de développement

## Général

Avant de modifier le code :

1. Comprendre le fonctionnement existant.
2. Identifier les flux entre Thunderbird et Dolibarr.
3. Identifier les APIs utilisées.
4. Vérifier les dépendances aux modules Dolibarr.
5. Vérifier les permissions nécessaires.
6. Vérifier les conséquences sur les versions précédentes.

Ne pas réécrire une partie importante du projet simplement pour simplifier le code sans nécessité.

Privilégier les modifications ciblées.

---

## Compatibilité

Le plugin doit rester compatible avec les versions de Thunderbird supportées par le projet.

Lorsqu'une API Thunderbird est utilisée, vérifier qu'elle est compatible avec la version minimale supportée.

Ne pas utiliser une API expérimentale ou dépréciée sans raison.

---

## APIs Dolibarr

Les appels à Dolibarr doivent être centralisés autant que possible.

Éviter de construire des appels API directement dans les composants d'interface.

Préférer une couche dédiée responsable de :

- construire les requêtes ;
- envoyer les requêtes ;
- gérer l'authentification ;
- interpréter les réponses ;
- gérer les erreurs.

Cela permet de faire évoluer l'API sans devoir modifier toute l'interface.

---

# Convention de développement

Le code doit rester :

- lisible ;
- modulaire ;
- documenté lorsque nécessaire ;
- facilement testable ;
- compatible avec les standards Thunderbird ;
- indépendant autant que possible de Dolibarr.

Ne pas ajouter de dépendance externe si une fonctionnalité peut être réalisée proprement avec les APIs natives disponibles.

---

# Fonctionnalités actuelles

## Intégration Thunderbird / Dolibarr

- [x] Bouton d'accès Dolibarr dans Thunderbird
- [x] Recherche d'informations à partir des adresses email
- [x] Affichage du tiers ou contact associé
- [x] Accès rapide à la fiche Dolibarr
- [x] Affichage des derniers documents associés
- [x] Création rapide d'un contact ou d'un tiers inconnu

## Notes et commentaires

- [x] Affichage des commentaires Dolibarr
- [x] Ajout de commentaires depuis Thunderbird
- [x] Activation configurable
- [x] Dépendance au module CRM Client Connector
- [x] Contrôle des comptes de messagerie autorisés
- [x] Respect des permissions Dolibarr

## État du projet

Le plugin est actuellement en cours de développement.

Les fonctionnalités peuvent évoluer et certaines parties peuvent encore être expérimentales.

Lorsqu'une fonctionnalité est ajoutée, il faut conserver une séparation claire entre :

- fonctionnalités natives du plugin Thunderbird ;
- fonctionnalités nécessitant CRM Client Connector ;
- fonctionnalités dépendant de la configuration Dolibarr ;
- fonctionnalités expérimentales.

---

# Licence

Le plugin est distribué gratuitement et en open source.

Il est fourni tel quel, sans garantie.

L'utilisation du logiciel se fait sous la responsabilité de l'utilisateur.

---

# Références

Page officielle THERSANE :

https://www.thersane.fr/fr/content/60-plugin-thunderbird-pour-dolibarr

Extension Thunderbird :

https://addons.thunderbird.net/

Dépôt source :

Voir le lien GitHub indiqué sur la page officielle THERSANE.

Module Dolibarr requis pour certaines fonctionnalités :

CRM Client Connector