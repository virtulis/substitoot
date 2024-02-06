import { cancelToast } from './toast.js';

export function wrapHistory() {

	const { pushState } = history;
	history.pushState = function (data, unused, url) {
		cancelToast();
		return pushState.call(this, data, unused, url);
	};
	
	window.addEventListener('popstate', () => {
		cancelToast();
	});

}
