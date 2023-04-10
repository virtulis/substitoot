import { PatchedXHR, swapInXHR } from './xhr.js';
import { parseId } from '../ids.js';
import { isLocalMapping, isRemoteMapping } from '../types.js';
import { callSubstitoot } from './call.js';

export async function wrapAccountRequest(xhr: PatchedXHR, parts: string[], body: any) {
	
	const id = parts[3];
	const localHost = location.hostname;
	const parsed = parseId(localHost, id);
	if (!parsed || !isRemoteMapping(parsed) || !xhr.onloadend) return xhr.__send(body);
	
	const mapping = await callSubstitoot('provideAccountMapping', parsed);
	if (!isLocalMapping(mapping)) return xhr.__send(body);
	
	const url = `/${parts.map(p => p == id ? mapping.localId : p).join('/')}`;
	
	swapInXHR(xhr, url, body);
	
}

export async function wrapAccountQueryRequest(xhr: PatchedXHR, url: URL, body: any) {

	const params = url.searchParams;
	const entry = [...params.entries()].find(([_k, v]) => v.indexOf('s:a:') == 0);
	if (!entry) return xhr.__send(body);
	
	const [key, id] = entry;
	const localHost = location.hostname;
	const parsed = parseId(localHost, id);
	if (!parsed || !isRemoteMapping(parsed) || !xhr.onloadend) return xhr.__send(body);
	
	const mapping = await callSubstitoot('provideAccountMapping', parsed);
	if (!isLocalMapping(mapping)) return xhr.__send(body);
	
	url.searchParams.set(key, mapping.localId);
	
	swapInXHR(xhr, url.toString(), body);
	
}
