import { beforeRequestListener, getWebRequestFilter, requestUrlDeleter } from './requests.js';
import { getRedirFromNav } from './remapping.js';
import { getSettings } from './settings.js';
import { reportAndNull } from './util.js';

const handlingTabs = new Set<number>();


const navigationListener = async (details: browser.webNavigation._OnCompletedDetails) => {
	
	const { tabId, url } = details;
	console.log('tab onCompleted', tabId, handlingTabs.has(tabId), url);
	if (!tabId || handlingTabs.has(tabId) || !url) return;
	handlingTabs.add(tabId);
	setTimeout(() => handlingTabs.delete(tabId), 2_000);
	
	const redir = await getRedirFromNav(url);
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
	
	const redir = await getRedirFromNav(url);
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

export async function updateFirefoxEventHandlers() {
	
	const { webNavigation, webRequest } = browser;
	if (!webRequest || !webNavigation) {
		console.error('permissions broken');
		if (!settingsOpenedOnce) await browser.runtime.openOptionsPage();
		settingsOpenedOnce = true;
		return;
	}
	
	const settings = getSettings();
	
	webRequest.onBeforeRequest.removeListener(beforeRequestListener);
	webRequest.onCompleted.removeListener(requestUrlDeleter);
	webRequest.onErrorOccurred.removeListener(requestUrlDeleter);
	
	webNavigation.onCompleted.removeListener(navigationListener);
	webNavigation.onHistoryStateUpdated.removeListener(historyListener);
	
	if (!settings.instances.length) {
		console.log('no instances configured, disable');
		if (!settingsOpenedOnce) await browser.runtime.openOptionsPage();
		settingsOpenedOnce = true;
		return;
	}
	
	const filter = getWebRequestFilter(settings);
	
	webRequest.onBeforeRequest.addListener(beforeRequestListener, filter, ['blocking', 'requestBody']);
	
	webRequest.onCompleted.addListener(requestUrlDeleter, filter);
	webRequest.onErrorOccurred.addListener(requestUrlDeleter, filter);
	
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
	
}
