# CHANGELOG DOLICONNECTOR

## 2.5.1

- Fix: supplier proposals rows in the popup's Documents tab now have a "Ref Fournisseur" column like supplier orders, so their cells no longer shift out of line with the other document types' columns. The supplier orders column header now also reads "Ref Fournisseur" instead of "Ref Client".

## 2.5.0

- Add support for supplier proposals (devis fournisseur, Dolibarr's `supplier_proposal` module) : linked-documents list, recent-documents list in the popup's Documents tab, "Lier" tab search, tags, trackid/ref auto-detection in mail text, and status badges - same as every other document type already supported.
- The detected-ref card (shown when a Dolibarr reference is found in a mail) now shares the same card template and the same single "Lier" button as the "Lier" tab's other document cards, instead of its own duplicated markup and its own "Voir la fiche" + "Lier" button pair.
- Fix: supplier proposals are now fetched from Dolibarr's `supplierproposals` REST endpoint instead of `supplier_proposals`, which Dolibarr's API router doesn't serve (18 to 24).
- Fix: a Dolibarr trackid sent by a correspondent's own Dolibarr no longer shows one of our documents that happens to have the same id. The trackid's instance id (the part after the `@`, also when `MAIL_PREFIX_FOR_EMAIL_ID` is set) is now checked against the instances known for the mail account's connection : another instance's trackid is ignored, in the popup and in the mail banner.
- Our own instance is learned automatically from a mail carrying a trackid sent with one of the receiving account's identities (e.g. Dolibarr's auto copy), or by answering "Is it your Dolibarr ?" in the popup. Both lists (mine / correspondents' to ignore) can be edited in each connection's settings.
- While the instance is still unknown, a trackid is only kept if its document exists in our Dolibarr and belongs to the sender's thirdparty (when the sender's email is known there).

## 2.4.0

- Add a status badge (draft/validated/signed/cancelled...) next to each document in the linked-documents list of the banner injected in the mail body, when available for that document type - same colors/labels as the popup's own document cards.

## 2.3.0

- Fix: a missing Dolibarr right (403) no longer shows the "Invalid credentials" message - only a real bad API key / HTTP Basic Auth (401) does now. The connection check now uses Dolibarr's `status` endpoint, which needs no business right at all, instead of `users/info` (which most users don't have rights on) for this purpose.
- Add a discreet warning icon next to the popup header, shown when one or more Dolibarr endpoints answered 403 for the configured API key - hovering it lists the endpoints, Dolibarr's own error message, and the exact Dolibarr right (as labelled in Dolibarr's own permissions screen) needed to fix each one.
- The current user's id (used to show the "Edit" button on your own notes) is now fetched via crmclientconnector's own `whoami` endpoint when that module is enabled/up to date, instead of `users/info` - `whoami` needs no specific Dolibarr right, unlike `users/info` which most users don't have. Falls back to `users/info`, then to not showing the "Edit" button, when `whoami` isn't available.
