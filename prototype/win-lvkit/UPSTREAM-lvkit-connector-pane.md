# lvkit: connector-pane resolution gap for called SubVIs (born-from-scratch generate)

Ready-to-file upstream note for `lvkit` (LabVIEW-free VI parser). Drafted from the
vi-history-suite prototype `fullmode-depth-recovery` investigation (issue #2373
follow-up). This is **not** a vi-history-suite bug — both legs (Linux LabVIEW-free
and Windows real-LabVIEW) hit the same ceiling regardless of load-mode.

## Summary

`lvkit generate <vi> --placeholder-on-unresolved` leaves **exactly one residual
`.error.py` module** for certain **called** SubVIs / nodes, even when:

- the SubVI is **present** in the search path and generates **clean standalone**, and
- `--load-mode full` is used (so the whole dependency tree is loaded), and
- (Windows) real `--vilib` is provided.

The message is: `# ERROR: Terminal resolution needed for project VI '<Name>'.`

The blocked constructs, not fixable by any flag we tried, fall into three classes.

## Environment

- lvkit 0.5.2 (Windows via `pip`, on `nationalinstruments/labview:2026q1patch2-windows`;
  and Linux container leg).
- Corpora: `SerialPortNuggets` (26 first-commit VIs @`06939af`), `labview-icon-editor`
  (4 first-commit VIs @`fe98acb`).

## Minimal reproduction

```
# stage the born-commit subtree into a WRITABLE dir (lvkit writes .lvkit/cache
# next to the loaded VIs; a read-only tree fails with WinError 5 / EACCES):
git -C <repo> archive -o stage.tar <born-sha> "<top-dir>"
mkdir stage && tar -xf stage.tar -C stage

# minimal or full; with or without --vilib -- residual is identical for the
# constructs below:
lvkit generate "stage/<vi-path>" \
  --load-mode {minimal|full} \
  --placeholder-on-unresolved \
  --search-path stage \
  [--vilib "<LabVIEW>/vi.lib"]     # Windows only
```

Example: `lvkit generate "stage/ASCII/Actor/Request Data.vi" --load-mode full
--search-path stage --placeholder-on-unresolved` → clean modules for the whole
tree **except** `queue_manager.error.py` (`Terminal resolution needed for project
VI 'Queue Manager.vi'`), although `Queue Manager.vi` is present and generates
clean when passed directly.

## Residual classes

**Class A — present plain-`.vi` project SubVIs, unresolved only when CALLED.**
Not malleable (`.vim`/`.vit` checked), present in the search path, generate clean
standalone, but their connector pane can't be resolved as a callee:

| SubVI | corpus / role |
|---|---|
| `Queue Manager.vi` | SerialPortNuggets Actor framework (ASCII + Binary) |
| `Binary Actor.vi` | SerialPortNuggets Actor framework |
| `CoordinatesCorrection.vi` | icon-editor `.../NIIconEditor/Miscellaneous/` |
| `Defer_FP_Updates.vi` | icon-editor `.../Miscellaneous/Def FP Updates/` |

Common trait: Actor-framework / dynamic-dispatch style callees.

**Class B — the `Call By Reference` primitive node.** Not a VI at all (icon-editor
`lv_icon.vi`); a dynamic call node lvkit reports as needing terminal resolution.

**Class C — vi.lib VIs reached only TRANSITIVELY.** `VISA Configure Serial Port`
and `Elapsed Time` resolve via `--vilib` when called **directly** (e.g. `ASCII
CMD-Response Instrument.vi` generates clean, `visa_configure_serial_port_instr.py`,
22 lines) but NOT when reached through a project-SubVI chain
(`ASCII Actor.vi` → `Write to Port.vi` → VISA). (They live inside `.llb`, which
lvkit's `--vilib` mechanism reads; a loose-file glob does not — so this is a
transitive-resolution gap, not an absence.)

## Load-mode / vi.lib data (3 tiers)

Setup held constant (writable-stage + `--search-path` + `--placeholder-on-unresolved`);
only the named variable changes.

| tier | configuration | SPN (of 26) | icon-editor (of 4) |
|---|---|---|---|
| 1 | LabVIEW-free, self-contained | 8 clean | 0 clean |
| 2 | + real vi.lib (`--vilib`, Windows), minimal | 16 clean | 0 clean |
| 2f | + real vi.lib, `--load-mode full` | 17 clean | 0 clean |
| 3 | connector-pane ceiling neither leg crosses | 9 residual | 4 residual |

- `--load-mode full` alone: **+0** clean LabVIEW-free, **+1** clean with vi.lib
  (`Binary Instrument.vi` — a full-depth residual that only real vi.lib closes).
- The LabVIEW-free recovery lever is **writable-staging + `--search-path`** (5→8/26,
  +3), **not** load-mode.
- Tier-3 is the ceiling requested here: connector-pane resolution for Class A/B/C
  callees, independent of load-mode.

## Ask

Improve LabVIEW-free connector-pane resolution for **called** SubVIs so a callee
that generates clean standalone also resolves as a dependency — specifically for
Actor-framework/dynamic-dispatch VIs, the `Call By Reference` node, and
transitively-reached `--vilib` VIs. Until then, `--placeholder-on-unresolved`
correctly yields a rich multi-module generate with one honest inline placeholder,
which is the posture vi-history-suite ships.
