import { API, APIMethod, APIRequest, APIResponse } from '../api/api.js';

let requestId = 1;

const requests = new Map<number, { resolve: (res: any) => void; reject: (error: Error) => void }>;

window.addEventListener('message', ev => {
	if (ev.source != window) return;
	if (!ev.data.substitootResponse?.id) return;
	const response = ev.data.substitootResponse as APIResponse;
	const { resolve, reject } = requests.get(response.id)!;
	if (response.error) reject(new window.Error(response.error));
	else resolve(response.result);
	requests.delete(response.id);
});

export function callSubstitoot<M extends APIMethod>(method: M, ...args: Parameters<API[M]>) {
	const id = requestId++;
	return new window.Promise<Awaited<ReturnType<API[M]>>>((resolve, reject) => {
		requests.set(id, { resolve, reject });
		window.postMessage({
			substitootRequest: <APIRequest> {
				id,
				method,
				arguments: args,
			},
		}, window.origin);
	});
}
