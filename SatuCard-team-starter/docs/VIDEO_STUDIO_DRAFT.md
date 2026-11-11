# SatuCard Video draft

Entry: `/video.html`. Branch: `draft/video-studio`. This feature is a draft and
must be reviewed before any merge to main. The homepage link exists only in this branch.

The studio creates product videos up to 30 seconds with ten editable templates,
independent image/video/text/shape/subtitle/audio layers, drag and trim on a
timeline, split, duplicate, ordering, visibility, undo/redo, keyframes and easing.
The product form updates content while retaining the montage. Media replacement
updates product layers; individual layer editing permits before/after pairs.
Three synthetic music loops, four effects, multiple audio tracks, volume/fades,
beat detection and scene snapping are available. Store styles remember the
brand name, accent, font and an uploaded logo.

## Local data and export

Projects and source blobs stay on the device in IndexedDB. One active project is
autosaved per browser profile. Download `.satuvideo.json` to keep multiple projects,
back up the current project, or transfer it with its embedded media. Exported
MP4 files do not include editable source layers. Clearing browser storage removes
local projects. No Supabase migration or AI request is required by this feature.

Image inputs: JPEG/PNG/WebP, up to 40 megapixels. Source files: 40 MB each,
100 MB total, 40 assets, 64 layers. Media must be decodable by the browser.
Imported video audio defaults to muted; enable its volume in the inspector.
Video holds its last frame if the layer extends beyond the source; audio stops
at the end of its source. Subtitle input is manual SRT/VTT, including Russian
and Kazakh. Automatic speech recognition is not included in this draft.

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
The synthetic fixture in `tests/fixtures/video-source.mp4` is a 3-second FFmpeg
test pattern and sine tone, with no third-party recording.

The pure model tests reject malformed/foreign media, unsafe identifiers, invalid
transforms and oversized content, and check template coverage, beat snapping,
keyframe interpolation and SRT/VTT parsing. Existing card-editor tests remain
part of the normal suite.

Manual release checks still required: broader devices/browsers, large user files,
extended editing sessions, additional codec combinations and user feedback on
the template designs. Production stays on the existing main branch.
