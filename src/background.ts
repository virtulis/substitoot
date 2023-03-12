import * as DOMPurify from 'dompurify';
import { BlockingResponse, doFetch, RequestDetails, requestsInProgress, rewriteApiRequest } from './requests';
import { Account, Status, StatusInfoRecord } from './types';

export const contextLists = ['ancestors', 'descendants'] as const;
export const remapIdFields = ['in_reply_to_id', 'in_reply_to_account_id'] as const;

export const statusInfoCache = new Map<string, StatusInfoRecord | Promise<StatusInfoRecord>>();
export const statusInfoAwaiters = new Map<string, Array<(s: StatusInfoRecord) => void>>();

export const remoteToLocalCache = new Map<string, string | null | Promise<string | null>>();

export const getStatusRecord = async (hostname: string, id: string) => {
	const key = `${hostname}:${id}`;
	return statusInfoCache.get(key) ?? await new Promise<StatusInfoRecord | null>(resolve => {
		
		console.log('wait for status?', key);
		
		const queue = statusInfoAwaiters.get(key);
		
		if (queue) queue.push(resolve);
		else statusInfoAwaiters.set(key, [resolve]);
		
		const url = `https://${hostname}/api/v1/statuses/${id}`;
		console.log('status at', requestsInProgress.has(url), url);
		if (!requestsInProgress.has(url)) setTimeout(() => {
			if (requestsInProgress.has(url)) return;
			console.log('trigger', url);
			fetch(url); // this will be processed by the rewriter, hopefully
		}, 20);
		
		setTimeout(() => statusInfoAwaiters.delete(key), 60_000);
		setTimeout(resolve, 1_000);
		
	});
};

export async function fetchRemoteStatusOnServer(hostname: string, uri: string) {

	const key = `${hostname}:${uri}`;
	if (remoteToLocalCache.has(key)) return await remoteToLocalCache.get(key);
	
	const search = `https://${hostname}/api/v2/search?q=${uri}&resolve=true&limit=1&type=statuses`;
	console.log('resolve', uri, search);
	
	const promise: Promise<string | null> = doFetch(search)
		.then(res => res.json())
		.then(res => res.statuses?.[0]?.id || null)
		.catch(e => {
			console.error(e);
			return null;
		});
	remoteToLocalCache.set(key, promise);
	console.log('wait');
	
	const id = await promise;
	remoteToLocalCache.set(key, id);
	console.log('what', id);
	
	return id;
	
}


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

rewriteApiRequest(['statuses', '*'], maybeFetchAndRedirect, async (json, url) => {
	
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
	
	return json;
	
});

rewriteApiRequest(['statuses', '*', 'context'], maybeFetchAndRedirect, async (json, url) => {
	
	const id = url.pathname.match(/\/statuses\/([^/]+)\/context$/)![1];
	
	const record = await getStatusRecord(url.hostname, id);
	if (!record || !record.id) return json;
	
	const hostname = record.hostname;
	if (hostname == url.hostname) return json;
	
	const srcUrl = `https://${hostname}/api/v1/statuses/${record.id}/context`;
	console.log('fetch', srcUrl);
	
	const srcData = await doFetch(srcUrl).then(res => res.json());
	
	const local = new Map<string, Status>;
	const accounts = new Map<string, Account>;
	const remapIds = new Map<string, string>;
	
	for (const list of contextLists) for (const status of json[list] as Status[]) {
		const { uri, account } = status;
		local.set(uri, status);
		if (account) accounts.set(account.url, account);
	}
	
	remapIds.set(record.id, id);
	
	for (const list of contextLists) for (const status of srcData[list] as Status[]) {
		
		const { uri, account } = status;
		
		if (local.has(uri)) {
			console.log('got status', uri);
			remapIds.set(status.id, local.get(uri)!.id);
			continue;
		}
		
		const parsed = new URL(uri);
		if (parsed.hostname == url.hostname) {
			const match = url.pathname.match(/\/statuses\/([^/]+)$/);
			const localId = match?.[1];
			console.log('local status', localId, uri);
			if (localId) remapIds.set(status.id, localId);
		}
		else {
			const origId = status.id;
			status.id = `stt:s:${parsed.hostname}:${encodeURIComponent(parsed.pathname.slice(1))}`;
			remapIds.set(origId, status.id);
		}
		
		const accKey = account?.url;
		if (accKey && accounts.has(accKey)) {
			status.account = accounts.get(accKey);
			console.log('got acct', accKey);
		}
		else if (accKey) {
			const accUrl = new URL(account.url);
			account.id = `stt:a:${accUrl.hostname}:${encodeURIComponent(accUrl.pathname.slice(1))}`;
			accounts.set(accKey, account);
			console.log('new acct', accKey);
		}
		
		status.content = DOMPurify.sanitize(status.content);
		
		console.log('new status', uri, status.id);
		json[list].push(status);
		
	}
	
	for (const list of contextLists) for (const status of json[list] as Status[]) {
		for (const key of remapIdFields) {
			const orig = status[key];
			if (orig && remapIds.has(orig)) status[key] = remapIds.get(orig);
		}
	}
	
	return json;
	
});

const handlingTabs = new Set<number>();
const getRedirFromNav = async (url: string) => {

	const { hostname, pathname } = new URL(url);
	const match = pathname.match(/\/stt:s:([^:]+):([^:]+)(.*?)$/);
	if (!match) return null;
	
	const [refHost, refPath] = [...match].slice(1);
	const ref = `https://${refHost}/${decodeURIComponent(refPath)}`;
	
	const id = await fetchRemoteStatusOnServer(hostname, ref);
	if (!id) return null;
	
	return `https://${hostname}/${pathname.split('/')[1]}/${id}`;
	
};

browser.webNavigation.onCompleted.addListener(
	async details => {
		
		const { tabId, url } = details;
		
		if (!tabId || handlingTabs.has(tabId) || !url) return;
		handlingTabs.add(tabId);
		
		console.log('tab onCompleted', tabId, url);
		
		const redir = await getRedirFromNav(url);
		if (redir) {
			console.log('redir', redir);
			await browser.tabs.update(tabId, {
				url: redir,
				loadReplace: true,
			});
		}
		
		setTimeout(() => handlingTabs.delete(tabId), 5_000);
		
	},
	{
		url: [{
			pathPrefix: '/@',
			pathContains: '/stt:s',
		}],
	}
);

browser.webNavigation.onHistoryStateUpdated.addListener(
	async details => {
		
		const { tabId, url } = details;
		
		if (!tabId || handlingTabs.has(tabId) || !url) return;
		handlingTabs.add(tabId);
		
		console.log('tab onHistoryStateUpdated', tabId, url);
		
		const redir = await getRedirFromNav(url);
		if (redir) {
			console.log('redir', redir);
			await browser.scripting.executeScript({
				target: { tabId },
				injectImmediately: true,
				args: [url, redir],
				func: ((url: string, redir: string) => {
					if (location.href == url) history.replaceState(null, '', redir);
				}) as any,
			});
		}
		
		setTimeout(() => handlingTabs.delete(tabId), 5_000);
		
	},
	{
		url: [{
			pathPrefix: '/@',
			pathContains: '/stt:s',
		}],
	}
);
