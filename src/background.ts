import { updateFirefoxEventHandlers } from './firefox.js';
import { initSettings } from './settings.js';
import { initStorage } from './storage.js';

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
