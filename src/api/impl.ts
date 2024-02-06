import { fetchRemoteStatusAndContext } from '../remote/context.js';
import { fetchRemoteAccountStatuses } from '../remote/accounts.js';
import { maybe } from '../util.js';
import { getSettings, provideSettings } from '../settings.js';
import { APIRequest, APIResponse } from './api.js';
import { asFirefox } from '../browsers/any.js';
import { provideStorage } from '../storage.js';
import { cacheStatusUri, getStatusUri } from '../worker/cache.js';

export const api = {
	
	getSettings,
	
	fetchRemoteStatusAndContext,
	fetchRemoteAccountStatuses,
	
	cacheStatusUri,
	getStatusUri,
	
};
export type API = typeof api;
export type APIMethod = keyof API;

export function setUpAPIPort() {
	
	asFirefox.runtime.onConnect.addListener(async port => {
	
		const respond = (res: APIResponse) => port.postMessage({
			substitootResponse: res,
		});
		
		port.onMessage.addListener(async msg => {
			
			await provideStorage();
			const settings = await provideSettings();
			const url = maybe(port.sender?.url, s => new URL(s));
			const valid = url ? settings.instances.includes(url.hostname) : true;
			
			const request = msg as APIRequest;
			
			if (!valid) return respond({
				id: request.id,
				error: `Requests are not allowed from: ${url?.hostname}`,
			});
			
			try {
				const result = await (api[request.method] as Function)(...request.arguments);
				// console.log(request.method, '<', request.arguments, '>', result);
				respond({
					id: request.id,
					result,
				});
			}
			catch (e) {
				console.error(e);
				respond({
					id: request.id,
					error: (e as Error)?.message ?? 'Internal error',
				});
			}
			
		});
		
	});
	
}
