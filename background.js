// background.js (ES module)
//
// async function updateActionVisibility() {
//     const { dolibarrMainBtnDisplay = true } = await browser.storage.local.get([ "dolibarrMainBtnDisplay" ]);
//
//     if (browser.browserAction) {
//         dolibarrMainBtnDisplay == 'menu'
//             ? await browser.browserAction.enable()
//             : await browser.browserAction.disable();
//     }
//
//     if (browser.messageDisplayAction) {
//         dolibarrMainBtnDisplay == 'topbar'
//             ? await browser.messageDisplayAction.enable()
//             : await browser.messageDisplayAction.disable();
//     }
// }
//
// // Refaire les contrôles au démarrage
// browser.runtime.onStartup.addListener(() => {
//     updateActionVisibility();
// });
//
// // Refaire les contrôles à l'installation
// browser.runtime.onInstalled.addListener(() => {
//     updateActionVisibility();
// });
//
// // Refaire les contrôles si les préférences changent
// browser.storage.onChanged.addListener((changes, area) => {
//     if (area === "local" && changes.dolibarrMainBtnDisplay) {
//         updateActionVisibility();
//     }
// });
