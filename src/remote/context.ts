// Fetching and merging of remote contexts

import { ActiveRequestMap, pick } from '../util.js';
import { ContextResponse, countsKeys, Maybe, RemoteStatusResponse, Status } from '../types.js';
import { getSettings } from '../settings.js';
import { callApi } from '../instances/fetch.js';
import { fetchInstanceInfo, setInstanceInfo } from '../instances/info.js';

const remoteRequests = new ActiveRequestMap<RemoteStatusResponse>({ timeout: () => getSettings().contextRequestTimeout });

export async function fetchRemoteStatusAndContext(uri: string) {

	const url = new URL(uri);
	
	if (getSettings().skipInstances.includes(url.hostname)) return null;
	
	const instance = await fetchInstanceInfo(url.hostname);
	if (!instance.isCompatible || instance.canRequestContext === false) return null;
	
	const checkResponse = async (res: Response) => {
		console.log('res', res.status);
		if (res.status == 401 || res.status == 403) {
			instance.lastErrorCode = res.status;
			instance.canRequestContext = false;
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
	const masto = url.pathname.match(/^\/users\/(.*?)\/statuses\/(.*?)\/?$/);
	if (instance.isCompatible && masto) {
		const remId = masto[2];
		const stUri = `https://${url.hostname}/api/v1/statuses/${remId}`;
		return await remoteRequests.perform(
			stUri,
			async () => {
				
				console.log('fetch', stUri);
				const status: Maybe<Status> = await callApi(stUri).then(checkResponse);
				if (!status) return null;
				
				const ctxUrl = `${stUri}/context`;
				console.log('fetch', ctxUrl);
				
				const context: Maybe<ContextResponse> = await callApi(ctxUrl).then(checkResponse);
				instance.canRequestContext = !!context;
				await setInstanceInfo(instance);
				
				return <RemoteStatusResponse> {
					status,
					context,
					counts: pick(status, countsKeys),
				};
				
			},
		);
	}
	
	return null;
	
}
