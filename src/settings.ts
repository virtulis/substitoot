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
	
	statusRequestTimeout: 1_000,
	contextRequestTimeout: 2_000,
	searchTimeout: 10_000,
	
};
let settings = defaultSettings;

export function getSettings() {
	return settings;
}

export async function reloadSettings() {
	const settRes = await browser.storage.sync.get('settings');
	if (settRes.settings) settings = { ...settings, ...settRes.settings };
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
