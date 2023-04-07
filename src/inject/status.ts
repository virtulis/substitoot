import { PatchedXHR, swapInXHR } from './xhr.js';
import { parseId } from '../remapping/ids.js';
import { isLocalMapping } from '../types.js';
import { callSubstitoot } from './call.js';

export async function wrapStatusRequest(xhr: PatchedXHR, parts: string[], body: any) {
	
	const id = parts[3];
	const parsed = id && parseId(location.hostname, id);
	if (!parsed || !xhr.onloadend) return xhr.__send(body);
	
	const mapping = await callSubstitoot('provideStatusMapping', parsed).then(res => res?.mapping);
	if (!isLocalMapping(mapping)) return xhr.__send(body);
	
	const url = `/${parts.map(p => p == id ? mapping.localId : p).join('/')}`;
	
	swapInXHR(xhr, url, body);

}

export async function wrapStatusPostRequest(xhr: PatchedXHR, body: string) {

	const json = JSON.parse(body);
	const id = json.in_reply_to_id;
	const parsed = id && parseId(location.hostname, id);
	if (!id || isLocalMapping(parsed)) return xhr.__send(body);
	
	const mapping = await callSubstitoot('provideStatusMapping', parsed).then(res => res?.mapping);
	if (!isLocalMapping(mapping)) return xhr.__send(body);
	
	json.in_reply_to_id = mapping.localId;
	
	const { onloadend } = xhr;
	xhr.onloadend = ev => {
		try {
			const json = JSON.parse(xhr.responseText);
			json.in_reply_to_id = id;
			Object.defineProperty(xhr, 'responseText', { value: JSON.stringify(json) });
		}
		catch (e) {
			console.error(e);
		}
		onloadend?.call(xhr, ev);
	};
	
	xhr.__send(JSON.stringify(json));
	
}
