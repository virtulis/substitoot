import { updateFirefoxEventHandlers } from './firefox.js';
import { initSettings } from './settings.js';
import { initStorage } from './storage.js';

async function init() {
	await initStorage();
	await initSettings(updateFirefoxEventHandlers);
}

init().catch(e => console.error(e));
