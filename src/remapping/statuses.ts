// Status (a.k.a. post) metadata storage and resolving

import {
	Account,
	AccountMapping,
	FullMapping,
	isFullMapping,
	isLocalMapping,
	isRemoteMapping,
	LocalMapping,
	MappingData,
	Maybe,
	RemoteMapping,
	Status,
	StatusCounts,
	StatusMapping,
} from '../types.js';
import { getStorage } from '../storage.js';
import { v3 as murmurhash } from 'murmurhash';
import { ActiveRequestMap, isSome, maybe, pick, reportAndNull } from '../util.js';
import { getSettings } from '../settings.js';
import { callApi } from '../instances/fetch.js';
import { findStatusActualId, shouldHaveActualId } from '../instances/compat.js';
import { remapIdFields } from '../ids.js';

export async function getLocalStatusMapping({ localHost, localId }: LocalMapping) {
	// console.log('get', 'localStatusMapping', `${localHost}:${localId}`);
	return await getStorage().get(
		'localStatusMapping',
		`${localHost}:${localId}`,
	) as Maybe<LocalMapping<StatusMapping>>;
}

export async function getRemoteStatusMapping({ localHost, remoteHost, remoteId }: RemoteMapping) {
	// console.log('get', 'remoteStatusMapping', `${localHost}:${remoteHost}:${remoteId}`);
	return await getStorage().get(
		'remoteStatusMapping',
		`${localHost}:${remoteHost}:${remoteId}`,
	) as Maybe<RemoteMapping<StatusMapping>>;
}

export async function getStatusMapping(mapping: MappingData): Promise<Maybe<StatusMapping>> {
	return await (isLocalMapping(mapping)
		? getLocalStatusMapping(mapping)
		: getRemoteStatusMapping(mapping as RemoteMapping));
}

export function identifyStatus(localHost: string, status: Status) {
	const localId = status.id;
	const src = new URL(status.uri);
	const remoteHost = src.hostname;
	const match = src.pathname.match(/^\/users\/[^/]+\/statuses\/([^/]+)(\/|$)/);
	const remoteId = match?.[1] || `m${murmurhash(status.uri)}`;
	const remoteReference = `${localHost}:${remoteHost}:${remoteId}`;
	return { localId, remoteHost, remoteId, remoteReference };
}

export async function processStatusJSON(localHost: string, json: Status, save = true): Promise<StatusResult> {
	
	const process = async (status: Status, reblog?: Maybe<StatusMapping>) => {
		
		const localReference = `${localHost}:${status.id}`;
		
		const { remoteHost, remoteId, remoteReference } = identifyStatus(localHost, status);
		const username = status.account?.username;
		
		const mapping: LocalMapping<StatusMapping> = {
			uri: status.uri,
			localReference,
			remoteReference,
			localHost,
			localId: status.id,
			remoteHost,
			remoteId,
			username,
			updated: Date.now(),
			reblog,
		};
		
		if (save) {
			// console.log('put', 'localStatusMapping', mapping);
			await getStorage().put('localStatusMapping', mapping);
			if (isRemoteMapping(mapping)) await getStorage().put('remoteStatusMapping', mapping);
		}
		
		const counts: Maybe<StatusCounts> = localHost == remoteHost ? {
			...pick(status, ['replies_count', 'reblogs_count', 'favourites_count']),
			localReference,
			updated: Date.now(),
		} : null;
		if (counts) await getStorage().put('localStatusCounts', counts);
		
		return { mapping, status, counts };
		
	};
	
	const reblog = await maybe(json.reblog, process);
	const info = await process(json, reblog?.mapping);
	
	return { ...info, reblog };
	
}

export type StatusResult = Maybe<{
	mapping: StatusMapping;
	status?: Maybe<Status>;
	counts?: Maybe<StatusCounts>;
	reblog?: Maybe<StatusResult>;
}>;
export const statusRequests = new ActiveRequestMap<StatusResult>({ timeout: () => getSettings().statusRequestTimeout });

