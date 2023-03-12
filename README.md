# Substitoot — a transparent toot fetcher

A Firefox extension that loads *all* replies to toots from remote instances.

## Warning: It's really bad

**Experimental, invasive, potentially unsafe. Probably a bad idea.** Please do not use if you don't understand what the things listed below mean:

* Does not have any configuration and runs on every domain always. This is the only problem that can easily be fixed, I'm just lazy at the moment.
* Intercepts *all* HTTP requests that look like Mastodon API requests. Specifically `/api/*/statuses/*`. Could? break some unrelated APIs but hopefully won't (falls back to not doing anything if any error occurs).
* Blocks any `/context` requests for toots from remote instance from completing, makes a corresponding request to the remote instance and merges the two responses. This can turn out to be a useless waste of time.
* Generates ugly-ass temporary "local" status IDs in the process, then fetches properly via search *if* you navigate to them.
* Returns `content` HTML from the *remote* server as if it were local. Does run it through a sanitizer though. **Do not use this extension if this does *not* seem scary to you.**
* Relies on Firefox-specific webRequest API, don't even hope to run this in Chrome/Edge/etc.

**Ok but why?**

* Should hopefully work with all modern Mastodon versions/forks. Could even be somewhat usable on instances you're not logged in to.
* Does not inject any scripts at all (except for a `history.replaceState` call on navigation) and does not rely on DOM events.
* Serves as a demo of what Mastodon should just be doing out of the box, seriously.
* Well I already wrote it, so might as well release and see how it goes.
