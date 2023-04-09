// Entry point for the background process of the extension

import { initSettings } from './settings.js';
import { clearCache, clearMetadata, initStorage } from './storage.js';
import { packageVersion } from './util.js';

import { maybeClearContextCache } from './remapping/context.js';
import { setUpAPIPort } from './api/impl.js';
import { host } from './browsers/host.js';
import { updateContentScript } from './browsers/chrome.js';

async function init() {
	
	console.log('init', packageVersion);
	
	await initStorage();
	
	await initSettings(updateContentScript);
	
	await maybeClearContextCache();
	
}

host.runtime.onStartup.addListener(init);
host.runtime.onInstalled.addListener(init);

host.runtime.onMessage.addListener(async (message) => {
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
