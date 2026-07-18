# Playwright viewer interaction harness (maintainer, in-guest)

This directory holds a **maintainer-run** Playwright harness for the interactive
block-diagram preview viewer (VHS-REQ-659). It is **not** a hosted-CI gate and is
**not** part of `npm test`: `vitest.config.ts` only includes `tests/unit/**`, and
Playwright is intentionally kept out of the repo's root `package.json` so hosted
CI never downloads a browser.

## What it does

`viPreviewViewerInteraction.cjs` builds the viewer document with the **shipped**
pure builder (`buildViPreviewFramesViewerHtml` from the compiled `out/`), loads it
in a real headless Chromium, and asserts the DOM interactions that jsdom-based
unit tests cannot exercise:

- the nonce-scoped inline script actually executes under the viewer CSP;
- the `◀ n/N ▶` selector pages a Case structure's cases in place;
- `ArrowLeft`/`ArrowRight` page the last-touched structure;
- exactly one case layer is visible at a time;
- the Fit control renders;
- no uncaught page errors occur.

The frames model is synthetic, so **no LabVIEW, Docker, or VS Code host is
required** — only a browser.

## Running it (in the Vagrant guest or any host with a browser)

```sh
# 1. Compile so the harness can load the shipped builder from out/.
npm run compile

# 2. Install Playwright in THIS environment only (never committed to the repo's
#    root package.json — keeps hosted CI browser-free).
npm i -D playwright
npx playwright install chromium

# 3. Run the harness from the repo root.
node vagrant/playwright/viPreviewViewerInteraction.cjs
```

Exit code `0` means all interaction assertions passed; nonzero prints the
failing assertion(s).

## Why it lives under `vagrant/`

Like the other maintainer evidence drivers, this exercises behavior that needs a
real runtime (here, a browser) rather than the deterministic unit harness. Keeping
it under `vagrant/` (alongside the guest tooling) and out of `npm test` preserves
the browser-free, deterministic hosted-CI contract while still giving maintainers
a real-browser proof of the viewer's interactivity.
