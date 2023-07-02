import { fetchInstanceInfo } from '../instances/info.js';
import {
	fetchStatus,
	fetchStatusCounts,
	getStatusMapping,
	mergeStatusLists,
	processStatusJSON,
	provideStatusMapping,
} from '../remapping/statuses.js';
import { fetchContext, mergeContextResponses } from '../remapping/context.js';
import { fetchAccountStatuses, provideAccountMapping } from '../remapping/accounts.js';
import { provideNavigationRedirect } from '../remapping/navigation.js';
import { maybe } from '../util.js';
import { provideSettings } from '../settings.js';
import { APIRequest, APIResponse } from './api.js';
import { asFirefox } from '../browsers/any.js';
import { provideStorage } from '../storage.js';

export const api = {
	
	fetchInstanceInfo,
	
	fetchStatus,
	getStatusMapping,
	provideStatusMapping,
	processStatusJSON,
	fetchStatusCounts,
	mergeStatusLists,
	
	fetchContext,
	mergeContextResponses,
	
	provideAccountMapping,
	fetchAccountStatuses,
	
	provideNavigationRedirect,
	
};
export type API = typeof api;
export type APIMethod = keyof API;

export function setUpAPIPort() {
	
	asFirefox.runtime.onConnect.addListener(async port => {
		
		port.onMessage.addListener(async msg => {
			
			await provideStorage();
			const settings = await provideSettings();
			const url = maybe(port.sender?.url, s => new URL(s));
			const valid = url ? settings.instances.includes(url.hostname) : true;
			
			const request = msg as APIRequest;
			
			if (!valid) port.postMessage(<APIResponse> {
				id: request.id,
				error: `Requests are not allowed from: ${url?.hostname}`,
			});
			
			try {
				const result = await (api[request.method] as Function)(...request.arguments);
				// console.log(request.method, '<', request.arguments, '>', result);
				port.postMessage(<APIResponse> {
					id: request.id,
					result,
				});
			}
			catch (e) {
				console.error(e);
				port.postMessage(<APIResponse> {
					id: request.id,
					error: (e as Error)?.message ?? 'Internal error',
				});
			}
			
		});
		
	});
	
}
