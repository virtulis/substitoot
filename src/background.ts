// Entry point for the background process of the extension

import { updateFirefoxEventHandlers } from './browsers/firefox.js';
import { initSettings } from './settings.js';
import { clearCache, clearMetadata, initStorage } from './storage.js';
import { packageVersion } from './util.js';

import { maybeClearContextCache } from './remapping/context.js';

let initRun = false;
async function init() {
	if (initRun) return;
	initRun = true;
	console.log('init', packageVersion);
	await initStorage();
	await initSettings(updateFirefoxEventHandlers);
	await maybeClearContextCache();
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
