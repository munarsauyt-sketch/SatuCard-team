# SatuCard Video draft

Entry: `/video.html`. Branch: `draft/video-studio`. This feature is a draft and
must be reviewed before any merge to main. The homepage link exists only in this branch.

The studio creates product videos up to 30 seconds with 54 editable templates,
independent image/video/text/shape/subtitle/audio layers, drag and trim on a
timeline, split, duplicate, ordering, visibility, undo/redo, keyframes and easing.
The product form updates content while retaining the montage. Media replacement
updates product layers; individual layer editing permits before/after pairs.
Three synthetic music loops, four effects, multiple audio tracks, volume/fades,
beat detection and scene snapping are available. Store styles remember the
brand name, accent, font and an uploaded logo.

The Projects panel adds whole-scene reorder/duplicate/delete, opening variants,
layout adaptation and ZIP export in three formats. The card editor's Create Video
button transfers the actual local product photo, price, logo and seller text.
The catalog accepts a CSV with `title;price;image;brand;cta;feature1;feature2;feature3`;
image values match uploaded file names. Review thumbnails before exporting up to
ten product videos in one ZIP (200 MB output cap).

Timeline additions include actual audio waveforms, media thumbnails, edge snapping
(Alt bypasses), linked groups, layer locks, 0.25–4x playback and freeze frames.
Speed changes use audio resampling and therefore change pitch. Three transitions
blend/reveal the previous scene's last composition over 0.35 seconds. The outgoing
composition is held during that interval. Crop focus, brightness, saturation and
shadows are editable. Local background removal supports uniform backgrounds;
it preserves the source and is not semantic AI segmentation. Layout adaptation
is deterministic and does not track moving subjects.

## Local data and export

Projects and source blobs stay on the device in IndexedDB. One active project is
autosaved per browser profile. Download `.satuvideo.json` to keep multiple projects,
back up the current project, or transfer it with its embedded media. Exported
MP4 files do not include editable source layers. Clearing browser storage removes
local projects. Core editing requires no Supabase migration or AI request.

Image inputs: JPEG/PNG/WebP, up to 40 megapixels. Source files: 40 MB each,
100 MB total, 40 assets, 64 layers. Media must be decodable by the browser.
Imported video audio defaults to muted; enable its volume in the inspector.
Video holds its last frame if the layer extends beyond the source; audio stops
at the end of its source. Subtitle input is manual SRT/VTT, including Russian
and Kazakh. Microphone recording stays local and is limited to 30 seconds.
Music ducking applies to layers marked as voice. Automatic transcription and
synthetic speech have an optional, disabled integration described below.

## Optional speech connection — disabled

No paid requests were made or authorized for this implementation. The owner chose
to prepare the connection without spending. `/api/video-speech` returns 503 while
disabled. The UI indicates the disconnected state; recording and manual SRT work.

After separate approval, install `database/video-speech-pilot.sql`, create an
explicit allowance for the owner, and configure Preview-only server secrets:
`VIDEO_OPENAI_API_KEY`, `VIDEO_SPEECH_OWNER_ID` and `VIDEO_SPEECH_ENABLED=true`.
Never put keys in browser code or a project file. The migration creates no credits.
The endpoint requires a verified complete owner account and atomically reserves
one shared allowance before every provider call. Failed requests retain that
allowance. A maximum of 20 calls can be granted at once; this is a request cap,
not a provider-enforced dollar ceiling. Recheck pricing before activation.

Models are pinned to `gpt-4o-mini-tts` (400-character input, three stock voices)
and `whisper-1` (30-second mono PCM WAV, timestamped segments). Server-side mocks
test authentication, input limits and reserve-before-call behavior; no live
voice quality or Kazakh recognition claim has been verified. Sources:
https://developers.openai.com/api/docs/guides/text-to-speech and
https://developers.openai.com/api/docs/guides/speech-to-text.

