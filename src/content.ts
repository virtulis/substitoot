// The content script that injects the XHR wrapper and provides an API proxy

function inject() {
	
	// Somehow I got the injection twice on Android (and this breaks everything because request IDs)
	// Not sure if testing artifact, restarting the app helped.
	// Adding this just in case.
	const src = browser.runtime.getURL('dist/inject.js');
	if ([...document.body.getElementsByTagName('script')].find(s => s.src == src)) {
		console.error('Content script ran twice?');
		return;
	}

	// Not bothering to handle disconnect, not sure if I should.
	const port = browser.runtime.connect();
	
	port.onMessage.addListener(msg => {
		window.postMessage({ substitootResponse: msg }, window.origin);
	});
	
	window.addEventListener('message', ev => {
		if (ev.source != window) return;
		if (!ev.data.substitootRequest?.id) return;
		port.postMessage(ev.data.substitootRequest);
	});
	
	const script = document.createElement('script');
	script.src = src;
	document.body.prepend(script);
	
}

inject();
