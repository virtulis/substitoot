// Entry point for the background process of the extension

import { updateFirefoxConfig } from './browsers/firefox.js';
import { getSettings, initSettings } from './settings.js';
import { clearMetadata, initStorage } from './storage.js';
import { intVersion, packageVersion, reportAndNull } from './util.js';
import { setUpAPIPort } from './api/impl.js';
import { anyBrowser, asFirefox } from './browsers/any.js';
import { displayNotice, lastNoticeVersion } from './notice.js';

let initRun = false;
async function init() {

	if (initRun) return;
	initRun = true;
	
	console.log('init', packageVersion, intVersion);
	
	await initStorage();
	setUpAPIPort();
	
	await initSettings(updateFirefoxConfig);
	
}

asFirefox.runtime.onStartup.addListener(init);
asFirefox.runtime.onInstalled.addListener(async () => {
	await asFirefox.storage.local.set({ lastUpdated: Date.now() });
	await init();
	const lastVersion = await anyBrowser.storage.local.get('lastVersion').then(r => r.lastVersion);
	console.log('lastVersion', lastVersion);
	const settings = getSettings();
	if (settings.instances.length && (!lastVersion || Number(lastVersion) < lastNoticeVersion)) displayNotice().catch(reportAndNull);
	await asFirefox.storage.local.set({ lastVersion: intVersion });
});

asFirefox.runtime.onMessage.addListener(async (message) => {
	if (typeof message != 'object') return;
	const command: string = message.command;
	if (command == 'clearMetadata') {
		await clearMetadata();
	}
});
