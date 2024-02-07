// Entry point for the background process of the extension

import { getSettings, initSettings } from './settings.js';
import { clearMetadata, initStorage } from './storage.js';
import { intVersion, packageVersion, reportAndNull } from './util.js';

import { setUpAPIPort } from './api/impl.js';
import { anyBrowser, asChrome } from './browsers/any.js';
import { updateChromeConfig } from './browsers/chrome.js';
import { displayNotice, lastNoticeVersion } from './notice.js';

async function init() {
	
	console.log('init', packageVersion);
	
	await initStorage();
	await initSettings(updateChromeConfig);
	
}

const initPromise = init().catch(reportAndNull);

asChrome.runtime.onInstalled.addListener(async () => {
	
	await initPromise;
	await asChrome.storage.local.set({ lastUpdated: Date.now() });
	
	const lastVersion = await anyBrowser.storage.local.get('lastVersion').then(r => r.lastVersion);
	const settings = getSettings();
	if (settings.instances.length && (!lastVersion || Number(lastVersion) < lastNoticeVersion)) displayNotice().catch(reportAndNull);
	await asChrome.storage.local.set({ lastVersion: intVersion });
	
});

asChrome.runtime.onMessage.addListener(async (message) => {
	if (typeof message != 'object') return;
	const command: string = message.command;
	if (command == 'clearMetadata') {
		await clearMetadata();
	}
});

asChrome.action.onClicked.addListener(() => asChrome.runtime.openOptionsPage());

setUpAPIPort();
