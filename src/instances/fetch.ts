// Wrapper to make an HTTP request to remote instances

import { InstanceInfo, Maybe } from '../types.js';
import { fetchInstanceInfo } from './info.js';

export const ownRequests = new Set<string>();

export async function callApi(
	url: string,
	{ instance, updateInstance }: {
		instance?: InstanceInfo;
		updateInstance?: Maybe<boolean>;
	} = {},
	init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> },
) {
	
	ownRequests.add(url);
	
	if (!instance && updateInstance !== false) instance = await fetchInstanceInfo(new URL(url).hostname);
	
	init ??= {};
	init.headers ??= {};
	
	// TODO this breaks CORS with some Pleroma instances when there is no blanket host permission (which we don't want)
	// init.headers['User-Agent'] = `Substitoot/${packageVersion} (https://substitoot.kludge.guru) ${navigator.userAgent}`;
	
	init.credentials = 'omit';
	
	let promise = fetch(url, init);
	if (instance && updateInstance !== false) {
		promise = promise
			.then(res => {
				console.log(res.headers);
				if (!instance) return res;
				instance.lastRequestSucceeded = res.ok;
				if (!res.ok) instance.lastErrorCode = res.status;
				return res;
			})
			.catch(e => {
				instance!.lastErrorCode = 603;
				throw e;
			});
	}
	
	return promise.finally(() => ownRequests.delete(url));
	
}
