import * as DOMPurify from 'dompurify';
import { v3 as murmurhash } from 'murmurhash';

import {
	Account,
	ContextResponse,
	isFullMapping,
	isLocalMapping,
	isRemoteMapping,
	LocalMapping,
	Mapping,
	MappingData,
	Maybe,
	RemoteMapping,
	Status,
	StatusMapping,
} from './types.js';

import { getStorage } from './storage.js';
import { reportAndNull, sleep } from './util.js';
import { getSettings } from './settings.js';
import { callApi, fetchInstanceInfo, setInstanceInfo } from './fetch.js';

export const contextLists = ['ancestors', 'descendants'] as const;
export const remapIdFields = ['in_reply_to_id', 'in_reply_to_account_id'] as const;
export const remoteToLocalCache = new Map<string, string | null | Promise<string | null>>();

export function parseId(localHost: string, id: string): Maybe<MappingData> {
	const match = id.match(/^s:(.):([^:/]+):([^:/]+)$/);
	if (!match && !id.match(/^\d+$/)) return null;
	if (!match) return {
		localHost,
		localId: id,
		remoteHost: null,
		remoteId: null,
	};
	return {
		type: match[1],
		localHost,
		localId: null,
		remoteHost: match[2],
		remoteId: decodeURIComponent(match[3]),
	};
}

export async function getLocalStatusMapping({ localHost, localId }: LocalMapping) {
	console.log('get', 'localStatusMapping', `${localHost}:${localId}`);
	return await getStorage().get('localStatusMapping', `${localHost}:${localId}`) as Maybe<LocalMapping<StatusMapping>>;
}
export async function getRemoteStatusMapping({ localHost, remoteHost, remoteId }: RemoteMapping) {
	console.log('get', 'remoteStatusMapping', `${localHost}:${remoteHost}:${remoteId}`);
	return await getStorage().get('remoteStatusMapping', `${localHost}:${remoteHost}:${remoteId}`) as Maybe<RemoteMapping<StatusMapping>>;
}
export async function getStatusMapping(mapping: MappingData): Promise<Maybe<StatusMapping>> {
	return await (isLocalMapping(mapping) ? getLocalStatusMapping(mapping) : getRemoteStatusMapping(mapping as RemoteMapping));
}

export function identifyStatus(localHost: string, status: Status) {
	const src = new URL(status.uri);
	const remoteHost = src.hostname;
	const match = src.pathname.match(/^\/users\/[^/]+\/statuses\/([^/]+)$/);
	const remoteId = match?.[1] || `m${murmurhash(status.uri)}`;
	const remoteReference = `${localHost}:${remoteHost}:${remoteId}`;
	return { remoteHost, remoteId, remoteReference };
}

export async function processStatusJSON(localHost: string, status: Status, save = true): Promise<StatusResult> {

	const localReference = `${localHost}:${status.id}`;
	
	const { remoteHost, remoteId, remoteReference } = identifyStatus(localHost, status);
	const username = status.account?.username;
	
	const mapping: StatusMapping = {
		uri: status.uri,
		localReference,
		remoteReference,
		localHost,
		localId: status.id,
		remoteHost,
		remoteId,
		username,
	};
	
	if (save) {
		// console.log('put', 'localStatusMapping', mapping);
		await getStorage().put('localStatusMapping', mapping);
		if (remoteReference) await getStorage().put('remoteStatusMapping', mapping);
	}
	
	return { mapping, status };
	
}

