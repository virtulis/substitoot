// The content script that injects the XHR wrapper and provides an API proxy

import { anyBrowser, asChrome } from './browsers/any.js';
import { Maybe } from './types.js';

function inject() {
	
	// Somehow I got the injection twice on Android (and this breaks everything because request IDs)
	// Not sure if testing artifact, restarting the app helped.
	// Adding this just in case.
	const src = anyBrowser.runtime.getURL('dist/inject.js');
	if ([...document.body.getElementsByTagName('script')].find(s => s.src == src)) {
		console.error('Content script ran twice?');
		return;
	}

	let port: Maybe<chrome.runtime.Port> = null;
	const connect = () => {
		port = asChrome.runtime.connect();
		port.onMessage.addListener(msg => {
			console.log('msg', msg);
			window.postMessage(msg, window.origin);
		});
		port.onDisconnect.addListener(() => {
			port = null;
		});
	};
	
	window.addEventListener('message', ev => {
		if (ev.source != window) return;
		if (!ev.data.substitootRequest?.id) return;
		if (!port) connect();
		port!.postMessage(ev.data.substitootRequest);
	});
	
	const script = document.createElement('script');
	script.src = src;
	document.body.prepend(script);
	
}

inject();
