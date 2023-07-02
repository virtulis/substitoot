// Various information about user accounts

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
} from '../types.js';
import { getSettings } from '../settings.js';
import { getStorage } from '../storage.js';
import { ActiveRequestMap, reportAndNull } from '../util.js';

import { callApi } from '../instances/fetch.js';
import { fetchInstanceInfo } from '../instances/info.js';

const accountRequests = new ActiveRequestMap<AccountMapping>({ timeout: () => getSettings().searchTimeout });

async function fetchAccount(known: MappingData) {
	
	const { localHost } = known;
	
	if (getSettings().skipInstances.includes(localHost)) return null;
	
	let lookupRes;
	const ref = isRemoteMapping(known) ? `${known.remoteId}@${known.remoteHost}` : null;
	if (isLocalMapping(known)) {
		lookupRes = await callApi(`https://${localHost}/api/v1/accounts/${known.localId}`).catch(reportAndNull);
	}
	else if (ref) {
		lookupRes = await callApi(`https://${localHost}/api/v1/accounts/lookup?acct=${ref}`).catch(reportAndNull);
	}
	if (!lookupRes) return null;
	
	let account: Maybe<Account>;
	if (lookupRes.ok) {
		account = await lookupRes.json();
	}
	else {
		if (!ref || !isRemoteMapping(known) || getSettings().skipInstances.includes(known.remoteHost)) return null;
		const searchUrl = `https://${localHost}/api/v2/search?q=${ref}&resolve=true&limit=1&type=accounts`;
		console.log('resolve', ref, searchUrl);
		const searchRes = await callApi(searchUrl).catch(reportAndNull);
		if (!searchRes || !searchRes.ok) return null;
		const json = await searchRes.json();
		account = json.accounts?.[0];
	}
	
	if (!account) return null;
	
	const remoteHost = known.remoteHost ?? new URL(account.url).hostname;
	const remoteId = known.remoteId ?? account.username!;
	
	const mapping = {
		uri: account.url,
		type: 'a',
		localHost,
		localId: account.id,
		remoteHost,
		remoteId,
		localReference: `${localHost}:${account.id}`,
		remoteReference: `${localHost}:${remoteHost}:${remoteId}`,
		updated: Date.now(),
	};
	
	await getStorage().put('localAccountMapping', mapping);
	await getStorage().put('remoteAccountMapping', mapping);
	return mapping;
	
}

export async function provideAccountMapping(
	known: MappingData,
	timeout = getSettings().searchTimeout,
): Promise<Maybe<AccountMapping>> {
	
	const { localHost, remoteHost, localId } = known;
	
	let remoteId;
	let mapping: Maybe<AccountMapping>;
	if (isRemoteMapping(known)) {
		remoteId = known.remoteId.replace(/^@/, '');
		mapping = await getStorage().get(
			'remoteAccountMapping',
			`${localHost}:${remoteHost}:${remoteId}`,
		) as Maybe<RemoteMapping<AccountMapping>>;
	}
	if (!mapping && isLocalMapping(known)) {
		mapping = await getStorage().get(
			'localAccountMapping',
			`${localHost}:${localId}`,
		) as Maybe<LocalMapping<AccountMapping>>;
		if (!mapping) mapping = await fetchAccount(known);
	}
	console.log({ known, mapping });
	
	// by now we expect either a full mapping, or a remote mapping with username
	if (mapping && isFullMapping(mapping)) return mapping;
	// if (!isRemoteMapping(mapping)) return null;
	
	const key = `${known.localHost}:${known.remoteHost}:${known.remoteId}`;
	return await accountRequests.perform(key, () => fetchAccount(mapping ?? known));
	
}

export async function findAccountActualId(mapping: RemoteMapping<AccountMapping>) {
	const { remoteHost, remoteId } = mapping;
	return await accountRequests.perform(
		`${remoteHost}:${remoteId}`,
		async () => {
		
			const lookupRes = await callApi(`https://${remoteHost}/api/v1/accounts/lookup?acct=${remoteId}`).catch(reportAndNull);
			if (!lookupRes?.ok) return mapping;
			
			const account: Account = await lookupRes.json();
			if (!account.id) return mapping;
			
			mapping.actualId = account.id;
			if (isLocalMapping(mapping)) await getStorage().put('localAccountMapping', mapping);
			await getStorage().put('remoteAccountMapping', mapping);
			return mapping;
		}
		
	);
}

const statusRequests = new ActiveRequestMap<Status[]>({ timeout: () => getSettings().statusRequestTimeout });

export async function fetchAccountStatuses(mapping: RemoteMapping<AccountMapping>, query: string) {
	
	const { remoteHost } = mapping;
	if (getSettings().skipInstances.includes(remoteHost)) return null;
	
	const instance = await fetchInstanceInfo(remoteHost);
	if (!instance.isCompatible) return null;
	
	if (!mapping.actualId) mapping = (await findAccountActualId(mapping)) as FullMapping<AccountMapping> ?? mapping;
	if (!mapping.actualId) return null;
	
	return await statusRequests.perform(
		`${remoteHost}:${mapping.actualId}:${query}`,
		async () => {
			const res = await callApi(`https://${remoteHost}/api/v1/accounts/${mapping.actualId}/statuses?${query}`).catch(
				reportAndNull
			);
			if (!res?.ok) return null;
			return await res.json() as Status[];
		}
	);
	
}
