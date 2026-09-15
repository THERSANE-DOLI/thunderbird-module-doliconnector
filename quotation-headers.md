# Quotation form

Voici un descriptif des entêtes email ajouté par le module de devis de Prestashop "tsquotationform".

Implémenté : si ces entêtes sont présentes et que l'expéditeur du mail fait partie de la liste des
"Expéditeurs de confiance pour les en-têtes de devis" (options du module), la recherche/création du
tiers se base sur l'email contenu dans `X-Quotation-Mail` et non plus sur l'expéditeur. Cette liste est
vide par défaut (comportement désactivé) pour éviter qu'un en-tête forgé ne détourne la recherche.

`X-Quotation-Data` sert à préremplir le bouton de création de tiers/contact (si tiers non trouvé,
`messagePopup/popup.js` → `setSocInfos`) et à afficher un bouton de création de devis préreliée au
tiers (si tiers trouvé). Voir `global.lib.js` → `getQuotationHeaders`, `getQuotationTrustedSenders`,
`isQuotationTrustedSender`.

ci dessous le descriptif des entêtes:

## En-têtes email pour l'intégration Dolibarr / collecteur de mails

L'email de **notification** envoyé à l'équipe commerciale à chaque demande de
devis (template `quotationform_notification`) part de l'adresse de la
boutique (`PS_SHOP_EMAIL`), pas de celle du demandeur. Le module tiers
Dolibarr qui associe automatiquement les mails entrants à un tiers ne peut
donc pas se baser sur l'expéditeur pour retrouver le demandeur.

Pour pallier ça, deux en-têtes SMTP personnalisés sont ajoutés à cet email
(uniquement à celui-là — pas à l'email de confirmation envoyé au client) :

| En-tête | Contenu | Exemple |
|---|---|---|
| `X-Quotation-Mail` | Adresse email du demandeur, en clair | `X-Quotation-Mail: jean.dupont@example.com` |
| `X-Quotation-Data` | Objet JSON compact avec les infos de la demande | voir ci-dessous |

`X-Quotation-Data` (JSON, UTF-8, sur une ligne — peut être replié sur
plusieurs lignes selon la RFC 2822 si l'en-tête dépasse la longueur max,
c'est le comportement standard des clients/serveurs mail) :

```json
{
  "id": "123",
  "email": "jean.dupont@example.com",
  "firstname": "Jean",
  "lastname": "Dupont",
  "phone": "0601020304",
  "is_pro": "1",
  "company": "ACME SARL",
  "siren": "123456789",
  "vat_number": "FR12345678900"
}
```

Notes pour l'intégration :
- `company`, `siren`, `vat_number` ne sont présents que si `is_pro` vaut `"1"`
  et que le champ correspondant a été renseigné.
- `id` correspond à `id_request` en base (table `tsquotationform_request`),
  utile pour recouper avec le back-office PrestaShop si besoin.
- Ces en-têtes sont sanitizées côté module (suppression des retours à la
  ligne) pour éviter toute injection ; elles peuvent contenir des caractères
  accentués (encodés RFC 2047 comme tout en-tête email standard).
- Le tiers Dolibarr doit donc être recherché/créé à partir de
  `X-Quotation-Mail` (ou du champ `email` dans `X-Quotation-Data`), pas de
  l'expéditeur du mail.