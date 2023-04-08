import { fetchInstanceInfo } from '../instances/info.js';
import {
	fetchStatus,
	fetchStatusCounts,
	getStatusMapping,
	processStatusJSON,
	provideStatusMapping,
} from '../remapping/statuses.js';
import { fetchContext, mergeContextResponses } from '../remapping/context.js';
import { provideAccountMapping } from '../remapping/accounts.js';
import { provideNavigationRedirect } from '../remapping/navigation.js';
import { maybe } from '../util.js';
import { getSettings } from '../settings.js';
import { APIRequest, APIResponse } from './api.js';

export const api = {
	
	fetchInstanceInfo,
	
	fetchStatus,
	getStatusMapping,
	provideStatusMapping,
	processStatusJSON,
	fetchStatusCounts,
	
	fetchContext,
	mergeContextResponses,
	
	provideAccountMapping,
	
	provideNavigationRedirect,
	
};
export type API = typeof api;
export type APIMethod = keyof API;

export function setUpAPIPort() {
	
	browser.runtime.onConnect.addListener(port => {
		
		const url = maybe(port.sender?.url, s => new URL(s));
		const valid = url ? getSettings().instances.includes(url.hostname) : true;
		
		port.onMessage.addListener(async msg => {
			
			const request = msg as APIRequest;
			
			if (!valid) port.postMessage(<APIResponse> {
				id: request.id,
				error: `Requests are not allowed from: ${url}`,
			});
			
			try {
				const result = await (api[request.method] as Function)(...request.arguments);
				console.log(result);
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
