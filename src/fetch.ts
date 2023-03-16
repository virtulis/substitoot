import { remoteToLocalCache } from './remapping.js';
import { doFetch, requestsInProgress } from './requests.js';
import { StatusInfoRecord } from './types.js';

export const statusInfoCache = new Map<string, StatusInfoRecord | Promise<StatusInfoRecord>>();
export const statusInfoAwaiters = new Map<string, Array<(s: StatusInfoRecord) => void>>();

export async function getStatusRecord(hostname: string, id: string) {
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
}

export async function fetchRemoteStatusOnServer(hostname: string, uri: string) {

	const key = `${hostname}:${uri}`;
	if (remoteToLocalCache.has(key)) return await remoteToLocalCache.get(key);
	
	const search = `https://${hostname}/api/v2/search?q=${uri}&resolve=true&limit=1&type=statuses`;
	console.log('resolve', uri, search);
	
	const promise: Promise<string | null> = doFetch(search)
		.then(res => res.json())
		.then(res => {
			console.log('search res', res);
			return res.statuses?.[0]?.id || null;
		})
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