Preview and MP4 share `video-renderer.js`. MP4 uses vendored Mediabunny 1.65.2
with WebCodecs AVC and AAC. HD and Full HD use a 1280/1920 pixel long edge
for 9:16, 1:1 or 16:9, at 24/30/60 fps. Chrome/Edge on a desktop and a secure
origin (HTTPS or localhost) are recommended. Unsupported codecs produce a visible
error. Exports are cancellable and do not alter the project. Memory use and
encoding speed depend on the device. No server render queue or collaboration
is implemented.

## Verification

Run `npm ci`, `npm test`, `npm run build`, then `npm run test:video`.
The browser script defaults to installed Edge; set `BROWSER_CHANNEL` if needed.
Set `VIDEO_ARTIFACTS` to choose a local output directory. It uses a local routed
origin with the site's restrictive CSP and blocks external requests.

The browser check covers template presence, RU/KZ text, edits, keyframes,
undo/redo, source-image replacement, SRT, aspect ratios, autosave and reload,
portable project restoration in another profile, actual downloadable MP4
decoding, cancellation and a 390px layout. It also imports a real H.264/AAC
fixture, enables its audio, trims with pointer input, splits the clip and
re-exports it. `VIDEO_TEST_CLIP` optionally substitutes another source file.
Expansion checks cover actual card-to-video transfer, scene edits and undo,
layout adaptation, a two-product ZIP, microphone recording, uniform-background
removal, layer locks, overlapping voice ducking and accelerated music playback.
Scene tests check transition-sound durations and subtitle timing after copies
and cuts. Changes are validated on a copy before replacing the active montage.
The synthetic fixture in `tests/fixtures/video-source.mp4` is a 3-second FFmpeg
test pattern and sine tone, with no third-party recording.

The pure model tests reject malformed/foreign media, unsafe identifiers, invalid
transforms and oversized content, and check template coverage, beat snapping,
keyframe interpolation and SRT/VTT parsing. Existing card-editor tests remain
part of the normal suite.

Manual release checks still required: broader devices/browsers, large user files,
extended editing sessions, additional codec combinations and user feedback on
the template designs. Production stays on the existing main branch.

## Color templates and help (13 November 2026)

The Bright category adds 24 templates: six distinct editable compositions in four
palettes. Orbit, stickers, postcard, ribbons, gallery and spotlight have different
geometry; linear and radial shape gradients share the preview/export renderer.
Shape color, fill, second color and gradient angle are editable in the inspector.
No remote assets, fonts or new runtime dependencies were added.

Help in the left rail opens nine contextual, keyboard-accessible tips beside the
actual controls. Each step opens its panel, scrolls its target into view and
highlights it without making the workspace inert or dimming the editor. The
first visit starts the tour once; Help and the dismissible quick-start card can
restart it. On mobile the tip sits below the highlighted control. Closing via
Escape or the close button removes the highlight and restores focus. The
detailed Russian user manual is served at `/video-guide.html`, linked from the
tips and quick-start card. It covers
editing, cards, music/voice, subtitles, formats, CSV, project backup, MP4, limits
and troubleshooting and has a print stylesheet.

Template rendering now cancels superseded filter jobs and retains the search
term when changing category. Keyboard shortcuts ignore native modal dialogs and
focused tour controls while remaining available in the rest of the workspace.
Input hardening and audit scope are documented in
`VIDEO_SECURITY_REVIEW.md`.

Additional design verification: `npm run test:video-design`. This renders all new
templates in every scene, exports/decodes one sample of each of the six layouts
(one full 12-second project and five one-second clips), writes a 24-template
contact sheet, and checks the guide and its section links at 390px and 1440px.

Contextual tour verification: `npm run test:video-tour`. At 1440×900, 1024×768,
390×844 and 700×500 it checks all nine highlighted controls, no target/tip overlap,
viewport bounds, real input/playback/download interactions and export-dialog
stacking. It also checks first-visit persistence, Help restart, Escape, manual
panel navigation, resizing and unavailable localStorage. Test requests stay local.
