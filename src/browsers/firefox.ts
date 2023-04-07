// Firefox-specific mechanisms
// See also request-filter.ts

import { beforeRequestListener, getWebRequestFilter } from './request-filter.js';
import { getSettings } from '../settings.js';
import { reportAndNull } from '../util.js';
import { provideNavigationRedirect } from '../remapping/navigation.js';
import { Maybe } from '../types.js';

const handlingTabs = new Set<number>();

const navigationListener = async (details: browser.webNavigation._OnCompletedDetails) => {
	
	const { tabId, url } = details;
	console.log('tab onCompleted', tabId, handlingTabs.has(tabId), url);
	if (!tabId || handlingTabs.has(tabId) || !url) return;
	handlingTabs.add(tabId);
	setTimeout(() => handlingTabs.delete(tabId), 2_000);
	
	const redir = await provideNavigationRedirect(url);
	console.log('redir', redir);
	if (redir) {
		await browser.tabs.update(tabId, {
			url: redir,
			loadReplace: true,
		});
	}
	
	setTimeout(() => handlingTabs.delete(tabId), 100);
	
};

const historyListener = async (details: browser.webNavigation._OnHistoryStateUpdatedDetails) => {
	
	const { tabId, url } = details;
	console.log('tab onHistoryStateUpdated', tabId, handlingTabs.has(tabId), url);
	if (!tabId || handlingTabs.has(tabId) || !url) return;
	handlingTabs.add(tabId);
	setTimeout(() => handlingTabs.delete(tabId), 2_000);
	
	const redir = await provideNavigationRedirect(url);
	console.log('redir', redir);
	if (redir) {
		const res = await browser.scripting.executeScript({
			target: { tabId },
			args: [url, redir],
			func: ((url: string, redir: string) => {
				if (location.href == url) history.replaceState(null, '', redir);
			}) as any,
		}).catch(reportAndNull);
		console.log('inject res', res);
	}
	
	setTimeout(() => handlingTabs.delete(tabId), 100);
	
};

let settingsOpenedOnce = false;
let contentScript: Maybe<browser.contentScripts.RegisteredContentScript>;

export async function updateFirefoxEventHandlers() {
	
	const { webNavigation, webRequest, contentScripts, runtime } = browser;
	
	if (!webRequest || !webNavigation) {
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