export async function mergeContextResponses({ localHost, mapping, localResponse, remoteResponse }: {
	localHost: string;
	mapping: RemoteMapping<StatusMapping>;
	localResponse: ContextResponse;
	remoteResponse: ContextResponse;
}) {
	
	const tx = getStorage().transaction(['localStatusMapping', 'remoteStatusMapping'], 'readwrite');
	const localStore = tx.objectStore('localStatusMapping');
	const remoteStore = tx.objectStore('remoteStatusMapping');
	
	const local = new Map<string, Status>;
	const accounts = new Map<string, Account>;
	const remapIds = new Map<string, string>;
	
	remapIds.set(mapping.remoteId, mapping.localId ?? `s:s:${mapping.remoteHost}:${mapping.remoteId}`);
	
	for (const list of contextLists) for (const status of localResponse[list] as Status[]) {
	
		const { uri, account } = status;
		local.set(uri, status);
		
		const { remoteHost, remoteId, remoteReference } = identifyStatus(localHost, status);
		const mapping: StatusMapping = {
			
			uri: status.uri,
			
			localHost,
			localId: status.id,
			remoteHost,
			remoteId,
			
			username: status.account?.username,
			
			localReference: `${localHost}:${status.id}`,
			remoteReference,
			
		};
		await localStore.put(mapping);
		if (remoteHost != localHost) await remoteStore.put(mapping);
		
		if (account) accounts.set(account.url, account);
		
	}
	
	for (const list of contextLists) for (const status of remoteResponse[list] as Status[]) {
		
		const { uri, account } = status;
		
		if (local.has(uri)) {
			// console.log('got status', uri);
			remapIds.set(status.id, local.get(uri)!.id);
			continue;
		}
		
		const { remoteHost, remoteId, remoteReference } = identifyStatus(localHost, status);
		
		if (remoteHost == localHost) {
			console.log('local status', remoteId, uri);
			remapIds.set(status.id, remoteId);
			// skip since it probably means it's deleted
			continue;
		}
		else {
			const origId = status.id;
			status.id = `s:s:${remoteHost}:${remoteId}`;
			remapIds.set(origId, status.id);
		}
		
		const common = {
			uri: status.uri,
			remoteHost,
			remoteId,
			username: status.account?.username,
		};
		const remoteLocalReference = `${remoteHost}:${remoteId}`;
		if (!await localStore.count(remoteLocalReference)) await localStore.put({
			...common,
			localHost: remoteHost,
			localId: remoteId,
			localReference: remoteLocalReference,
			remoteReference: null,
		});
		if (!await remoteStore.count(remoteReference)) await remoteStore.put({
			...common,
			localHost,
			localId: null,
			localReference: null,
			remoteReference,
		});
		
		const accKey = account?.url;
		if (accKey && accounts.has(accKey)) {
			status.account = accounts.get(accKey);
			console.log('got acct', accKey);
		}
		else if (accKey) {
			const accUrl = new URL(account.url);
			account.id = `s:a:${accUrl.hostname}:${encodeURIComponent(accUrl.pathname.slice(1))}`;
			if (account.acct && !account.acct.includes('@')) account.acct += `@${accUrl.hostname}`;
			accounts.set(accKey, account);
			console.log('new acct', accKey);
		}
		
		status.content = DOMPurify.sanitize(status.content);
		
		console.log('new status', uri, status.id);
		localResponse[list].push(status);
		
	}
	
	for (const list of contextLists) for (const status of localResponse[list] as Status[]) {
		for (const key of remapIdFields) {
			const orig = status[key];
			if (orig && remapIds.has(orig)) status[key] = remapIds.get(orig);
		}
	}
	
	return localResponse;

}

export type StatusResult = Maybe<{
	mapping: StatusMapping;
	status: Maybe<Status>;
}>;

// TODO it's probably a good idea to DRY this pattern
const activeStatusRequests = new Map<string, Promise<StatusResult>>();
const activeAccountRequests = new Map<string, Promise<Maybe<Mapping>>>();

export function getActiveStatusRequest(key: string): Maybe<Promise<StatusResult>> {
	return activeStatusRequests.get(key);
}

export function addActiveStatusRequest(
	key: string,
	promise: Promise<StatusResult>,
	timeout = getSettings().statusRequestTimeout,
) {
	// const key = `${localHost}:${localId}`;
	if (activeStatusRequests.has(key)) throw new Error(`Status request already active: ${key}`);
	const wrapped = Promise.race([promise, sleep(timeout)])
		.catch()
		.finally(() => {
			activeStatusRequests.delete(key);
		});
	activeStatusRequests.set(key, wrapped);
	return wrapped;
}

