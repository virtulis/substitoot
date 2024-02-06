import { PatchedXHR } from './xhr.js';
import { countsKeys, Status } from '../types.js';

const patches = new Map<string, Partial<Status>>();

export function patchStatus(id: string, patch: Partial<Status>) {
	patches.set(id, {
		...patches.get(id),
		...patch,
	});
}

export async function wrapLocalStatusRequest(xhr: PatchedXHR, parts: string[], body: any) {
	
	const id = parts[3];
	
	console.log('wrapLocalStatusRequest', id, parts);
	
	const { onloadend } = xhr;
	xhr.onloadend = ev => {
		try {
			const json = JSON.parse(xhr.responseText);
			if (json?.id == id) {
				const patch = patches.get(id);
				console.log('wrapLocalStatusRequest', id, 'patch', patch);
				if (patch) {
					for (const key of countsKeys) {
						const val = patch[key];
						if (val && val > json[key]) json[key] = val;
					}
					Object.defineProperty(xhr, 'responseText', { value: JSON.stringify(json) });
				}
			}
		}
		catch (e) {
			console.error(e);
		}
		onloadend?.call(xhr, ev);
	};
	
	xhr.__send(body);
	
}
