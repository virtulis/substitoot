import { getStorage } from '../storage.js';
import { Maybe, StatusUriTriple } from '../types.js';

export async function cacheStatusUri(status: StatusUriTriple) {
	await getStorage().put('instanceStatusUris', {
		...status,
		key: `${status.instance}:${status.id}`,
	});
}

export async function getStatusUri(instance: string, id: string): Promise<Maybe<StatusUriTriple>> {
	const key = `${instance}:${id}`;
	return await getStorage().get('instanceStatusUris', key);
}
