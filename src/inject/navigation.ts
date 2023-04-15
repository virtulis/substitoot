import { parseId } from '../ids.js';
import { callSubstitoot } from './call.js';
import { Maybe } from '../types.js';
import { reportAndNull } from '../util.js';

export async function maybeFixOnLoad() {
	
	const { hostname, pathname } = location;
	
	const match = pathname.match(/^(.*\/)(s:s:[^:/]+:[^:/]+)(.*?)$/);
	if (!match) return;
	
	const [before, id, after] = [...match].slice(1);
	const { localHost, remoteHost, remoteId } = parseId(hostname, id)!;
	if (!remoteHost || !remoteId) return;
	
	const result = await callSubstitoot('provideStatusMapping', { localHost, remoteHost, remoteId });
	if (!result || !result.mapping.localId) return null;
	
	location.href = `${before}${result.mapping.localId}${after}`;
	
}

export function wrapHistory() {

	const { pushState, replaceState } = history;
	
	type State = { data: any; url: Maybe<string | URL> };
	let lastState: Maybe<State> = null;
	
	const maybeRewrite = async (state: State) => {
	
		if (!state.url) return;
		const url = typeof state.url == 'object' ? state.url : new URL(state.url, location.href);
		
		const match = url.pathname.match(/^(.*\/)(s:s:[^:/]+:[^:/]+)(.*?)$/);
		if (!match) return;
		
		const [before, id, after] = [...match].slice(1);
		const { localHost, remoteHost, remoteId } = parseId(url.hostname, id)!;
		if (!remoteHost || !remoteId) return;
		
		const result = await callSubstitoot('provideStatusMapping', { localHost, remoteHost, remoteId });
		if (!result || !result.mapping.localId) return null;
		
		if (lastState != state) return;
		
		replaceState.call(history, state.data, '', `${before}${result.mapping.localId}${after}`);
		
	};
	
	history.pushState = function (data, unused, url) {
		lastState = { data, url };
		if (url) maybeRewrite(lastState).catch(reportAndNull);
		return pushState.call(this, data, unused, url);
	};
	history.replaceState = function (data, unused, url) {
		lastState = { data, url };
		if (url) maybeRewrite(lastState).catch(reportAndNull);
		return replaceState.call(this, data, unused, url);
	};
	
	window.addEventListener('popstate', () => {
		lastState = null;
	});

}
