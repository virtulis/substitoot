import { wrapContextRequest } from './context.js';
import { wrapLocalStatusRequest } from './status.js';
import { wrapAccountStatusesRequest } from './account.js';
import { Maybe } from '../types.js';

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
			return wrapLocalStatusRequest(this, parts, body);
		}
		if (parts[2] == 'accounts') {
			if (method == 'GET' && parts[4] == 'statuses' && !parts[5]) return wrapAccountStatusesRequest(this, parts, url.searchParams);
		}
		
		return send.call(this, body);
		
	} as typeof send;

}

type MessageHandler = (this: WindowEventHandlers, ev: MessageEvent) => any;
let messageTarget: Maybe<WindowEventHandlers> = null;
let messageHandler: Maybe<MessageHandler> = null;

export function callMessageHandler(data: string) {
	if (!messageHandler) return;
	return messageHandler.call(messageTarget!, new MessageEvent('message', { data }));
}

export function wrapWebSocket() {
	
	const orig = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage')!;
	const setter = orig.set!;
	Object.defineProperty(WebSocket.prototype, 'onmessage', {
		...orig,
		set(fn: MessageHandler | null) {
			const url = new URL(this.url);
			if (url.pathname != '/api/v1/streaming/' || !fn) return setter.call(this, fn);
			// eslint-disable-next-line @typescript-eslint/no-this-alias
			messageTarget = this;
			messageHandler = fn;
			const wrapper: MessageHandler = function (ev) {
				fn.call(this, ev);
			};
			setter.call(this, wrapper);
		},
	});
	
}
