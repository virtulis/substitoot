import { packageVersion } from './util.js';

export const ownRequests = new Set<string>();

export function callApi(
	url: string,
	init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }
) {
	
	ownRequests.add(url);
	
	init ??= {};
	init.headers ??= {};
	init.headers['User-Agent'] = `Substitoot ${packageVersion}; ${navigator.userAgent}`;
	
	return fetch(url, init).finally(() => ownRequests.delete(url));
	
}