export async function fetchStatus(hostname: string, id: string) {
	const key = `${hostname}:${id}`;
	const url = `https://${hostname}/api/v1/statuses/${id}`;
	return await statusRequests.perform(
		key,
		() => callApi(url)
			.then(res => res.json())
			.then(json => processStatusJSON(hostname, json))
			.catch(reportAndNull),
	);
}

export async function fetchStatusCounts(mapping: RemoteMapping<StatusMapping>) {
	
	if (!mapping.actualId && shouldHaveActualId(mapping)) {
		mapping = await findStatusActualId(mapping);
	}
	const actualId = mapping.actualId ?? mapping.remoteId;

	const localReference = `${mapping.remoteHost}:${mapping.actualId}`;

	const counts = await getStorage().get('localStatusCounts', localReference);
	if (counts && Date.now() - counts.updated < 600_000) return counts;
	
	const res = await fetchStatus(mapping.remoteHost, actualId);
	if (!res?.counts) await getStorage().put('localStatusCounts', {
		localReference,
		updated: Date.now(),
	});
	
	return res?.counts;
	
}

export async function provideStatusMapping(known: MappingData, timeout = getSettings().searchTimeout): Promise<Maybe<StatusResult>> {
	
	const { localHost } = known;
	const existing = await getStatusMapping(known);
	if (isFullMapping(existing)) {
		return {
			mapping: existing,
			status: null,
			reblog: maybe(existing?.reblog, mapping => ({ mapping })),
		};
	}
	
	if (isLocalMapping(known)) {
		const result = await fetchStatus(localHost, known.localId);
		if (result) return result;
	}
	
	const mapping = (existing ?? known) as StatusMapping;
	if (!isRemoteMapping(mapping) || (!mapping.username && !mapping.uri)) return null;
	if (getSettings().skipInstances.includes(mapping.remoteHost)) return null;
	
	const key = `${known.localHost}:${known.remoteHost}:${known.remoteId}`;
	
	return await statusRequests.perform(key, async () => {
		
		const uri = mapping.uri ?? `https://${mapping.remoteHost}/users/${mapping.username}/statuses/${mapping.remoteId}`;
		const search = `https://${localHost}/api/v2/search?q=${uri}&resolve=true&limit=1&type=statuses`;
		console.log('resolve', uri, search);
		
		const res = await callApi(search);
		const json = await res.json();
		
		const status = json.statuses?.[0];
		if (!status) return null;
		return await processStatusJSON(localHost, status);
		
	}, timeout);
	
}

export async function mergeStatusLists({ localHost, sourceHost, localStatuses, remoteStatuses }: {
	localHost: string;
	sourceHost: string;
	localStatuses: Maybe<Status[]>;
	remoteStatuses: Status[];
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
	localStatuses ||= [];
	for (const rec of localStatuses) for (const status of [rec, rec.reblog].filter(isSome)) {
		
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
		await localStore.put({
			...await localStore.get(mapping.localReference),
			...mapping,
		});
		if (remoteHost != localHost) await remoteStore.put({
			...await remoteStore.get(mapping.remoteReference),
			...mapping,
		});
		
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
	
	for (const rec of remoteStatuses) for (const status of [rec, rec.reblog].filter(isSome)) {
		
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
		const acctHost = host ?? sourceHost;
		const acct = `${username}@${acctHost}`;
		account.acct = acct;
		if (accounts.has(acct)) {
			status.account = accounts.get(acct)!;
		}
		else {
			const acctRef = `${localHost}:${acctHost}:${username}`;
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
		
		status.application = { name: 'Substitoot' };
		
		// console.log('new status', uri, status.id);
		if (rec == status) localStatuses.push(status);
		
	}
	
	for (const rec of localStatuses) for (const status of [rec, rec.reblog].filter(isSome)) {
		for (const key of remapIdFields) {
			const orig = status[key];
			if (orig && remapIds.has(orig)) status[key] = remapIds.get(orig);
		}
	}
	
	localStatuses.sort((a, b) => b.created_at?.localeCompare(a.created_at ?? '') || 0);
	
	return localStatuses;
	
}
