# Video studio review — 13 November 2026

Scope: PR #32 at starting commit `1c0325c`, its browser modules, the new speech
API/migration, shared account/body helpers and the public build boundary. This is
a manual source review with local regression and browser checks. Strix is not
installed; no Strix scan, external production pentest, paid speech call or live
database migration was performed. This is not a claim of complete security.

## Findings and changes

### Imported project bypassed image resource limits (medium)

Normal uploads checked a decoded image's 40-megapixel limit, whereas portable
projects and `MediaStore.image()` did not. An image in a shared project could
reach the decoder without that bound and consume excessive browser memory.
The original `unpackProject()` also accepted media whose MIME kind disagreed
with the project's asset kind. This mismatch was not evidence of script execution.

The import boundary now checks aggregate bytes, individual sizes, duplicate or
reserved source IDs, MIME-to-asset consistency and JPEG/PNG/WebP headers before
image decoding. Dimensions are checked again after decoding. The same image
header check applies to normal imports and media preparation, including card
transfers. Save/restore/pack boundaries enforce the file and byte invariants.
Base64 length is bounded before allocating its decoded byte array.

Reproduction: a portable project with an additional `image` asset and a PNG
header declaring 10000×5000 pixels was accepted by the original unpacker and
is rejected by the new one before replacing the active draft. An `image` asset
with an embedded `audio/wav` source was likewise accepted before and rejected
after. The header case proves validation bypass; no browser crash is claimed.

### Concurrent uploads could bypass quotas (low; integrity/resource handling)

Asset count and total bytes were read before asynchronous file inspection.
Another import could finish while those values were stale. The second import
could exceed a cap and mutate the active project before validation failed.

Limits are now re-read immediately before each synchronous insertion, without
an intervening await. Generated/recorded sources use the same quota helper,
including the 40 MB individual cap. Persistence independently verifies the
media bundle. Regression tests model another import committing during the gap.

### Superseded template renders and modal shortcuts (functional)

Old thumbnail jobs could append to a newly selected filter; changing categories
also discarded search filtering. Template jobs now have generations, a separate
demo-only media store and combined category/search matching. Editor keyboard
shortcuts ignore native modal dialogs, preventing edits behind batch export.
The updated contextual help is nonmodal: editor shortcuts remain available
outside its controls, and a focused tip does not trigger playback by accident.

Layer links/roles/booleans and the new gradient fields also have explicit
validation. User text is rendered through textContent/canvas; static innerHTML
templates do not interpolate user input. IDs used in selectors are restricted.

## Security checks

- Bearer authentication is verified with Supabase. Tests cover missing/malformed
  authentication, non-owner, unconfirmed email and incomplete owner profile.
- Speech validates action/language, bounded text and canonical WAV input before
  reservation. Streamed body limits apply without Content-Length. The provider
  destination and model are fixed. Server secrets are not returned in errors.
- The optional migration enables RLS, denies table/function access to anon and
  authenticated roles, creates no allowance and permits only service-role RPC
  execution. Local PostgreSQL-compatible checks submitted 30 queued calls against
  20 credits: exactly 20 succeeded and the balance stopped at zero. This validates
  SQL behavior locally, not an applied Supabase configuration or multi-node load.
- Paid-provider failures retain the consumed allowance. Disabled speech remains
  disabled; all provider tests use mocks.
- Browser checks inject HTML-like product text, reject an oversized imported
  project without replacing the current draft, combine rapid filters/search,
  exercise help/keyboard behavior, reload/transfer projects and decode MP4 output.
- Browser test requests are restricted to local test origins. No external speech
  or media URLs are loaded during verification. CSP remains restrictive.
- The public build omits API sources, lib, database, docs, tests, scripts and
  configuration, including the new review document.
- npm's install-time audit reported zero known vulnerabilities among the 43
  installed packages. This does not cover vendored code or unknown defects.
- The vendored Mediabunny file matches the official `mediabunny@1.65.2` package's
  `dist/bundles/mediabunny.min.mjs` after CRLF-to-LF normalization. SHA-256 of that
  normalized text: `08149edcc8cf980da65d94a0a54a8fc0fa85a65f89b66f55c906f33618363919`.
  Package: https://www.npmjs.com/package/mediabunny/v/1.65.2.
- A targeted tracked-source scan found no private-key blocks or recognizable
  OpenAI, Supabase secret or GitHub token patterns outside test/vendor content.
  This is heuristic and cannot establish absence of every credential.

## Validation commands

`npm test` covers all existing tests and the new media, speech and SQL regression
cases. `npm run build` checks the production artifact. `npm run test:browser`
checks the card editor at 390px and 1440px. `npm run test:video` exercises the video
workflow and `npm run test:video-design` checks all new designs and representative
MP4 exports. Browser checks use installed Edge and local routed origins.

## Remaining release checks

No critical/high issue was confirmed in the inspected PR paths. This does not
certify the entire product or live infrastructure. Other existing API routes,
production Supabase policies/secrets, account takeover outside this workflow,
infrastructure permissions and sustained adversarial load were outside scope.

Large audio/video files can still consume substantial decoded memory even within
compressed-byte limits; test representative long sources on lower-memory devices.
Browser codec implementations, additional mobile browsers, long editing sessions,
screen readers and malformed codec corpora need broader release testing.
The draft remains separate from main; production publishing and enabling paid
speech require their own release decision.
