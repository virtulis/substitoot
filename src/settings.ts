// Extension settings storage (used by both options.ts and background.ts)

export interface Settings {
	
	instances: string[];
	skipInstances: string[];
	
	cacheContentMins: number;
	
	preloadHome: boolean;
	bypassFollowed: boolean;
	
	statusRequestTimeout: number;
	contextRequestTimeout: number;
	searchTimeout: number;
	
}

export const defaultSettings: Settings = {

	instances: [],
	skipInstances: [],
	cacheContentMins: 30,
	bypassFollowed: true,
	preloadHome: false,
	
	statusRequestTimeout: 5_000,
	contextRequestTimeout: 10_000,
	searchTimeout: 10_000,
	
};
let settings = defaultSettings;

export function getSettings() {
	return settings;
}

export async function reloadSettings() {
	
	let saved = await browser.storage.sync.get('settings').then(res => res.settings as Maybe<Partial<Settings>>);
	
	// FIXME clean up old defaults dumbly saved as "settings"
	if (saved && (saved.searchTimeout == 3_000 || saved.contextRequestTimeout == 2_000)) {
		saved = omit(saved, ['statusRequestTimeout', 'contextRequestTimeout', 'searchTimeout']);
		for (const key of Object.keys(saved) as (keyof Settings)[]) if (saved[key] == defaultSettings[key]) delete saved[key];
		console.log({ saved });
		await browser.storage.sync.set({ settings: saved });
	}
	
	if (saved) settings = { ...defaultSettings, ...saved };
	
}

export async function initSettings(onChange: () => any) {

	browser.storage.sync.onChanged.addListener(async changes => {
		if (!changes.settings) return;
		await reloadSettings();
		onChange();
	});
	browser.permissions.onAdded.addListener(onChange);
	
	await reloadSettings();
	onChange();
	
}

export function computePermissions(instances: string[]): browser.permissions.Permissions {
	return {
		// instances.map(host => `https://${host}/*`),
		permissions: [
			
			'webRequest',
			'webRequestBlocking',
			'webNavigation',
			'scripting',
			
			// Required in Manifest V3 but errors out in V2 in older versions
			// 'webRequestFilterResponse',
			
		],
	};
}
