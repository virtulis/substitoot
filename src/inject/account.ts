import { PatchedXHR, swapInXHR } from './xhr.js';
import { parseId } from '../ids.js';
import { isFullMapping, isLocalMapping, isRemoteMapping } from '../types.js';
import { callSubstitoot } from './call.js';
import DOMPurify from 'dompurify';

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

export async function wrapAccountStatusesRequest(xhr: PatchedXHR, parts: string[], query: URLSearchParams) {
	
	const id = parts[3];
	if (query.has('since_id') || query.has('pinned')) return xhr.__send();
	
	const localHost = location.hostname;
	const parsed = parseId(localHost, id);
	const mapping = parsed && await callSubstitoot('provideAccountMapping', parsed);
	if (!isFullMapping(mapping) || mapping.localHost == mapping.remoteHost) return xhr.__send();
	
	query.set('limit', '40');
	const remoteFetch = callSubstitoot('fetchAccountStatuses', mapping, query);
	swapInXHR(xhr, `/${parts.slice(0, 3).join('/')}/${mapping.localId}/statuses?${query}`, null, async res => {
		
		let localStatuses;
		try {
			localStatuses = JSON.parse(res);
		}
		catch (e) {
			console.error(e);
			return res;
		}
		
		const remoteStatuses = await remoteFetch;
		if (!remoteStatuses) return res;
		
		for (const status of remoteStatuses) status.content = DOMPurify.sanitize(status.content);
		const merged = await callSubstitoot('mergeStatusLists', {
			localHost: mapping.localHost,
			sourceHost: mapping.remoteHost,
			localStatuses,
			remoteStatuses,
		});
		
		return JSON.stringify(merged);
		
	});
	
}