export async function fetchStatus(hostname: string, id: string) {
	const key = `${hostname}:${id}`;
	const url = `https://${hostname}/api/v1/statuses/${id}`;
	const active = getActiveStatusRequest(key);
	if (active) return await active;
	return await addActiveStatusRequest(
		key,
		callApi(url)
			.then(res => res.json())
			.then(json => processStatusJSON(hostname, json))
			.catch(reportAndNull),
	);
}

const activeContextRequests = new Map<string, Promise<Maybe<ContextResponse>>>();
let contextCacheCleared = 0;

export async function maybeClearContextCache() {
	const now = Date.now();
	if (now - contextCacheCleared < 60_000) return;
	contextCacheCleared = now;
	const thresh = now - getSettings().cacheContentMins * 60_000;
	const tx = getStorage().transaction('remoteContextCache', 'readwrite');
	for await (const rec of tx.store) {
		if (rec.value.fetched > thresh) continue;
		console.log('delete context cache', rec.key);
		await rec.delete();
	}
}

export async function fetchContext(mapping: RemoteMapping) {
	
	if (getSettings().skipInstances.includes(mapping.remoteHost)) return null;
	if (!mapping.remoteId.match(/^\d+$/)) return null; // not Mastodon
	
	const instance = await fetchInstanceInfo(mapping.remoteHost);
	if (instance.isMastodon === false || instance.canRequestContext === false) return null;
	
	const url = `https://${mapping.remoteHost}/api/v1/statuses/${mapping.remoteId}/context`;
	const key = `${mapping.remoteHost}:${mapping.remoteId}`;
	
	const now = Date.now();
	const ttl = getSettings().cacheContentMins * 60_000;
	const cached = await getStorage().get('remoteContextCache', key);
	if (cached && now - cached.fetched < ttl) return cached.context;
	
	if (activeContextRequests.has(key)) return await activeContextRequests.get(key) as ContextResponse;
	
	const promise = Promise.race([
		(async () => {
		
			console.log('fetch', url);
			
			const res = await callApi(url);
			if (res.status == 401 || res.status == 403) {
				instance.canRequestContext = false;
				await setInstanceInfo(instance);
			}
			if (!res.ok) {
				return null;
			}
			
			const json = await res.json().catch(() => null);
			if (!json || !Array.isArray(json.ancestors) || !Array.isArray(json.descendants)) return null;
			
			await getStorage().put('remoteContextCache', {
				key,
				fetched: now,
				context: json,
			});
			
			instance.canRequestContext = true;
			await setInstanceInfo(instance);
			
			return json as ContextResponse;
			
		})(),
		sleep(getSettings().contextRequestTimeout),
	]).finally(() => {
		activeContextRequests.delete(key);
		maybeClearContextCache().catch(reportAndNull);
	});
	activeContextRequests.set(key, promise);
	
	return await promise;
	
}

export async function provideMapping(known: MappingData, timeout = getSettings().searchTimeout): Promise<StatusResult> {
	
	const { localHost } = known;
	let mapping = await getStatusMapping(known);
	let status: Maybe<Status> = null;
	
	if (!isRemoteMapping(mapping) && isLocalMapping(known)) {
		const result = await fetchStatus(localHost, known.localId);
		if (result) ({ mapping, status } = result);
	}
	
	console.log({ known, mapping });
	
	// by now we expect either a full mapping, or a remote mapping with username
	if (mapping && isFullMapping(mapping)) return { mapping, status };
	if (!isRemoteMapping(mapping) || (!mapping.username && !mapping.uri)) return null;
	
	const key = `${mapping.localHost}:${mapping.remoteHost}:${mapping.remoteId}`;
	const active = getActiveStatusRequest(key);
	if (active) return await active;
	
	const uri = mapping.uri ?? `https://${mapping.remoteHost}/users/${mapping.username}/statuses/${mapping.remoteId}`;
	const search = `https://${localHost}/api/v2/search?q=${uri}&resolve=true&limit=1&type=statuses`;
	console.log('resolve', uri, search);
	
	const promise: Promise<StatusResult> = callApi(search)
		.then(async res => {
			const json = await res.json();
			console.log('search res', json);
			const status = json.statuses?.[0];
			if (!status) return null;
			return await processStatusJSON(localHost, status);
		})
		.catch(reportAndNull);
	
	return await addActiveStatusRequest(key, promise, timeout);
	
}

