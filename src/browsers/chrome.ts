import { host } from './host.js';
import { getSettings } from '../settings.js';
import { reportAndNull } from '../util.js';
import { Maybe } from '../types.js';
import { historyListener, navigationListener } from './navigation.js';

const { webNavigation, scripting, runtime } = host;

export function updateChromeEventHandlers() {
	
	const settings = getSettings();
	
	webNavigation.onCompleted.removeListener(navigationListener);
	webNavigation.onHistoryStateUpdated.removeListener(historyListener);
	
	if (settings.instances.length) {
		
		webNavigation.onCompleted.addListener(navigationListener, {
			url: settings.instances.map(host => ({
				hostEquals: host,
				pathPrefix: '/@',
				pathContains: '/s:',
			})),
		});
		webNavigation.onHistoryStateUpdated.addListener(historyListener, {
			url: settings.instances.map(host => ({
				hostEquals: host,
				pathPrefix: '/@',
				pathContains: '/s:',
			})),
		});
		
		scripting.registerContentScripts([
			{
				id: 'content',
				js: ['dist/content.js'],
				matches: settings.instances.map(host => `https://${host}/*`),
				runAt: 'document_end',
				persistAcrossSessions: false,
			},
		]);
		
	}
	
}
