export type RequestDetails = browser.webRequest._OnBeforeRequestDetails;
export type BlockingResponse = browser.webRequest.BlockingResponse;

export type JSONHandler = (json: Record<string, any>, url: URL) => void | Promise<void>;
export type JSONRewriter = (json: Record<string, any>, url: URL) => Record<string, any> | Promise<Record<string, any>>;

export const requestsInProgress = new Set<string>();
export const ownRequests = new Set<string>();

export function wrapHandler(details: RequestDetails, handler: JSONHandler, url?: URL): BlockingResponse {
	
	if (ownRequests.has(details.url)) return {};
	console.log('handle', details.url);
	
	const filter = browser.webRequest.filterResponseData(details.requestId);
	const buffers: ArrayBuffer[] = [];
	const decoder = new TextDecoder('utf-8');
	
	filter.ondata = event => {
		buffers.push(event.data);
		filter.write(event.data);
	};
	filter.onstop = async event => {
		filter.disconnect();
		try {
			const str = buffers.map(buf => decoder.decode(buf, { stream: true })).join('');
			const body = JSON.parse(str);
			await handler(body, url ?? new URL(details.url));
		}
		catch (e) {
			console.error(e);
		}
	};
	
	return {};
	
}

export function wrapRewriter(details: RequestDetails, rewriter: JSONRewriter, url?: URL): BlockingResponse {
	
	if (ownRequests.has(details.url)) return {};
	console.log('rewrite', details.url);
	
	const filter = browser.webRequest.filterResponseData(details.requestId);
	const buffers: ArrayBuffer[] = [];
	const decoder = new TextDecoder('utf-8');
	const encoder = new TextEncoder();
	
	filter.ondata = event => buffers.push(event.data);
	filter.onstop = async event => {
		try {
			const str = buffers.map(buf => decoder.decode(buf, { stream: true })).join('');
			const body = JSON.parse(str);
			const result = await rewriter(body, url ?? new URL(details.url));
			filter.write(encoder.encode(JSON.stringify(result)));
		}
		catch (e) {
			console.error(e);
			for (const buf of buffers) filter.write(buf);
		}
		filter.disconnect();
	};
	
	return {};
	
}

export function doFetch(url: string, init?: RequestInit) {
	ownRequests.add(url);
	const promise = fetch(url, init);
	promise.finally(() => ownRequests.delete(url));
	return promise;
}
