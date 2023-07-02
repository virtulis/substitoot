import { isLocalMapping, isRemoteMapping, RemoteMapping, StatusMapping } from '../types.js';
import { callApi } from './fetch.js';
import { getStorage } from '../storage.js';

export function shouldHaveActualId(mapping: RemoteMapping<StatusMapping>) {
	return mapping.uri?.match(/\/objects\/([a-f0-9-]{36})\/?$/);
}

export async function findStatusActualId(mapping: RemoteMapping<StatusMapping>) {
	const xomaObj = mapping.uri?.match(/\/objects\/([a-f0-9-]{36})\/?$/);
	if (xomaObj) {
		const res = await callApi(mapping.uri!, { updateInstance: false }, { method: 'HEAD' });
		const redir = res.url;
		if (!redir) return mapping;
		mapping.actualId = redir.split('/').filter(s => s).pop()!;
		if (isLocalMapping(mapping)) await getStorage().put('localStatusMapping', mapping);
		if (isRemoteMapping(mapping)) await getStorage().put('remoteStatusMapping', mapping);
	}
	return mapping;
}
