import { PatchedXHR, swapInXHR } from './xhr.js';
import { parseId } from '../remapping/ids.js';
import { isLocalMapping } from '../types.js';
import { callSubstitoot } from './call.js';

export async function wrapStatusRequest(xhr: PatchedXHR, parts: string[], args: any[]) {
	
	const id = parts[3];
	const localHost = location.hostname;
	
	const parsed = parseId(localHost, id);
	
	if (!parsed || !xhr.onloadend) return xhr.__send(...args);
	
	const mapping = await callSubstitoot('provideStatusMapping', parsed).then(res => res?.mapping);
	if (!isLocalMapping(mapping)) return xhr.__send(...args);
	
	const url = `/${parts.map(p => p == id ? mapping.localId : p).join('/')}`;
	
	swapInXHR(xhr, url, args);

}
