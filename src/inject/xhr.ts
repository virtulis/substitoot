import { wrapContextRequest } from './context.js';
import { wrapStatusPostRequest, wrapStatusRequest } from './status.js';
import { wrapAccountQueryRequest, wrapAccountRequest } from './account.js';

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
	
	proto.send = function (this: PatchedXHR, ...args: Parameters<typeof send>) {
		
		if (!this.__url) return send.apply(this, args);
		
		const method = this.__method;
		const url = new URL(this.__url, location.href);
		
		const parts = url.pathname.split('/').slice(1);
		if (url.hostname != localHost || parts[0] != 'api') return send.apply(this, args);
		
		if (parts[2] == 'statuses') {
			if (method == 'GET' && parts[4] == 'context') return wrapContextRequest(this, parts);
			if (parts[3]?.indexOf('s:') === 0) return wrapStatusRequest(this, parts, args);
			if (method == 'POST' && typeof args[0] == 'string') return wrapStatusPostRequest(this, args[0]);
		}
		if (parts[2] == 'accounts') {
			if (parts[3]?.indexOf('s:') === 0) return wrapAccountRequest(this, parts, args);
			if (url.search.includes('s:a:')) return wrapAccountQueryRequest(this, url, args);
		}
		
		return send.apply(this, args);
		
	} as typeof send;

}

export function swapInXHR(dest: PatchedXHR, url: string, body: any) {
	
	const { onloadend, onerror, onabort } = dest;
	
	const actual = new XMLHttpRequest() as PatchedXHR;
	
	actual.onerror = onerror;
	actual.onabort = onabort;
	
	actual.onloadend = (ev) => {
		Object.defineProperty(dest, 'responseText', { value: actual.responseText });
		Object.defineProperty(dest, 'status', { value: actual.status });
		onloadend!.call(actual, ev);
	};
	
	actual.open(dest.__method, url);
	for (const [name, value] of Object.entries(dest.__headers)) actual.setRequestHeader(name, value);
	actual.__send(body);
	
	return actual;
	
}
