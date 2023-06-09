import { provideNavigationRedirect } from '../remapping/navigation.js';
import { maybeFirefox } from './any.js';
import { reportAndNull } from '../util.js';

const handlingTabs = new Set<number>();
export const navigationListener = async (details: browser.webNavigation._OnCompletedDetails | chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
	
	const { tabId, url } = details;
	console.log('tab onCompleted', tabId, handlingTabs.has(tabId), url);
	if (!tabId || handlingTabs.has(tabId) || !url) return;
	handlingTabs.add(tabId);
	setTimeout(() => handlingTabs.delete(tabId), 2_000);
	
	const redir = await provideNavigationRedirect(url);
	console.log('redir', redir);
	if (redir) {
		if (maybeFirefox) await browser.tabs.update(tabId, {
			url: redir,
			loadReplace: true,
		});
	}
	
	setTimeout(() => handlingTabs.delete(tabId), 100);
	
};
export const historyListener = async (details: browser.webNavigation._OnHistoryStateUpdatedDetails | chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
	
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
