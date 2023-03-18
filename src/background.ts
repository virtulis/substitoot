import { updateFirefoxEventHandlers } from './firefox.js';
import { initSettings } from './settings.js';
import { clearCache, clearMetadata, initStorage } from './storage.js';

let initRun = false;
async function init() {
	if (initRun) return;
	initRun = true;
	console.log('init');
	await initStorage();
	await initSettings(updateFirefoxEventHandlers);
}

browser.runtime.onStartup.addListener(init);
browser.runtime.onInstalled.addListener(init);

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
	if (typeof message != 'object') return;
	const command: string = message.command;
	if (command == 'clearCache') {
		await clearCache();
	}
	if (command == 'clearMetadata') {
		await clearMetadata();
	}
});
