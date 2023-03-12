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
	browser.storage.sync.onChanged.addListener(changes => {
		if (changes.settings) onChange();
	});
	await reloadSettings();
	onChange();
}
