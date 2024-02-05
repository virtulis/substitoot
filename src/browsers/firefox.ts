// Firefox-specific mechanisms
// See also request-filter.ts

import { getSettings } from '../settings.js';
import { reportAndNull } from '../util.js';
import { Maybe } from '../types.js';
import { historyListener, navigationListener } from './navigation.js';

let settingsOpenedOnce = false;
let contentScript: Maybe<browser.contentScripts.RegisteredContentScript>;

export async function updateFirefoxConfig() {
	
	const { webNavigation, contentScripts, runtime } = browser;
	
	if (!webNavigation) {
		console.error('permissions broken');
		if (!settingsOpenedOnce) await runtime.openOptionsPage();
		settingsOpenedOnce = true;
		return;
	}
	
	const settings = getSettings();
	
	webNavigation.onCompleted.removeListener(navigationListener);
	webNavigation.onHistoryStateUpdated.removeListener(historyListener);
	
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
		matches: settings.instances.map(host => `https://${host}/*`),
		runAt: 'document_end',
	});
	
}
