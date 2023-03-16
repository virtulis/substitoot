export interface Settings {
	
	instances: string[];
	skip_instances: string[];
	
	cache_content_mins: number;
	
	preload_home: boolean;
	bypass_followed: boolean;
	
}

export const defaultSettings: Settings = {
	instances: [],
	skip_instances: [],
	cache_content_mins: 30,
	bypass_followed: true,
	preload_home: false,
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
		origins: instances.map(host => `https://${host}/*`),
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
