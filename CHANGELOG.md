# CHANGELOG DOLICONNECTOR

## 2.3.0

- Fix: a missing Dolibarr right (403) no longer shows the "Invalid credentials" message - only a real bad API key / HTTP Basic Auth (401) does now. The connection check now uses Dolibarr's `status` endpoint, which needs no business right at all, instead of `users/info` (which most users don't have rights on) for this purpose.
- Add a discreet warning icon next to the popup header, shown when one or more Dolibarr endpoints answered 403 for the configured API key - hovering it lists the endpoints, Dolibarr's own error message, and the exact Dolibarr right (as labelled in Dolibarr's own permissions screen) needed to fix each one.
- The current user's id (used to show the "Edit" button on your own notes) is now fetched via crmclientconnector's own `whoami` endpoint when that module is enabled/up to date, instead of `users/info` - `whoami` needs no specific Dolibarr right, unlike `users/info` which most users don't have. Falls back to `users/info`, then to not showing the "Edit" button, when `whoami` isn't available.
