// The content script that injects the XHR wrapper and provides an API proxy

// Not bothering to handle disconnect, not sure if I should.
import { host } from './browsers/host.js';

console.log('HELO', host);

const port = host.runtime.connect();

port.onMessage.addListener(msg => {
	window.postMessage({ substitootResponse: msg }, window.origin);
});


window.addEventListener('message', ev => {
	if (ev.source != window) return;
	if (!ev.data.substitootRequest?.id) return;
	port.postMessage(ev.data.substitootRequest);
});

const script = document.createElement('script');
script.src = host.runtime.getURL('dist/inject.js');
document.body.prepend(script);
