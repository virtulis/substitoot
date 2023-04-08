// @ts-nocheck

import { Maybe } from '../types.js';

type ReduxStore = {
	dispatch: (arg: any) => void;
};

let reduxStore: Maybe<ReduxStore> = null;

function findReduxStore(ctrEl: HTMLElement) {
	const ctrProp = Object.getOwnPropertyNames(ctrEl).find(s => s.match(/^__reactContainer.*\$.*/));
	const ctr = ctrEl[ctrProp];
	let child;
	for (child = ctr; child; child = child.child) {
		const store = child.memoizedProps?.store;
		if (!store?.dispatch) continue;
		reduxStore = store;
		watchReduxStore(store);
		return;
	}
	return null;
}

function watchReduxStore(store: ReduxStore) {
	const { dispatch } = store;
	store.dispatch = function (arg: any) {
		
		if (typeof arg == 'function') {
			const code = arg.toString();
			if (code.includes('/api/v1/statuses/') && code.match(/`\/api\/v1\/statuses\/\$\{\w+}\/context`/)) {
				dispatch.call(this, arg);
				// console.log('duplicated the context call');
			}
		}
		
		dispatch.call(this, arg);
		
	};
}

export function observeForRedux() {
	
	const ctrEl = document.getElementById('mastodon');
	if (!ctrEl || !window.MutationObserver) return;
	
	const config = { attributes: true, childList: true, subtree: true };
	const started = Date.now();
	
	const callback = (mutationList, observer) => {
		if (!reduxStore) findReduxStore(ctrEl);
		if (reduxStore || Date.now() - started > 5000) observer.disconnect();
	};

	const observer = new MutationObserver(callback);
	observer.observe(ctrEl, config);

}
