import { PatchedXHR, swapInXHR } from './xhr.js';
import { parseId } from '../remapping/ids.js';
import { isLocalMapping, isRemoteMapping } from '../types.js';
import { callSubstitoot } from './call.js';

export async function wrapAccountRequest(xhr: PatchedXHR, parts: string[], args: any[]) {
	
	const id = parts[3];
	const localHost = location.hostname;
	const parsed = parseId(localHost, id);
	if (!parsed || !isRemoteMapping(parsed) || !xhr.onloadend) return xhr.__send(...args);
	
	const mapping = await callSubstitoot('provideAccountMapping', parsed);
	if (!isLocalMapping(mapping)) return xhr.__send(...args);
	
	const url = `/${parts.map(p => p == id ? mapping.localId : p).join('/')}`;
	
	swapInXHR(xhr, url, args);
	
}

export async function wrapAccountQueryRequest(xhr: PatchedXHR, url: URL, args: any[]) {

	const params = url.searchParams;
	const entry = [...params.entries()].find(([_k, v]) => v.indexOf('s:a:') == 0);
	if (!entry) return xhr.__send(...args);
	
	const [key, id] = entry;
	const localHost = location.hostname;
	const parsed = parseId(localHost, id);
	if (!parsed || !isRemoteMapping(parsed) || !xhr.onloadend) return xhr.__send(...args);
	
	const mapping = await callSubstitoot('provideAccountMapping', parsed);
	if (!isLocalMapping(mapping)) return xhr.__send(...args);
	
	url.searchParams.set(key, mapping.localId);
	
	swapInXHR(xhr, url.toString(), args);
	
}
