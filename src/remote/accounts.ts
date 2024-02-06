// Various information about user accounts

import { Account, Maybe, Status } from '../types.js';
import { getSettings } from '../settings.js';
import { ActiveRequestMap } from '../util.js';

import { callApi } from '../instances/fetch.js';
import { fetchInstanceInfo, setInstanceInfo } from '../instances/info.js';

const statusesRequests = new ActiveRequestMap<Status[]>({ timeout: () => getSettings().statusRequestTimeout });

export async function fetchRemoteAccountStatuses(acct: string, uri: string, query: string) {
	
	console.log('fetchRemoteAccountStatuses', acct, uri, query);
	
	const url = new URL(uri);
	if (getSettings().skipInstances.includes(url.hostname)) return null;
	
	const instance = await fetchInstanceInfo(url.hostname);
	if (!instance.isCompatible || instance.canRequestContext === false) return null;
	
	const checkResponse = async (res: Response) => {
		console.log('res', res.status);
		if (res.status == 401 || res.status == 403) {
			instance.lastErrorCode = res.status;
			instance.canRequestUser = false;
			instance.lastRequestSucceeded = false;
			await setInstanceInfo(instance);
		}
		if (!res.ok) {
			instance.lastRequestSucceeded = false;
			await setInstanceInfo(instance);
			return null;
		}
		return res.json().catch(async e => {
			console.error(e);
			instance.lastRequestSucceeded = false;
			await setInstanceInfo(instance);
			return null;
		});
	};
	
	// Mastodon or compatible
	const masto = url.pathname.match(/^\/users\/([^/]+?)\/?$/);
	console.log({ masto });
	if (instance.isCompatible && masto) return await statusesRequests.perform(`${acct}:${query}`, async () => {
		
		const account: Maybe<Account> = await callApi(`https://${url.hostname}/api/v1/accounts/lookup?acct=${acct}`).then(checkResponse);
		if (!account) return null;
		
		const statuses: Maybe<Status[]> = await callApi(`https://${url.hostname}/api/v1/accounts/${account.id}/statuses?${query}`).then(checkResponse);
		
		instance.canRequestUser = !!statuses;
		await setInstanceInfo(instance);
		
		return statuses;
		
	});
	
	return null;
	
}
