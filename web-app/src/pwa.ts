import { registerSW } from "virtual:pwa-register";


// FIXME: Disabled until we figure out why it's breaking client router... (likely to do with caching)
// registerSW({
//     immediate: true,
//     onRegisteredSW(swScriptUrl) {
//         console.log("SW registered: ", swScriptUrl);
//     },
//     onOfflineReady() {
//         console.log("PWA application ready to work offline");
//     },
//     onRegisterError(error) {
//         console.error("SW registration failed: ", error);
//     },
// });
