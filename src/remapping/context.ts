// Fetching and merging of remote contexts

import { ActiveRequestMap } from '../util.js';
import {
	Account,
	AccountMapping,
	ContextResponse,
	FullMapping,
	isLocalMapping,
	Maybe,
	RemoteMapping,
	Status,
	StatusMapping,
} from '../types.js';
import { getSettings, provideSettings } from '../settings.js';
import { getStorage } from '../storage.js';
import { identifyStatus } from './statuses.js';
import { callApi } from '../instances/fetch.js';
import { fetchInstanceInfo, setInstanceInfo } from '../instances/info.js';
import { contextLists, remapIdFields } from '../ids.js';
import { findMappingActualId, shouldHaveActualId } from '../instances/compat.js';

export async function mergeContextResponses({ localHost, mapping, localResponse, remoteResponse }: {
	localHost: string;
	mapping: RemoteMapping;
	localResponse: Maybe<ContextResponse>;
	remoteResponse: ContextResponse;
}) {
	
	const tx = getStorage().transaction([
		'localStatusMapping',
		'remoteStatusMapping',
		'localAccountMapping',
		'remoteAccountMapping',
	], 'readwrite');
	const localStore = tx.objectStore('localStatusMapping');
	const remoteStore = tx.objectStore('remoteStatusMapping');
	const localAccountStore = tx.objectStore('localAccountMapping');
	const remoteAccountStore = tx.objectStore('remoteAccountMapping');
	
	const local = new Map<string, Status>;
	const accounts = new Map<string, Account>;
	const remapIds = new Map<string, string>;
	
	remapIds.set(mapping.remoteId, mapping.localId ?? `s:s:${mapping.remoteHost}:${mapping.remoteId}`);
	if (mapping.actualId) remapIds.set(mapping.actualId, mapping.localId ?? `s:s:${mapping.remoteHost}:${mapping.remoteId}`);
	
	localResponse ??= { ancestors: [], descendants: [] };

	for (const list of contextLists) for (const status of localResponse[list] as Status[]) {
		
		const { uri, account } = status;
		local.set(uri, status);
		
		const { localId, remoteHost, remoteId, remoteReference } = identifyStatus(localHost, status);
		const mapping: FullMapping<StatusMapping> = {
			
			uri: status.uri,
			
			localHost,
			localId,
			remoteHost,
			remoteId,
			
			username: status.account?.username,
			
			localReference: `${localHost}:${localId}`,
			remoteReference,
			updated: Date.now(),
			
		};
		await localStore.put(mapping);
		if (remoteHost != localHost) await remoteStore.put(mapping);
		
		if (!account) continue; // never happens
		
		const [username, host] = account.acct.split('@');
		const acctHost = host ?? localHost;
		accounts.set(`${username}@${acctHost}`, account);
		
		const acctMap: FullMapping<AccountMapping> = {
			localHost,
			localId: account.id,
			remoteHost: acctHost,
			remoteId: username,
			localReference: `${localHost}:${account.id}`,
			remoteReference: `${localHost}:${acctHost}:${username}`,
			updated: Date.now(),
		};
		localAccountStore.put({
			...await localAccountStore.get(acctMap.localReference),
			...acctMap,
		});
		remoteAccountStore.put({
			...await remoteAccountStore.get(acctMap.remoteReference),
			...acctMap,
		});
		
	}
	
	for (const list of contextLists) for (const status of remoteResponse[list] as Status[]) {
		
		const { uri, account } = status;
		const { remoteHost, remoteId, remoteReference } = identifyStatus(localHost, status);
		
		if (local.has(uri)) {
			// console.log('got status', uri);
			const it = local.get(uri)!;
			it.substitoot_fake_id = `s:s:${remoteHost}:${remoteId}`;
			remapIds.set(status.id, it.id);
			continue;
		}
		
		if (remoteHost == localHost) {
			// console.log('local status', remoteId, uri);
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
			username: account?.username,
			updated: Date.now(),
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
		
		const [username, host] = account.acct.split('@');
		const acctHost = host ?? remoteHost;
		const acct = `${username}@${acctHost}`;
		account.acct = acct;
		if (accounts.has(acct)) {
			status.account = accounts.get(acct)!;
		}
		else {
			const acctRef = `${localHost}:${acctHost}:${remoteId}`;
			const ex = await remoteAccountStore.get(acctRef);
			if (isLocalMapping(ex)) {
				account.id = ex.localId;
			}
			else {
				account.id = `s:a:${acctHost}:${username}`;
				remoteAccountStore.put({
					localHost,
					remoteHost: acctHost,
					remoteId: username,
					remoteReference: `${localHost}:${acctHost}:${username}`,
					updated: Date.now(),
				});
			}
			accounts.set(acct, account);
		}
		
		// FIXME
		// status.content = DOMPurify.sanitize(status.content);
		
		status.application = { name: 'Substitoot' };
		
		// console.log('new status', uri, status.id);
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

const contextRequests = new ActiveRequestMap<ContextResponse>({ timeout: () => getSettings().contextRequestTimeout });
let contextCacheCleared = 0;

export async function maybeClearContextCache() {
	const settings = await provideSettings();
	const now = Date.now();
	if (now - contextCacheCleared < 60_000) return;
	contextCacheCleared = now;
	const thresh = now - settings.cacheContentMins * 60_000;
	const tx = getStorage().transaction('remoteContextCache', 'readwrite');
	for await (const rec of tx.store) {
		if (rec.value.fetched > thresh) continue;
		// console.log('delete context cache', rec.key);
		await rec.delete();
	}
}

export async function fetchContext(mapping: RemoteMapping<StatusMapping>) {
	
	if (getSettings().skipInstances.includes(mapping.remoteHost)) return null;
	
	const instance = await fetchInstanceInfo(mapping.remoteHost);
	if (!instance.isCompatible || instance.canRequestContext === false) return null;
	
	if (!mapping.actualId && shouldHaveActualId(mapping)) {
		mapping = await findMappingActualId(mapping);
	}
	const actualId = mapping.actualId ?? mapping.remoteId;
	
	const url = `https://${mapping.remoteHost}/api/v1/statuses/${actualId}/context`;
	const key = `${mapping.remoteHost}:${mapping.remoteId}`;
	
	const now = Date.now();
	const ttl = getSettings().cacheContentMins * 60_000;
	const cached = await getStorage().get('remoteContextCache', key);
	if (cached && now - cached.fetched < ttl) return cached.context;
	
	return await contextRequests.perform(
		key,
		async () => {
			
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
			
		},
	).finally(maybeClearContextCache);
	
}
