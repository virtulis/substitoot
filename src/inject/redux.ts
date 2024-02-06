import { Maybe } from '../types.js';

interface ReduxStore {
	dispatch(arg: ((dispatch: ReduxStore['dispatch'], getState: () => any) => void) | object): void;
	getState(): any;
}

let reduxStore: Maybe<ReduxStore> = null;

function findReduxStore(ctrEl: HTMLElement) {
	const ctrProp = Object.getOwnPropertyNames(ctrEl).find(s => s.match(/^__reactContainer.*\$.*/));
	if (!ctrProp) return null;
	const ctr = (ctrEl as any)[ctrProp];
	let child;
	for (child = ctr; child; child = child.child) {
		const store = child.memoizedProps?.store;
		if (!store?.dispatch) continue;
		reduxStore = store;
		return;
	}
	return null;
}

export function getReduxStore() {
	return reduxStore;
}

export function observeForRedux() {
	
	const ctrEl = document.getElementById('mastodon');
	if (!ctrEl) return;
	findReduxStore(ctrEl);
	if (reduxStore) return;
	
	if (!window.MutationObserver) return;
	const config = { attributes: true, childList: true, subtree: true };
	const started = Date.now();
	
	const callback: MutationCallback = (mutationList, observer) => {
		if (!reduxStore) findReduxStore(ctrEl);
		if (reduxStore || Date.now() - started > 5000) {
			observer.disconnect();
		}
	};
	
	const observer = new MutationObserver(callback);
	observer.observe(ctrEl, config);
	
}
