import { wrapContextRequest } from './context.js';
import {
	wrapLocalStatusRequest,
	wrapRemoteStatusRequest,
	wrapStatusPostRequest,
	wrapTimelineRequest,
} from './status.js';
import { wrapAccountQueryRequest, wrapAccountRequest, wrapAccountStatusesRequest } from './account.js';

export type PatchedXHR = XMLHttpRequest & {
	
	__method: string;
	__url: string | URL;
	__headers: Record<string, string>;
	
	__send: XMLHttpRequest['send'];
	
};

export function wrapXHR() {
	
	const localHost = location.hostname;
	
	const proto = XMLHttpRequest.prototype as PatchedXHR;
	const { open, send, setRequestHeader } = proto;
	
	proto.__send = send;
	
	proto.open = function (this: PatchedXHR, ...args: Parameters<typeof open>) {
	
		// maybeInterceptRedux();
		
		this.__method = args[0].toUpperCase();
		this.__url = args[1];
		this.__headers = {};
		
		// console.log(this.__url);
		
		return open.apply(this, args);
		
	} as typeof open;
	
	proto.setRequestHeader = function (this: PatchedXHR, name: string, value: string) {
		this.__headers[name] = value;
		return setRequestHeader.call(this, name, value);
	};
	
	proto.send = function (this: PatchedXHR, body?: Document | XMLHttpRequestBodyInit | null) {
		
		if (!this.__url) return send.call(this, body);
		
		const method = this.__method;
		const url = new URL(this.__url, location.href);
		
		const parts = url.pathname.split('/').slice(1);
		if (url.hostname != localHost || parts[0] != 'api') return send.call(this, body);
		
		if (parts[2] == 'statuses') {
			if (method == 'GET' && parts[4] == 'context') return wrapContextRequest(this, parts);
			if (parts[3]?.indexOf('s:') === 0) return wrapRemoteStatusRequest(this, parts, body);
			if (method == 'GET' && !parts[4]) return wrapLocalStatusRequest(this, parts, body);
			if (method == 'POST' && typeof body == 'string') return wrapStatusPostRequest(this, body);
		}
		if (parts[2] == 'accounts') {
			if (method == 'GET' && parts[4] == 'statuses' && !parts[5]) return wrapAccountStatusesRequest(this, parts, url.searchParams);
			if (parts[3]?.indexOf('s:') === 0) return wrapAccountRequest(this, parts, body);
			if (url.search.includes('s:a:')) return wrapAccountQueryRequest(this, url, body);
		}
		if (parts[2] == 'timelines' && method == 'GET') {
			return wrapTimelineRequest(this, parts, body);
		}
		
		return send.call(this, body);
		
	} as typeof send;

}

export function swapInXHR(dest: PatchedXHR, url: string, body: any, responseFilter?: (res: string) => (string | Promise<string>)) {
	
	const { onloadend, onerror, onabort } = dest;
	
	const actual = new XMLHttpRequest() as PatchedXHR;
	
	actual.onerror = onerror;
	actual.onabort = onabort;
	
	actual.onloadend = async (ev) => {
		const response = await responseFilter?.(actual.responseText) ?? actual.responseText;
		Object.defineProperty(dest, 'responseText', { value: response });
		Object.defineProperty(dest, 'status', { value: actual.status });
		onloadend!.call(actual, ev);
	};
	
	actual.open(dest.__method, url);
	for (const [name, value] of Object.entries(dest.__headers)) actual.setRequestHeader(name, value);
	actual.__send(body);
	
	return actual;
	
}
