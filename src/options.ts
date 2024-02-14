// Client-side helpers for the options page (see ../static/options.html)

import { computePermissions, defaultSettings, Settings } from './settings.js';
import { isIn, reportAndNull } from './util.js';
import { anyBrowser, asChrome, maybeFirefox } from './browsers/any.js';
import { Maybe } from './types.js';

let settings = { ...defaultSettings };
const keys = Object.keys(settings) as Array<keyof Settings>;
const inputs = Object.fromEntries(keys.map(k => [
	k,
	document.getElementById(k),
]).filter(e => e[1])) as Record<keyof Settings, HTMLInputElement>;

let focused: Maybe<HTMLInputElement> = null;
Object.values(inputs).forEach(el => {
	el.addEventListener('focus', () => focused = el);
	el.addEventListener('blur', () => focused = (focused == el) ? null : focused);
});

function updateUI() {
	for (const key of keys) {
		const input = inputs[key];
		if (!input || focused == input) continue;
		if (isIn(key, ['instances', 'skipInstances'])) {
			input.value = settings[key].join(', ');
		}
		else if (isIn(typeof settings[key], ['number', 'string'])) {
			input.value = String(settings[key]);
		}
	}
}

async function load() {
	const res = await anyBrowser.storage.sync.get('settings');
	if (res.settings) settings = { ...settings, ...res.settings };
	updateUI();
	checkPermissions().catch(reportAndNull);
}

async function save() {
	const changed = Object.fromEntries(Object.entries(settings).filter(([k, v]) => v != defaultSettings[k as keyof Settings]));
	await anyBrowser.storage.sync.set({ settings: changed });
	await checkPermissions();
}

let requestingPermissions = false;

async function checkPermissions() {
	if (!settings.instances.length || requestingPermissions) return;
	const havePerm = await anyBrowser.permissions.contains(computePermissions(settings.instances));
	document.getElementById('fixCtor')!.classList.toggle('visible', !havePerm);
}

async function requestPermissions() {
	requestingPermissions = true;
	await anyBrowser.permissions.request(computePermissions(settings.instances)).catch(reportAndNull);
	requestingPermissions = false;
	await checkPermissions();
}

// String inputs
for (const key of ['instances', 'skipInstances'] as const) {
	inputs[key].addEventListener('change', () => {
		settings[key] = inputs[key].value.split(',').map(
			val => val.trim().replace(/^\w*:\/\//g, '').replace(/\/.*$/g, '').toLowerCase()
		).filter(val => !!val);
		save();
		if (key == 'instances') requestPermissions();
	});
}

// Advanced
const advCb = document.getElementById('showAdvanced') as HTMLInputElement;
const advCtr = document.getElementById('advanced')!;
advCb.onchange = () => advCtr.classList.toggle('hidden', !advCb.checked);
for (const key of keys) {
	if (inputs[key]) continue;
	const type = typeof defaultSettings[key];
	if (isIn(type, ['number', 'string'])) {
		
		const ctr = document.createElement('div');
		ctr.className = 'column';
		
		const label = document.createElement('label');
		label.htmlFor = key;
		label.textContent = key;
		
		const input = document.createElement('input');
		input.id = key;
		input.pattern = '\\d+';
		input.addEventListener('change', () => {
			const val = input.value.trim();
			if (type == 'number' && isFinite(Number(val))) settings[key] = Number(val) as any;
			else settings[key] = val as any;
		});
		
		inputs[key] = input;
		ctr.append(label, input);
		advCtr.append(ctr);
		
	}
}

document.getElementById('fixPermissions')!.addEventListener('click', requestPermissions);

document.getElementById('clearMetadata')!.addEventListener('click', () => asChrome.runtime.sendMessage({ command: 'clearMetadata' }));

asChrome.storage.sync.onChanged.addListener(load);
asChrome.permissions.onAdded.addListener(checkPermissions);
asChrome.permissions.onRemoved.addListener(checkPermissions);

if (!maybeFirefox) document.getElementById('legacyModeSwitch')?.classList.add('hidden');

load().catch(reportAndNull);
