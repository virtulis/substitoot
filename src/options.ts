// Client-side helpers for the options page (see ../static/options.html)

import { computePermissions, defaultSettings, Settings } from './settings.js';
import { reportAndNull } from './util.js';

let settings = defaultSettings;
const keys = Object.keys(settings) as Array<keyof Settings>;
const inputs = Object.fromEntries(keys.map(k => [
	k,
	document.getElementById(k),
]).filter(e => e[1])) as Record<keyof Settings, HTMLInputElement>;

let focused: HTMLInputElement | null = null;
Object.values(inputs).forEach(el => {
	el.addEventListener('focus', () => focused = el);
	el.addEventListener('blur', () => focused = (focused == el) ? null : focused);
});

function updateUI() {
	for (const key of ['instances', 'skipInstances'] as const) {
		if (focused == inputs[key]) continue;
		inputs[key].value = settings[key].join(', ');
	}
	for (const key of ['cacheContentMins'] as const) {
		if (focused == inputs[key]) continue;
		inputs[key].value = String(settings[key]);
	}
	for (const key of ['bypassFollowed', 'preloadHome'] as const) {
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
	const changed = Object.fromEntries(Object.entries(settings).filter(([k, v]) => v != defaultSettings[k as keyof Settings]));
	await browser.storage.sync.set({ settings: changed });
	await checkPermissions();
}

let requestingPermissions = false;

async function checkPermissions() {
	if (!settings.instances.length || requestingPermissions) return;
	const havePerm = await browser.permissions.contains(computePermissions(settings.instances));
	document.getElementById('fixCtor')!.classList.toggle('visible', !havePerm);
}

async function requestPermissions() {
	requestingPermissions = true;
	await browser.permissions.request(computePermissions(settings.instances)).catch(reportAndNull);
	requestingPermissions = false;
	await checkPermissions();
}

for (const key of ['instances', 'skipInstances'] as const) {
	inputs[key].addEventListener('change', () => {
		settings[key] = inputs[key].value.split(',').map(
			val => val.trim().replace(/^\w*:\/\//g, '').replace(/\/.*$/g, '').toLowerCase()
		).filter(val => !!val);
		save();
		// Not using optional permissions for now, hopefully temporary
		// if (key == 'instances') requestPermissions();
	});
}
for (const key of ['cacheContentMins'] as const) {
	inputs[key].addEventListener('input', () => {
		const num = Number(inputs[key].value);
		if (!isFinite(num)) return;
		settings[key] = num;
		save();
	});
}
for (const key of ['bypassFollowed', 'preloadHome'] as const) {
	inputs[key].addEventListener('change', () => {
		settings[key] = inputs[key].checked;
		save();
	});
}

document.getElementById('fixPermissions')!.addEventListener('click', requestPermissions);

document.getElementById('clearCache')!.addEventListener('click', () => browser.runtime.sendMessage({ command: 'clearCache' }));
document.getElementById('clearMetadata')!.addEventListener('click', () => browser.runtime.sendMessage({ command: 'clearMetadata' }));

browser.storage.sync.onChanged.addListener(load);
browser.permissions.onAdded.addListener(checkPermissions);
browser.permissions.onRemoved.addListener(checkPermissions);

load();
