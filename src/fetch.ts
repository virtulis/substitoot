export const ownRequests = new Set<string>();

export function callApi(url: string, init?: RequestInit) {
	ownRequests.add(url);
	return fetch(url, init).finally(() => ownRequests.delete(url));
}
