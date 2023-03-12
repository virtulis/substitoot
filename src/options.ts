import { defaultSettings, Settings } from './settings';

let settings = defaultSettings;
const keys = Object.keys(settings) as Array<keyof Settings>;
const inputs = Object.fromEntries(keys.map(k => [
	k,
	document.getElementById(k),
])) as Record<keyof Settings, HTMLInputElement>;

let focused: HTMLInputElement | null = null;
Object.values(inputs).forEach(el => {
	el.addEventListener('focus', () => focused = el);
	el.addEventListener('blur', () => focused = (focused == el) ? null : focused);
});

function updateUI() {
	for (const key of ['instances', 'skip_instances'] as const) {
		if (focused == inputs[key]) continue;
		inputs[key].value = settings[key].join(', ');
	}
	for (const key of ['cache_content_mins'] as const) {
		if (focused == inputs[key]) continue;
		inputs[key].value = String(settings[key]);
	}
	for (const key of ['bypass_followed', 'preload_home'] as const) {
		inputs[key].checked = settings[key];
	}
}

async function load() {
	const res = await browser.storage.sync.get('settings');
	if (res.settings) settings = { ...settings, ...res.settings };
	updateUI();
	checkPermissions();
}

async function save() {
	await browser.storage.sync.set({ settings });
	await checkPermissions();
}

function computePermissions(): browser.permissions.Permissions {
	return {
		origins: settings.instances.map(host => `https://${host}/*`),
		permissions: [
			'webRequest',
			'webRequestBlocking',
			'webRequestFilterResponse',
			'webNavigation',
		],
	};
}

async function checkPermissions() {
	const havePerm = await browser.permissions.contains(computePermissions());
	document.getElementById('fix_ctor')!.classList.toggle('visible', !havePerm);
}

function requestPermissions() {
	browser.permissions.request(computePermissions());
}

for (const key of ['instances', 'skip_instances'] as const) {
	inputs[key].addEventListener('change', () => {
		settings[key] = inputs[key].value.split(',').map(
			val => val.trim().replace(/^\w*:\/\//g, '').replace(/\/.*$/g, '')
		).filter(val => !!val);
		save();
		if (key == 'instances') requestPermissions();
	});
}
for (const key of ['cache_content_mins'] as const) {
	inputs[key].addEventListener('input', () => {
		const num = Number(inputs[key].value);
		if (!isFinite(num)) return;
		settings[key] = num;
		save();
	});
}
for (const key of ['bypass_followed', 'preload_home'] as const) {
	inputs[key].addEventListener('change', () => {
		settings[key] = inputs[key].checked;
		save();
	});
}

document.getElementById('fix_permissions')!.addEventListener('click', requestPermissions);

browser.storage.sync.onChanged.addListener(load);
browser.permissions.onAdded.addListener(checkPermissions);
browser.permissions.onRemoved.addListener(checkPermissions);

load();
