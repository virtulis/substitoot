import { provideSettings, Settings } from '../settings.js';
import { Maybe } from '../types.js';

export async function updateChromeConfig() {
	
	const { scripting, storage } = chrome;
	
	const lastSettings = await storage.sync.get('lastSettings').then(res => res.lastSettings as Maybe<Partial<Settings>>);
	
	const { instances } = await provideSettings();
	
	if (instances.sort().join(', ') != lastSettings?.instances?.sort().join(', ')) {
		
		const matches = instances.map(host => `https://${host}/*`);
		
		const ids = ['content'];
		const [ex] = await scripting.getRegisteredContentScripts({ ids });
		if (ex) await scripting.unregisterContentScripts({ ids });
		
		if (matches.length) await scripting.registerContentScripts([{
			id: 'content',
			js: ['dist/content.js'],
			matches: instances.map(host => `https://${host}/*`),
			runAt: 'document_end',
			persistAcrossSessions: true,
		}]);
		
	}
	
	await storage.sync.set({ lastSettings });
	
}
