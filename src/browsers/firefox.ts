// Firefox-specific mechanisms
// See also request-filter.ts

import { getSettings } from '../settings.js';
import { reportAndNull } from '../util.js';
import { Maybe } from '../types.js';

let settingsOpenedOnce = false;
let contentScript: Maybe<browser.contentScripts.RegisteredContentScript>;

export async function updateFirefoxConfig() {
	
	const { contentScripts, runtime } = browser;
	
	const settings = getSettings();
	
	await contentScript?.unregister().catch(reportAndNull);
	contentScript = null;
	
	if (!settings.instances.length) {
		console.log('no instances configured, disable');
		if (!settingsOpenedOnce) await runtime.openOptionsPage();
		settingsOpenedOnce = true;
		return;
	}
	
	contentScript = await contentScripts.register({
		js: [{ file: 'dist/content.js' }],
		css: [{ file: 'static/ui.css' }],
		matches: settings.instances.map(host => `https://${host}/*`),
		runAt: 'document_end',
	}).catch(reportAndNull);
	
}
