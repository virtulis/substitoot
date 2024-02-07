# Substitoot — a transparent toot fetcher

Mastodon often fails to show up-to-date context and information on posts from remote instances. This addon does that properly.

* See all the replies to any post on your home instance. Local and remote replies are now loaded in parallel, so there is no extra delay.
* Interact with all the remote posts as normal. They will be fetched to your instance as needed.
* See up-to-date boost/favorite counts on posts.
* See the *actual* last 20 posts in any user's profile (page refresh may be needed). 

It should work reliably on mainline Mastodon versions 4.0 and up, your mileage may vary for older instances or forks.

## Missing features

* The extension currently does not account for personal block lists.
* Only Mastodon is supported as the home instance.

## Installation

* Firefox: install the latest release from [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/substitoot/).
* Chrome: install from [Chrome Web Store](https://chrome.google.com/webstore/detail/substitoot-%E2%80%94-a-transparen/oedncfcpfcmehalbpdnekgaaldefpaef).
* Android: it should now be possible to install on Firefox on Android by directly going to [the addon page](https://addons.mozilla.org/firefox/addon/substitoot/).

Make sure to open the addon settings and type in the instances it should be active on!

## Questions and answers

### It doesn't seem to do anything!

Please check that you have entered the instance domain name in the extension settings, and that it doesn't complain about permissions. If upgrading, you might need to delete the extension completely, restart the browser and install again.

If nothing helps, please report a bug. Thanks!

### Does this support servers other than Mastodon?

It can fetch statuses and contexts from Akkoma/Pleroma and most Misskey/FireFish/Sharkey/IceShrimp/etc instances, better compatibility is a work in progress.

However, it can only run on Mastodon as a home server, and has been tested to work on vanilla and Glitch editions on current development version (4.3.0).

### How does this work internally?

The extension intercepts the requests and responses to a status context and a user status list, then fetches the same from the origin server and uses the home instance's search function to fetch the missing replies/posts one by one.

The fetched replies are then fed into the existing streaming websocket handler of the web app which renders them where needed (hopefully).

A similar mechanism is used to update the status counts to those from the origin server.

Before 0.7.0 the mechanism was much more convoluted and returned fake "local" copies of remote statuses, this is no longer the case.

### Is it secure?

The extension makes HTTPS requests directly to the instance of the viewed post or user, so they will see your IP address, but no other info is shared.

As of 0.7.0, all content displayed in the web app is passed through the home server, so it is no less secure than normal Mastodon usage.

## Building
	
	npm install -g pnpm # if needed
	
	pnpm install
	
	# build and package for Firefox (Manifest v2)
	pnpm package-mv2

	# build and package for Chrome (Manifest v3)
	pnpm package-mv2

## Development

[Trying it out — Mozilla.](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension#trying_it_out)

The extension is written in TypeScript and needs compiling and bundling.

Run `pnpm watch` in one terminal and `web-ext run` in another.

Refer to [web-ext docs](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/).
