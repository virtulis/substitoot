// Fetch and store information about remote instances

import { ActiveRequestMap, reportAndNull, sleep } from '../util.js';
import { InstanceInfo } from '../types.js';
import { callApi } from './fetch.js';
import { getLastUpdated, getStorage } from '../storage.js';
import { getSettings } from '../settings.js';

export async function setInstanceInfo(instance: InstanceInfo) {
	console.log('instance', instance);
	await getStorage().put('instances', instance);
}

const instanceRequests = new ActiveRequestMap<InstanceInfo>({ timeout: () => getSettings().instanceCheckTimeout });

export async function fetchInstanceInfo(host: string, force = false): Promise<InstanceInfo> {
	
	if (getSettings().skipInstances.includes(host)) return { host };
	
	const lastUpdated = await getLastUpdated();
	const instance: InstanceInfo = (await getStorage().get('instances', host)) ?? { host };
	if (
		!force
		&& instance?.checked
		&& Date.now() - instance.checked < 24 * 3600_000
		&& instance.checked > lastUpdated
	) return instance;
	
	return (await instanceRequests.perform(host, () => doFetchInstanceInfo(instance))) ?? { host };
	
}

async function doFetchInstanceInfo(instance: InstanceInfo) {
	
	const now = Date.now();
	const prevChecked = instance.checked;
	
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
		if (
			(!!instance.version && version != instance.version)
			|| (prevChecked && prevChecked < await getLastUpdated())
		) {
			instance.canRequestContext = null; // go check again
		}
		instance.version = version;
		const compatible = version.match(/compatible; (\w+)/)?.[1];
		instance.isMastodon = !compatible && !!json.urls?.streaming_api; // dumb random duck typing
		instance.isCompatible = instance.isMastodon || !!compatible;
		instance.software = instance.isMastodon ? 'mastodon' : compatible?.toLowerCase() ?? null;
	}
	else {
		instance.version = null;
		instance.isMastodon = false;
	}
	
	instance.lastRequestSucceeded = true;
	
	await setInstanceInfo(instance);
	return instance;
	
}