async function fetchAccount(known: RemoteMapping) {
	
	const { localHost, remoteHost, remoteId } = known;
	
	const lookupRes = await callApi(`https://${localHost}/api/v1/accounts/lookup?acct=${remoteId}@${remoteHost}`).catch(reportAndNull);
	if (!lookupRes) return null;
	
	if (lookupRes.ok) {
		const lookupJson = await lookupRes.json() as Account;
		const mapping: Mapping = {
			type: 'a',
			localHost,
			localId: lookupJson.id,
			remoteHost,
			remoteId,
			localReference: `${localHost}:${lookupJson.id}`,
			remoteReference: `${localHost}:${remoteHost}:${remoteId}`,
		};
		await getStorage().put('remoteAccountMapping', mapping);
		return mapping;
	}
	
	const searchRes = await callApi(`https://${localHost}/api/v2/search?q=${remoteId}@${remoteHost}&resolve=true&limit=1&type=accounts`).catch(reportAndNull);
	if (!searchRes || !searchRes.ok) return null;
	
	const json = await searchRes.json();
	const account = json.accounts?.[0] as Account;
	if (!account) return null;
	
	const mapping: Mapping = {
		type: 'a',
		localHost,
		localId: account.id,
		remoteHost,
		remoteId,
		localReference: `${localHost}:${account.id}`,
		remoteReference: `${localHost}:${remoteHost}:${remoteId}`,
	};
	await getStorage().put('remoteAccountMapping', mapping);
	return mapping;

}

export async function provideAccountMapping(known: RemoteMapping, timeout = getSettings().searchTimeout): Promise<Maybe<Mapping>> {
	
	const { localHost, remoteHost, remoteId } = known;
	const mapping = await getStorage().get('remoteAccountMapping', `${localHost}:${remoteHost}:${remoteId}`) as Maybe<RemoteMapping<Mapping>>;
	console.log({ known, mapping });
	
	// by now we expect either a full mapping, or a remote mapping with username
	if (mapping && isFullMapping(mapping)) return mapping;
	// if (!isRemoteMapping(mapping)) return null;
	
	const key = `${known.localHost}:${known.remoteHost}:${known.remoteId}`;
	const active = activeAccountRequests.get(key);
	if (active) return await active;
	
	const promise: Promise<Maybe<Mapping>> = Promise.race([
		fetchAccount(mapping ?? known),
		sleep(timeout),
	])
		.catch(reportAndNull)
		.finally(() => activeStatusRequests.delete(key));
	activeAccountRequests.set(key, promise);
	
	return await promise;
	
}

export async function getRedirFromNav(url: string) {
	
	const { hostname, pathname } = new URL(url);
	const match = pathname.match(/^(.*\/)(s:s:[^:/]+:[^:/]+)(.*?)$/);
	if (!match) return null;
	
	const [before, id, after] = [...match].slice(1);
	const { localHost, remoteHost, remoteId } = parseId(hostname, id)!;
	// console.log({ before, id, after, localHost, remoteHost, remoteId });
	if (!remoteHost || !remoteId) return null;
	
	const result = await provideMapping({ localHost, remoteHost, remoteId });
	console.log({ result });
	if (!result || !result.mapping.localId) return null;
	
	return `https://${hostname}${before}${result.mapping.localId}${after}`;
	
}
