// Firefox-specific mechanisms
// See also request-filter.ts

import { beforeRequestListener, getWebRequestFilter } from './request-filter.js';
import { getSettings } from '../settings.js';
import { reportAndNull } from '../util.js';
import { Maybe } from '../types.js';
import { historyListener, navigationListener } from './navigation.js';

let settingsOpenedOnce = false;
let contentScript: Maybe<browser.contentScripts.RegisteredContentScript>;

export async function updateFirefoxConfig() {
	
	const { webNavigation, webRequest, contentScripts, runtime } = browser;
	
	if (!webNavigation) {
		console.error('permissions broken');
		if (!settingsOpenedOnce) await runtime.openOptionsPage();
		settingsOpenedOnce = true;
		return;
	}
	
	const settings = getSettings();
	console.log(settings.useRequestFilter);
	
	webRequest.onBeforeRequest.removeListener(beforeRequestListener);
	
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
	
	if (settings.useRequestFilter) {
		const filter = getWebRequestFilter(settings);
		webRequest.onBeforeRequest.addListener(beforeRequestListener, filter, ['blocking', 'requestBody']);
	}
	
	webNavigation.onCompleted.addListener(navigationListener, {
		url: settings.instances.map(host => ({
			hostEquals: host,
			pathPrefix: '/@',
			pathContains: '/s:',
		})),
	});
	webNavigation.onHistoryStateUpdated.addListener(historyListener, {
		url: settings.instances.map(host => ({
			hostEquals: host,
			pathPrefix: '/@',
			pathContains: '/s:',
		})),
	});
	
	if (!settings.useRequestFilter) {
		contentScript = await contentScripts.register({
			js: [{ file: 'dist/content.js' }],
			matches: settings.instances.map(host => `https://${host}/*`),
			runAt: 'document_end',
		});
	}
	
}
