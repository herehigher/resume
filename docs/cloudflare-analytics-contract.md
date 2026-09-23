# Hosting-managed Cloudflare Web Analytics contract

The repository source, clones, and forks contain no Analytics beacon. Cloudflare
Pages injects Cloudflare Web Analytics at the delivery layer on the official
hosted site. The application does not manage the provider script or include
resume input, photos, JSON, or drafts in Analytics requests.

## Evidence and field mapping

- Cloudflare's [beacon changelog](https://developers.cloudflare.com/web-analytics/changelog/)
  records that the 2026-09-02 beacon added OS, browser, and engine versions.
- The provider script observed by the compatibility check maps `bi.be` to the
  rendering engine (`Blink`, `Gecko`, or `WebKit`), `bi.bev` to its version,
  `bi.bv` to the browser version, and `bi.ov` to the OS-version bucket derived
  from user agent/client hints.
- The same script creates `pageloadId` with `crypto.randomUUID()` when its page
  bootstrap starts. It is a page-load correlation value, not an app-stored
  user identifier. The check records only a distinct-count across load events.

The application does not pin, copy, or hash third-party beacon bytes. Provider
behavior can change independently under Cloudflare's service terms.

## Compatibility check boundary

The source and browser acceptance tests verify that the application does not
send fictional resume canaries in its requests. They do not validate Cloudflare
Pages injection, provider-side receipt, or provider changes.
