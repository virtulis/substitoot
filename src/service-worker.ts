// Entry point for the background process of the extension

import { getSettings, initSettings } from './settings.js';
import { clearCache, clearMetadata, initStorage } from './storage.js';
import { packageVersion, reportAndNull } from './util.js';

import { maybeClearContextCache } from './remapping/context.js';
import { setUpAPIPort } from './api/impl.js';
import { asChrome } from './browsers/any.js';
import { updateChromeConfig } from './browsers/chrome.js';

async function init() {
	
	console.log('init', packageVersion);
	
	await initStorage();
	await initSettings(updateChromeConfig);
	await maybeClearContextCache();
	
}

const initPromise = init().catch(reportAndNull);

asChrome.runtime.onInstalled.addListener(async () => {
	await initPromise;
	if (!getSettings().instances.length) asChrome.runtime.openOptionsPage();
});

asChrome.runtime.onMessage.addListener(async (message) => {
	if (typeof message != 'object') return;
	const command: string = message.command;
	if (command == 'clearCache') {
		await clearCache();
	}
	if (command == 'clearMetadata') {
		await clearMetadata();
	}
});

setUpAPIPort();
