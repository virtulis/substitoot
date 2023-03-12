# Substitoot — a transparent toot fetcher

A Firefox extension that loads *all* replies to toots from remote instances.

## Installation

Since there is no Mozilla-signed extension available yet, you can do the hacker thing:

1. [Download the latest release .zip](https://github.com/virtulis/substitoot/releases).
2. Go to `about:debugging`.
3. Click "Load temporary addon" and select the zip file.
4. Go to `about:addons` and configure your home instance.

Note: various caching/bypass options are not yet implemented.

## TODO

- Signed Mozilla extension.
- Cache remote content.
- Bypass remote toots by followed users (unless you followed them after that toot).
- Load old toots in user profiles.
- Preload context in advance for boosted toots in your timeline.
- Chrome support?

## How it works

The extension intercepts certain mastodon API HTTP requests on the selected instances.

For requests to `/statuses/ID/context` API, it blocks the response and makes a corresponding request to the origin server of the toot in question.

If a remote response is successfully received, it appends any toots that are missing. Since normaly toots will have an ID that is local to the user's instance, instead a fake one is assigned.

If you click on a toot with a fake ID, the extension will try to intercept it and fetch the toot properly this time (via your instance's search function). This only works if you are logged in.

**Warning:** toot content is returned from the API calls as HTML code. Content of remote toots is passed through an HTML sanitizer in hopes that this will prevent any potential XSS *(in case someone really hates this extension!)*. This certainly needs a closer look (e.g. what other fields can have HTML).

### Why it works like that

* Should hopefully work with all modern Mastodon versions/forks. Could even be somewhat usable on instances you're not logged in to.
* Does not inject any scripts at all (except for a `history.replaceState` call on navigation) and does not rely on DOM events.
* Serves as a demo of what Mastodon should just be doing out of the box, seriously.
* Well I already wrote it, so might as well release and see how it goes.

## Building
	
	npm install -g pnpm # if needed
	
	pnpm install
	pnpm build
	pnpm package

## Development

Run `pnpm watch` in one terminal and `web-ext run` in another. Refer to [web-ext docs](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/).
