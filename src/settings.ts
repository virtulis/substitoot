// Extension settings storage (used by both options.ts and background.ts)

import { omit } from './util.js';
import { Maybe } from './types.js';
import { anyBrowser } from './browsers/any.js';

export interface Settings {
	
	instances: string[];
	skipInstances: string[];
	
	cacheContentMins: number;
	
	useRequestFilter: boolean;
	preloadHome: boolean;
	bypassFollowed: boolean;
	
	statusRequestTimeout: number;
	contextRequestTimeout: number;
	searchTimeout: number;
	instanceCheckTimeout: number;
	
}

export const defaultSettings: Settings = {

	instances: [],
	skipInstances: [],
	cacheContentMins: 30,
	bypassFollowed: true,
	preloadHome: false,
	useRequestFilter: false,
	
	statusRequestTimeout: 5_000,
	contextRequestTimeout: 10_000,
	searchTimeout: 10_000,
	instanceCheckTimeout: 5_000,
	
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
