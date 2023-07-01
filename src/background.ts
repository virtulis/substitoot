// Entry point for the background process of the extension

import { updateFirefoxConfig } from './browsers/firefox.js';
import { initSettings } from './settings.js';
import { clearCache, clearMetadata, initStorage } from './storage.js';
import { packageVersion } from './util.js';

import { maybeClearContextCache } from './remapping/context.js';
import { setUpAPIPort } from './api/impl.js';
import { asFirefox } from './browsers/any.js';

let initRun = false;
async function init() {

	if (initRun) return;
	initRun = true;
	
	console.log('init', packageVersion);
	
	await initStorage();
	setUpAPIPort();
	
	await initSettings(updateFirefoxConfig);
	
	await maybeClearContextCache();
	
}

asFirefox.runtime.onStartup.addListener(init);
asFirefox.runtime.onInstalled.addListener(init);
asFirefox.runtime.onInstalled.addListener(() => {
	asFirefox.storage.local.set({ lastUpdated: Date.now() });
});

asFirefox.runtime.onMessage.addListener(async (message) => {
	if (typeof message != 'object') return;
	const command: string = message.command;
	if (command == 'clearCache') {
		await clearCache();
	}
	if (command == 'clearMetadata') {
		await clearMetadata();
	}
});
