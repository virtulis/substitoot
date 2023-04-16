// Various information about user accounts

import { Account, AccountMapping, FullMapping, isFullMapping, Mapping, Maybe, RemoteMapping } from '../types.js';
import { getSettings } from '../settings.js';
import { getStorage } from '../storage.js';
import { ActiveRequestMap, reportAndNull } from '../util.js';

import { callApi } from '../instances/fetch.js';

const accountRequests = new ActiveRequestMap<Mapping>({ timeout: () => getSettings().searchTimeout });

async function fetchAccount(known: RemoteMapping) {
	
	const { localHost, remoteHost, remoteId } = known;
	
	if (getSettings().skipInstances.includes(localHost)) return null;
	
	const ref = `${remoteId}@${remoteHost}`;
	
	const lookupRes = await callApi(`https://${localHost}/api/v1/accounts/lookup?acct=${ref}`).catch(reportAndNull);
	if (!lookupRes) return null;
	
	if (lookupRes.ok) {
		const lookupJson = await lookupRes.json() as Account;
		const mapping: FullMapping<AccountMapping> = {
			type: 'a',
			localHost,
			localId: lookupJson.id,
			remoteHost,
			remoteId,
			localReference: `${localHost}:${lookupJson.id}`,
			remoteReference: `${localHost}:${remoteHost}:${remoteId}`,
			updated: Date.now(),
		};
		await getStorage().put('localAccountMapping', mapping);
		await getStorage().put('remoteAccountMapping', mapping);
		return mapping;
	}
	
	if (getSettings().skipInstances.includes(remoteHost)) return null;
	
	const searchUrl = `https://${localHost}/api/v2/search?q=${ref}&resolve=true&limit=1&type=accounts`;
	console.log('resolve', ref, searchUrl);
	const searchRes = await callApi(searchUrl).catch(reportAndNull);
	if (!searchRes || !searchRes.ok) return null;
	
	const json = await searchRes.json();
	const account = json.accounts?.[0] as Account;
	if (!account) return null;
	
	const mapping: FullMapping<AccountMapping> = {
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
	known: RemoteMapping,
	timeout = getSettings().searchTimeout,
): Promise<Maybe<Mapping>> {
	
	const { localHost, remoteHost } = known;
	const remoteId = known.remoteId.replace(/^@/, '');
	
	const mapping = await getStorage().get(
		'remoteAccountMapping',
		`${localHost}:${remoteHost}:${remoteId}`,
	) as Maybe<RemoteMapping<Mapping>>;
	// console.log({ known, mapping });
	
	// by now we expect either a full mapping, or a remote mapping with username
	if (mapping && isFullMapping(mapping)) return mapping;
	// if (!isRemoteMapping(mapping)) return null;
	
	const key = `${known.localHost}:${known.remoteHost}:${known.remoteId}`;
	return await accountRequests.perform(key, () => fetchAccount(mapping ?? known));
	
}
