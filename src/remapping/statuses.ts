// Status (a.k.a. post) metadata storage and resolving

import {
	isFullMapping,
	isLocalMapping,
	isRemoteMapping,
	LocalMapping,
	MappingData,
	Maybe,
	RemoteMapping,
	Status,
	StatusMapping,
} from '../types.js';
import { getStorage } from '../storage.js';
import { v3 as murmurhash } from 'murmurhash';
import { ActiveRequestMap, reportAndNull } from '../util.js';
import { getSettings } from '../settings.js';
import { callApi } from '../instances/fetch.js';

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
	};
	
	if (save) {
		// console.log('put', 'localStatusMapping', mapping);
		await getStorage().put('localStatusMapping', mapping);
		if (isRemoteMapping(mapping)) await getStorage().put('remoteStatusMapping', mapping);
	}
	
	return { mapping, status };
	
}

export type StatusResult = Maybe<{
	mapping: StatusMapping;
	status: Maybe<Status>;
}>;
export const statusRequests = new ActiveRequestMap<StatusResult>({ timeout: getSettings().statusRequestTimeout });

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

export async function provideStatusMapping(known: MappingData, timeout = getSettings().searchTimeout): Promise<Maybe<StatusResult>> {
	
	const { localHost } = known;
	const existing = await getStatusMapping(known);
	if (isFullMapping(existing)) return { mapping: existing, status: null };
	
	// this is not supposed to happen unless was cache cleared during use
	if (isLocalMapping(known)) {
		const result = await fetchStatus(localHost, known.localId);
		if (result) return result;
	}
	
	const mapping = (existing ?? known) as StatusMapping;
	if (!isRemoteMapping(mapping) || (!mapping.username && !mapping.uri)) return null;
	
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
