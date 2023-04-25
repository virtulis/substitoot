# Substitoot — a transparent toot fetcher

Mastodon often fails to show up-to-date context and information on posts from remote instances. This addon does that properly.

* See all the replies to any post on your home instance. Local and remote replies are now loaded in parallel so there is no extra delay.
* Interact with all the remote posts as normal. They will be fetched to your instance as needed.
* See up-to-date boost/favorite counts on posts.

It should work reliably on mainline Mastodon versions 4.0 and up, your mileage may vary for older instances or forks.

## Missing features

* The extension currently does not account for personal block lists. Implementing this is the next top priority.
* Viewing full history of user's posts is not implemented (and kind of tricky, so probably not happening soon).
* Only Mastodon is currently supported both for local and remote side (see explanation below).

## Installation

* Firefox: install the latest release from [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/substitoot/).
* Chrome: install from [Chrome Web Store](https://chrome.google.com/webstore/detail/substitoot-%E2%80%94-a-transparen/oedncfcpfcmehalbpdnekgaaldefpaef).
* Android: installing addons is possible with [Firefox Nightly](https://play.google.com/store/apps/details?id=org.mozilla.fenix) and [Fennec F-Droid](https://f-droid.org/en/packages/org.mozilla.fennec_fdroid/). It's [somewhat cumbersome](https://www.maketecheasier.com/install-addon-firefox-android/) but it does work.

Make sure to open the addon settings and type in the instances it should be active on!

## Questions and answers

### Why do you want to "access my data on all websites"?

The extension is provided both for desktop and mobile versions of Firefox, and it doesn't seem to support requesting permissions at runtime on Android.

I'll see if I can upload separate builds, then on desktop it will ask for permissions as needed. Rest assured it does not do anything on the domains you haven't listed.

Well, except for the requests to the other instances to fetch things.

### Does this support servers other than Mastodon?

Not yet. Currently, I use only the Mastodon-specific API both locally and remotely, and the responses I get from the remote instances are passed on to the Web UI mostly unchanged.

Adding support for either ActivityPub itself, or other specific software, will require a translation layer.

Pleroma/Akkoma have a similar API, so adding those is in the nearest plans. Other AP implementations will require more work, and assistance is very welcome!

Also, in any case, fetching this information requires that it be publicly accessible in the first place. Some instances do not seem to publicly provide post context in any form.

### How does this work internally?

The extension intercepts certain mastodon API HTTP requests on the selected instances.

For requests to `/statuses/ID/context` API, it blocks the response and makes a corresponding request to the origin server of the toot in question.

If a remote response is successfully received, it appends any toots that are missing. Since normaly toots will have an ID that is local to the user's instance, instead a fake one is assigned.

If you click on a toot with a fake ID, the extension will try to intercept it and fetch the toot properly this time (via your instance's search function). This only works if you are logged in.

Since version 0.5, the interception is done by injecting a wrapper around XMLHttpRequest, since that provides more flexibility.

I also attempt to gain access to the Redux store used by the web UI. Since everything is webpacked and minified this is actually the easiest way to interact with the app.

The parallel context loading is done by, first, intercepting a dispatched context request at the Redux store level, then dispatching the same identical for request a second time, figuring out which one is which when both are intercepted, and then handling them differently in parallel. The code for this looks absolutely ridiculous.

### Is it secure?

Toot content is returned from the API calls as HTML code. Content of remote toots is passed through an HTML sanitizer to prevent any potential XSS.

Additionally, Mastodon has a strict Content-Security-Policy set by default, including no inline scripts.

So, *I think it's secure enough*?

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
