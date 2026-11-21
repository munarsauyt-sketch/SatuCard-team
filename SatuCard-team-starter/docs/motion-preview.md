# Motion preview

This release adapts DesignBookmark's vanilla components to SatuCard:

- [Plan Switch](https://designbookmark.com/motion-src/plan-switch/index.html): pricing period and plan selection, real prices and account checkout.
- [Morph Tooltip](https://designbookmark.com/motion-src/morph-tooltip/index.html): editor palette.
- [File Drop](https://designbookmark.com/motion-src/file-drop/index.html): the existing local image import, including actual success and failure.
- [Springy Input](https://designbookmark.com/motion-src/springy-input/index.html): auth focus and validation feedback, a trailing accent on email input and native selection and autofill.
- [Rubber Dock](https://designbookmark.com/motion-src/rubber-dock/index.html): animated highlights for text navigation and in-page controls.
- [Prompt Box](https://designbookmark.com/motion-src/prompt-box/index.html) and [Tag Input](https://designbookmark.com/motion-src/tag-input/index.html): sAI composer, bounded style instructions, existing consent and abort handling.

The shared source is https://designbookmark.com/motion-src/shared/tokens.css and motion.js.
Kokonut's Toolbar was reviewed as an alternative; its React dependencies were not added.
No reference demo autoplay, fake upload/checkout success or continuous render loop is shipped.
Spring constants are kept in the vanilla runtime: dock 640/38 and 150/16; plan/morph edges 620/36 and 190/19; digits 260/(22+2i), stagger 45ms; file zone 380/16, hover 300/26, core 420/14; input 300/20, 700/32, error 700/10; composer height 420/34, send 520/30; tags width 340/26, scale 420/16, opacity 300/26.
Frames stop when springs settle, pause in a hidden document, and respect reduced motion. No runtime dependency was added.

## Annual purchase activation

Annual prices are exactly twelve monthly prices: 18,000 / 35,880 / 59,880 / 119,880 KZT.
The order snapshots the server price and the regular monthly token allowance.
After verified payment, one transaction schedules twelve independent calendar-month grants.
Each month starts at the original anniversary in UTC (Jan 31 -> Feb 28/29 -> Mar 31).
Unused allowance does not roll over. No cron or automatic bank charge is introduced.
Existing 30-day purchases keep their original duration.

Apply database/annual-billing.sql **after** paid-access.sql, pricing-v2-upgrade.sql and free-templates-upgrade.sql, through the approved database migration workflow.
This preview does not apply SQL remotely. The API checks annualReady from get_billing_status before accepting an annual order.
Until migration, the cabinet explicitly says the annual purchase is unavailable and never silently switches the buyer to a monthly order.
Existing paid-access and payment-request flags still apply. Only an authorized administrator can confirm an exact received amount.
Do not replay an older billing migration after annual-billing.sql.
To roll back the UI, keep the migration and already-paid grants; do not delete customer periods or restore one-grant-per-order uniqueness.

## Verification

- npm test: unit/integration tests, including isolated PGlite billing, role denial, idempotency, boundaries and quota renewal.
- npm run test:motion: 320/390/768/1440, dark/light, RU/KZ, keyboard periods, file success/error, palette synchronization, PNG export, auth validation/error, sAI tags/consent/reply/cancel/error, idle and reduced motion.
- npm run test:browser: existing editor regression.
- npm run test:interface-contract: original hooks and form ownership.
- npm run test:hero and npm run build.

Browser network tests use synthetic auth and AI responses. They do not establish a real bank payment, email delivery or a live provider response.
Screenshots/results go to MOTION_OUTPUT_DIR (or the OS temporary directory).
