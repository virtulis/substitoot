import { host } from './host.js';
import { getSettings } from '../settings.js';

export async function updateContentScript() {
	
	const { instances } = getSettings();
	const { scripting } = host;
	
	const ex = await scripting.getRegisteredContentScripts({ ids: ['content'] });
	
	if (!instances.length) {
		if (ex.length) await scripting.unregisterContentScripts({ ids: ['content'] });
		return;
	}
	
	if (!ex.length) await scripting.registerContentScripts([
		{
			id: 'content',
			js: ['dist/content.js'],
			matches: getSettings().instances.map(host => `https://${host}/*`),
			runAt: 'document_end',
			persistAcrossSessions: false,
		},
	]);
	else await scripting.updateContentScripts([
		{
			id: 'content',
			matches: getSettings().instances.map(host => `https://${host}/*`),
		},
	]);
	
}
