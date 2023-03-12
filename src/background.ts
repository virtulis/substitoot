import { updateFirefoxEventHandlers } from './firefox';
import { initSettings } from './settings';

initSettings(updateFirefoxEventHandlers).catch(e => {
	console.error(e);
});
