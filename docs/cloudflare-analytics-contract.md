# Cloudflare Web Analytics provider contract

`site/` remains Analytics-disabled. This contract applies only to the official
Pages artifact after the deployment adapter inserts Cloudflare's standard
beacon.

## Evidence and field mapping

- Cloudflare's [beacon changelog](https://developers.cloudflare.com/web-analytics/changelog/)
  records that the 2026-09-02 beacon added OS, browser, and engine versions.
- The provider script fetched by the compatibility check maps `bi.be` to the
  rendering engine (`Blink`, `Gecko`, or `WebKit`), `bi.bev` to its version,
  `bi.bv` to the browser version, and `bi.ov` to the OS-version bucket derived
  from user agent/client hints.
- The same script creates `pageloadId` with `crypto.randomUUID()` when its page
  bootstrap starts. It is a page-load correlation value, not an app-stored
  user identifier. The check records only a distinct-count across load events.

The source does not pin, copy, or hash third-party beacon bytes. A new or
unknown field fails the validator until it has an equivalent evidence review.

## Compatibility check boundary

`check-cloudflare-analytics-compatibility.mjs` serves a prepared artifact on a
random loopback port, loads the provider beacon, and intercepts every RUM
request with `204`. It uses fictional input, photo, import/export, encrypted
draft, reload, and leave steps. It reports only bounded metadata: HTTP status,
field names, event types, and counts. It never records a token, payload value,
URL query, or page-load ID.

Headless Chromium did not emit a native hidden-page signal after navigation, so
the check explicitly simulates `visibilitychange` while the fictional editor
state is loaded. The event-3 observation is therefore simulated lifecycle
trigger plus the actual downloaded provider beacon. A RUM provider receipt is
not checked because every RUM request is intercepted.
