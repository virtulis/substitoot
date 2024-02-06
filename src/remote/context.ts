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
	
	const fetchMasto = (base: string) => remoteRequests.perform(
		base,
		async () => {
			
			console.log('fetch', base);
			const status: Maybe<Status> = await callApi(base).then(checkResponse);
			if (!status) return null;
			
			const ctxUrl = `${base}/context`;
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
	
	// Mastodon or compatible
	const masto = url.pathname.match(/^\/users\/(.*?)\/statuses\/(.*?)\/?$/);
	if (instance.isCompatible && masto) {
		return await fetchMasto(`https://${url.hostname}/api/v1/statuses/${masto[2]}`);
	}
	
	// Akkoma
	if (instance.isCompatible && url.pathname.match(/^\/objects\/.*/)) {
		const redir = await callApi(uri, {});
		const loc = redir.url;
		const akko = loc && new URL(loc).pathname.match(/^\/notice\/([^/]+)$/);
		console.log('akko?', akko, loc, redir);
		if (akko) return await fetchMasto(`https://${url.hostname}/api/v1/statuses/${akko[1]}`);
	}
	
	// Misskey
	const miss = url.pathname.match(/^\/notes\/([^/]+)/);
	if (instance.isCompatible && miss) {
		return await fetchMasto(`https://${url.hostname}/api/v1/statuses/${miss[1]}`);
	}
	
	return null;
	
}
