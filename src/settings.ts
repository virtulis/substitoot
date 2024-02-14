// Extension settings storage (used by both options.ts and background.ts)

import { Maybe } from './types.js';
import { anyBrowser } from './browsers/any.js';

export interface Settings {
	
	instances: string[];
	skipInstances: string[];
	
	remoteUserRequestTimeout: number;
	remoteContextRequestTimeout: number;
	localSearchTimeout: number;
	instanceCheckTimeout: number;
	
	maxParallelSearchReqs: number;
	minSearchRequestInterval: number;
	delayAfterFailedLocalReq: number;
	maxRemoteAccountFetchFailures: number;
	
	hideNoOpToastAfter: number;
	hideSuccessToastAfter: number;
	hideFailedToastAfter: number;
	
}

export const defaultSettings: Settings = {

	instances: [],
	skipInstances: [],
	
	remoteUserRequestTimeout: 10_000,
	remoteContextRequestTimeout: 10_000,
	localSearchTimeout: 10_000,
	instanceCheckTimeout: 10_000,
	
	maxParallelSearchReqs: 5,
	minSearchRequestInterval: 100,
	delayAfterFailedLocalReq: 2000,
	maxRemoteAccountFetchFailures: 3,
	
	hideNoOpToastAfter: 1000,
	hideSuccessToastAfter: 2000,
	hideFailedToastAfter: 5000,
	
};

let settings: Maybe<Settings> = null;
let settingsLoaded: Maybe<Promise<void>> = null;

export function getSettings() {
	if (!settings) throw new Error('Settings not loaded');
	return settings;
}

export async function provideSettings() {
	if (!settingsLoaded) settingsLoaded = reloadSettings();
	await settingsLoaded;
	return getSettings();
}

export async function reloadSettings() {
	const saved = await anyBrowser.storage.sync.get('settings').then(res => res.settings as Maybe<Partial<Settings>>);
	settings = { ...defaultSettings, ...saved };
}

export async function initSettings(onChange: () => any) {

	anyBrowser.storage.sync.onChanged.addListener(async changes => {
		if (!changes.settings) return;
		await reloadSettings();
		onChange();
	});
	anyBrowser.permissions.onAdded.addListener(onChange);
	
	await provideSettings();
	onChange();
	
}

export function computePermissions(instances: string[]): browser.permissions.Permissions {
	return {
		origins: instances.map(host => `https://${host}/*`),
		permissions: [],
	};
}
