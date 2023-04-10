import { parseId } from '../ids.js';
import { callSubstitoot } from './call.js';

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
