import { getSettings } from './settings.js';
import { reportAndNull } from './util.js';
import { anyBrowser } from './browsers/any.js';
import { Status } from './types.js';

export const lastNoticeVersion = 7_00;
const lastNoticeUrl = 'https://loud.computer/@virtulis/111885004711102292';

export async function displayNotice() {
	const settings = getSettings();
	const instance = settings.instances[0];
	if (!instance) return;
	const searchRes = await fetch(`https://${instance}/api/v2/search?q=${lastNoticeUrl}&resolve=true&limit=1&type=statuses`).then(res => res.json()).catch(reportAndNull);
	console.log('notice search', searchRes);
	if (!searchRes || !searchRes.statuses.length) return;
	const status: Status = searchRes.statuses[0];
	await anyBrowser.tabs.create({
		active: true,
		url: `https://${instance}/@${status.account.acct}/${status.id}`,
	});
}
