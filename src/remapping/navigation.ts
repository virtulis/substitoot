// Browser navigation handling logic (actual event handlers elsewhere)

import { parseId } from '../ids.js';
import { provideStatusMapping } from './statuses.js';

export async function provideNavigationRedirect(url: string) {
	
	const { hostname, pathname } = new URL(url);
	const match = pathname.match(/^(.*\/)(s:s:[^:/]+:[^:/]+)(.*?)$/);
	if (!match) return null;
	
	const [before, id, after] = [...match].slice(1);
	const { localHost, remoteHost, remoteId } = parseId(hostname, id)!;
	// console.log({ before, id, after, localHost, remoteHost, remoteId });
	if (!remoteHost || !remoteId) return null;
	
	const result = await provideStatusMapping({ localHost, remoteHost, remoteId });
	// console.log({ result });
	if (!result || !result.mapping.localId) return null;
	
	return `https://${hostname}${before}${result.mapping.localId}${after}`;
	
}
