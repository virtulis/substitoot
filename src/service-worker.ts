// Entry point for the background process of the extension

import { getSettings, initSettings } from './settings.js';
import { clearCache, clearMetadata, initStorage } from './storage.js';
import { packageVersion, reportAndNull } from './util.js';

import { maybeClearContextCache } from './remapping/context.js';
import { setUpAPIPort } from './api/impl.js';
import { asChrome } from './browsers/any.js';
import { updateChromeConfig } from './browsers/chrome.js';

let initRan = false;
async function init(installed: boolean) {
	
	console.log('init', packageVersion);
	
	if (!initRan) {
		initRan = true;
		await initStorage();
		await initSettings(updateChromeConfig);
		await maybeClearContextCache();
	}
	
	if (installed && !getSettings().instances.length) asChrome.runtime.openOptionsPage();
	
}

asChrome.runtime.onStartup.addListener(() => init(false));
asChrome.runtime.onInstalled.addListener(() => init(true));
init(false).catch(reportAndNull);

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
