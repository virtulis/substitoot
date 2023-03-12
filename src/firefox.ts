import {
	BlockingResponse,
	doFetch,
	JSONHandler,
	JSONRewriter,
	ownRequests,
	RequestDetails,
	requestsInProgress,
	wrapHandler,
	wrapRewriter,
} from './requests.js';
import { ContextResponse, Status, StatusInfoRecord } from './types.js';
import { fetchRemoteStatusOnServer, getStatusRecord, statusInfoAwaiters, statusInfoCache } from './fetch.js';
import { getRedirFromNav, mergeContextResponses } from './remapping.js';
import { computePermissions, getSettings } from './settings';

const handlingTabs = new Set<number>();
const maybeFetchAndRedirect = async (details: RequestDetails): Promise<BlockingResponse | null> => {
	
	const parsed = new URL(details.url);
	const { hostname, pathname } = parsed;
	
	const match = pathname.match(/\/statuses\/stt:s:([^/:]+):([^/:]+)(.*?)$/);
	if (!match) return null;
	
	const [refHost, refPath, etc] = [...match].slice(1);
	
	const id = await fetchRemoteStatusOnServer(hostname, `https://${refHost}/${decodeURIComponent(refPath)}`);
	if (!id) return null;
	
	return {
		redirectUrl: `https://${hostname}/api/v1/statuses/${id}${etc}`,
	};
	
};
const statusInfoHandler: JSONHandler = async (json, url) => {
	
	const status = json as Status;
	const key = `${url.hostname}:${status.id}`;
	
	const src = new URL(status.uri);
	const hostname = src.hostname;
	const match = src.pathname.match(/^\/users\/[^/]+\/statuses\/([^/]+)$/);
	const id = match && match[1];
	const account = status.account?.id || null;
	const record: StatusInfoRecord = { hostname, id, account };
	
	statusInfoCache.set(key, record);
	statusInfoAwaiters.get(key)?.forEach(f => f(record));
	statusInfoAwaiters.delete(key);
	
	setTimeout(() => {
		if (statusInfoCache.get(key) == record) statusInfoCache.delete(key);
	}, 60_000);
	
};
const contextRewriter: JSONRewriter = async (json, url) => {
	
	const localId = url.pathname.match(/\/statuses\/([^/]+)\/context$/)![1];
	const localResponse = json as ContextResponse;
	
	const record = await getStatusRecord(url.hostname, localId);
	if (!record || !record.id) return localResponse;
	
	const hostname = record.hostname;
	if (
		hostname == url.hostname
		|| getSettings().skip_instances.includes(hostname)
	) return localResponse;
	
	const remoteUrl = `https://${hostname}/api/v1/statuses/${record.id}/context`;
	console.log('fetch', remoteUrl);
	const res = await doFetch(remoteUrl);
	if (!res.ok) return localResponse;
	
	const remoteResponse = await res.json();
	
	return await mergeContextResponses({
		localURL: url,
		record,
		localId,
		localResponse,
		remoteResponse,
	});
	
};
const matches = [
	{
		match: ['statuses', '*'],
		check: maybeFetchAndRedirect,
		handle: statusInfoHandler,
	},
	{
		match: ['statuses', '*', 'context'],
		check: maybeFetchAndRedirect,
		rewrite: contextRewriter,
	},
];

const beforeRequestListener = async (details: RequestDetails) => {
	
	if (ownRequests.has(details.url)) {
		console.log('own req', details.url);
		return {};
	}
	
	console.log('req', details.url);
	requestsInProgress.add(details.url);
	// console.log('req', details.url);
	
	const parsed = new URL(details.url);
	const parts = parsed.pathname.split('/').slice(3);
	
	for (const { match, check, handle, rewrite } of matches) {
		
		if (parts.length != match.length || !match.every((m, i) => m == '*' || m == parts[i])) continue;
		
		const pre = await check?.(details).catch(e => {
			console.error(e);
			return {};
		});
		if (pre) return pre;
		
		if (handle) return wrapHandler(details, handle, parsed);
		if (rewrite) return wrapRewriter(details, rewrite, parsed);
		
	}
	
	return {};
	
};

const requestUrlDeleter = (details: browser.webRequest._OnCompletedDetails | browser.webRequest._OnErrorOccurredDetails) => {
	requestsInProgress.delete(details.url);
};

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
		}).catch(e => console.error(e));
		console.log('inject res', res);
	}
	
	setTimeout(() => handlingTabs.delete(tabId), 100);
	
};

let settingsOpenedOnce = false;

export async function updateFirefoxEventHandlers() {
	
	const settings = getSettings();
	
	browser.webRequest?.onBeforeRequest.removeListener(beforeRequestListener);
	browser.webRequest?.onCompleted.removeListener(requestUrlDeleter);
	browser.webRequest?.onErrorOccurred.removeListener(requestUrlDeleter);
	
	browser.webNavigation?.onCompleted.removeListener(navigationListener);
	browser.webNavigation?.onHistoryStateUpdated.removeListener(historyListener);
	
	if (!settings.instances.length) {
		console.log('no instances configured, disable');
		if (!settingsOpenedOnce) await browser.runtime.openOptionsPage();
		settingsOpenedOnce = true;
		return;
	}
	
	if (!await browser.permissions.contains(computePermissions(settings.instances))) {
		console.log('permissions broken');
		if (!settingsOpenedOnce) await browser.runtime.openOptionsPage();
		settingsOpenedOnce = true;
		return;
	}
	
	const filter: browser.webRequest.RequestFilter = {
		urls: settings.instances.flatMap(host => matches.map(
			({ match }) => `https://${host}/api/*/${match.join('/')}`,
		)),
		types: ['xmlhttprequest'],
	};
	
	browser.webRequest.onBeforeRequest.addListener(beforeRequestListener, filter, ['blocking', 'requestBody']);
	
	browser.webRequest.onCompleted.addListener(requestUrlDeleter, filter);
	browser.webRequest.onErrorOccurred.addListener(requestUrlDeleter, filter);
	
	browser.webNavigation.onCompleted.addListener(navigationListener, {
		url: settings.instances.map(host => ({
			hostEquals: host,
			pathPrefix: '/@',
			pathContains: '/stt:',
		})),
	});
	browser.webNavigation.onHistoryStateUpdated.addListener(historyListener, {
		url: settings.instances.map(host => ({
			hostEquals: host,
			pathPrefix: '/@',
			pathContains: '/stt:',
		})),
	});
	
}
