# Coordinate-Frames Preview Export — Emitter Spec (VHS-REQ-703.9)

This document specifies the **`lvr-coordinate-frames` JSON island** that the
LabVIEW preview export (`resources/labview-cli-operations/PrintToSingleFileHtml`)
must embed in its rendered HTML to unblock **pixel-precise correlation region
overlays** (epic #2262).

The **consumer side already ships** and is unchanged by this work:
- `extractEmbeddedCoordinateFramesJson(html)` pulls the island text out of the HTML.
- `buildFramesModelFromCoordinateJson(json)` normalizes it into the frames model.
- `assessCoordinateFramesIsland(html)` (VHS-REQ-703.9) grades a render against this
  spec and is the automatic acceptance gate.

Authoring the emitter is **LabVIEW-IDE block-diagram work** on the operation VIs;
this spec is the exact target so it can be authored and verified deterministically.

## Where the island goes

Emit exactly one inert JSON script island in the rendered HTML document. It is
never executed — the consumer parses it and re-serializes it into the viewer's
own nonce-guarded island, and it rides inside the content-addressed render cache
unchanged (cold == warm), so **no cache-format change is needed**.

```html
<script type="application/json" id="lvr-coordinate-frames">
[ ... frames JSON ... ]
</script>
```

- The `id` MUST be exactly `lvr-coordinate-frames`.
- The `type` MUST be exactly `application/json`.
- The body MUST be valid JSON (see below). Do not HTML-escape the JSON; keep it
  literal inside the script element.

## Payload shape

Top level is **either** a bare array of frames **or** an object with a
`frames` (or `Frames`) array:

```json
{ "frames": [ <frame>, <frame>, ... ] }
```

Each `<frame>` is one image with its rectangle and its child frames. Field names
are tolerant (any one of the listed variants is accepted):

| Concept        | Preferred key | Also accepted                          | Notes |
| -------------- | ------------- | -------------------------------------- | ----- |
| Inline image   | `Image`       | `Base64 Image`, `base64`, `image`      | base64 PNG; a bare base64 string is auto-prefixed with `data:image/png;base64,`. A `data:` URI is passed through. |
| Rectangle      | `Position`    | `position`, `Cluster`, `cluster`       | object with the fields below |
| ↳ Left / Top   | `Left`/`Top`  | `left`/`top`                           | integers |
| ↳ Size         | `Width`/`Height` | `width`/`height`, or `Right`/`Bottom` (`Right-Left`, `Bottom-Top`) | integers |
| Child frames   | `Children`    | `Child Indices`, `children`            | array of **integer indices into the same frames array** |
| Selector label | `Label`       | `label`, `Name`, `name`                | optional (e.g. `"True"`, `"0"`) |

### Geometry rules (load-bearing)

- **Rectangles are parent-relative.** A child frame's `Left`/`Top` are relative
  to the **owning** frame's top-left, not the stage origin. The root frame's rect
  is relative to the stage. The viewer places a child at `rect.left`/`rect.top`
  inside its parent without subtracting the parent offset, so emit
  parent-relative geometry.
- **Real geometry is required.** At least one frame must have a rectangle with
  **positive width AND height** — the whole point of the coordinate export. A
  render whose frames are all-zero rectangles is rejected (`no-frame-geometry`).
- **At least one frame must carry an image** (`no-frame-images` otherwise).
- **Sibling frames sharing the same `Position` rectangle are the cases of ONE
  structure** (LabVIEW paints every case at the structure's fixed border). The
  viewer groups them and pages the cases in place.
- **Children reference by index** into the same array; self-references,
  out-of-range, and duplicate indices are dropped by the consumer, but the
  emitter should not produce them.
- The **root frame** is the one no other frame lists as a child.

### Minimal accepted example

```json
[
  { "Image": "<base64 PNG>", "Position": { "Left": 0, "Top": 0, "Width": 640, "Height": 480 }, "Children": [1] },
  { "Image": "<base64 PNG>", "Position": { "Left": 48, "Top": 64, "Width": 220, "Height": 140 }, "Label": "True" }
]
```

## Acceptance

A render is **accepted** by `assessCoordinateFramesIsland(html)` when ALL hold:
1. the `lvr-coordinate-frames` island is present,
2. its JSON parses into a non-empty frames array,
3. ≥1 frame has positive width AND height, and
4. ≥1 frame carries a non-empty image.

Otherwise it is **rejected** with a stable issue id: `island-absent`,
`island-unparseable`, `frames-empty`, `no-frame-geometry`, or `no-frame-images`.

### Verifying a real render

Render a real VI on this host's LabVIEW and grade it with the maintainer driver
(host or docker), which composes the shipped render with the acceptance predicate:

```bash
npm run compile
node vagrant/verify-coordinate-frames-emitter.cjs \
  --sample-vi /path/to/Some.vi --provider host --labview-version 2026
```

- **Today** (no emitter authored): the driver reports `REJECTED … island-absent`.
- **After** the operation emits the island: the driver reports `ACCEPTED … N frame(s), M with geometry`.

Once the driver PASSes on a real render, the pixel-precise region-overlay
iteration (ITER 5) can consume the frames model to place per-change callouts on
the side-by-side artifact.
