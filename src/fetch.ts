import { packageVersion, reportAndNull, sleep } from './util.js';
import { InstanceInfo, Maybe } from './types.js';
import { getStorage } from './storage.js';

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
	init.headers['User-Agent'] = `Substitoot/${packageVersion} (https://substitoot.kludge.guru) ${navigator.userAgent}`;
	
	let promise = fetch(url, init);
	if (instance && updateInstance !== false) {
		promise = promise
			.then(res => {
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

export async function setInstanceInfo(instance: InstanceInfo) {
	console.log('instance', instance);
	await getStorage().put('instances', instance);
}

const activeInstanceRequests = new Map<string, Promise<InstanceInfo>>;
export async function fetchInstanceInfo(host: string, force = false): Promise<InstanceInfo> {
	
	const active = await activeInstanceRequests.get(host);
	if (active) return await active;
	
	const instance: InstanceInfo = (await getStorage().get('instances', host)) ?? { host };
	if (!force && instance?.checked && Date.now() - instance.checked < 24 * 3600_000) return instance;
	
	const promise = doFetchInstanceInfo(instance).finally(() => activeInstanceRequests.delete(host));
	activeInstanceRequests.set(host, promise);
	return await promise;
	
}

async function doFetchInstanceInfo(instance: InstanceInfo) {
	
	const now = Date.now();
	instance.lastRequest = now;
	instance.checked = now;
	
	let code = 0;
	const res = await Promise.race([
		await callApi(`https://${instance.host}/api/v1/instance`, { updateInstance: false }).catch(e => {
			console.error(e);
			code = 603;
		}),
		await sleep(2_000).then(() => {
			code = 604;
		}),
	]);
	
	if (!res) {
		instance.lastRequestSucceeded = false;
		instance.lastErrorCode = code;
		await setInstanceInfo(instance);
		return instance;
	}
	
	if (!res.ok) {
		instance.lastRequestSucceeded = false;
		instance.lastErrorCode = res.status;
		if (res.status == 404) instance.isMastodon = false;
		await setInstanceInfo(instance);
		return instance;
	}
	
	const json = await res.json().catch(reportAndNull);
	console.log(instance.host, json);
	
	if (!json) {
		instance.anyRequestSucceeded = true;
		instance.lastRequestSucceeded = false;
		instance.lastErrorCode = 602;
		await setInstanceInfo(instance);
		return instance;
	}
	
	const version = json.version;
	if (typeof version == 'string') {
		if (!!instance.version && version != instance.version) {
			instance.canRequestContext = null; // go check again
		}
		instance.version = version;
		instance.isMastodon = !!json.urls?.streaming_api; // dumb random duck typing
		instance.software = instance.isMastodon ? 'mastodon' : null;
	}
	else {
		instance.version = null;
		instance.isMastodon = false;
	}
	
	instance.lastRequestSucceeded = true;
	
	await setInstanceInfo(instance);
	return instance;
	
}
