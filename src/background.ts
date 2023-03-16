import { updateFirefoxEventHandlers } from './firefox.js';
import { initSettings } from './settings.js';

initSettings(updateFirefoxEventHandlers).catch(e => {
	console.error(e);
});
