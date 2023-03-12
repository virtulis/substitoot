import * as DOMPurify from 'dompurify';
import { BlockingResponse, doFetch, RequestDetails, rewriteApiRequest } from './requests';
import {
	Account,
	contextLists,
	getStatusRecord,
	remapIdFields,
	Status,
	statusInfoAwaiters,
	statusInfoCache,
	StatusInfoRecord,
} from './resolve';

const maybeFetchAndRedirect = async (details: RequestDetails): Promise<BlockingResponse | null> => {
	
	const parsed = new URL(details.url);
	const { hostname, pathname } = parsed;
	
	const match = pathname.match(/\/statuses\/stt:s:([^/:]+):([^/:]+)(.*?)$/);
	if (!match) return null;
	
	const [refHost, refPath, etc] = [...match].slice(1);
	
	const uri = `https://${refHost}/${decodeURIComponent(refPath)}`;
	const search = `https://${hostname}/api/v2/search?q=${uri}&resolve=true&limit=1&type=statuses`;
	console.log('resolve', uri, search);
	
	const res = await doFetch(search).then(res => res.json());
	const status = res.statuses?.[0];
	console.log('got', status?.id);
	
	if (!status) return null;
	
	return {
		redirectUrl: `https://${hostname}/api/v1/statuses/${status.id}${etc}`,
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
	const key = `${url.hostname}:${id}`;
	
	const record = await getStatusRecord(key);
	if (!record || !record.id) return json;
	
	const hostname = record.hostname;
	if (hostname == url.hostname) return json;
	
	const srcUrl = `https://${hostname}/api/v1/statuses/${record.id}/context`;
	
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

browser.webNavigation.onHistoryStateUpdated.addListener(
	details => {
		console.log('H?', details.url);
	},
	{
		url: [{
			pathPrefix: '/@',
			pathContains: '/stt:s:',
		}],
	},
);
