// Entry point for the background process of the extension

import { getSettings, initSettings } from './settings.js';
import { clearMetadata, initStorage } from './storage.js';
import { packageVersion, reportAndNull } from './util.js';

import { setUpAPIPort } from './api/impl.js';
import { asChrome } from './browsers/any.js';
import { updateChromeConfig } from './browsers/chrome.js';

async function init() {
	
	console.log('init', packageVersion);
	
	await initStorage();
	await initSettings(updateChromeConfig);
	
}

const initPromise = init().catch(reportAndNull);

asChrome.runtime.onInstalled.addListener(async () => {
	await initPromise;
	if (!getSettings().instances.length) asChrome.runtime.openOptionsPage();
	await asChrome.storage.local.set({ lastUpdated: Date.now() });
});

asChrome.runtime.onMessage.addListener(async (message) => {
	if (typeof message != 'object') return;
	const command: string = message.command;
	if (command == 'clearMetadata') {
		await clearMetadata();
	}
});

setUpAPIPort();
