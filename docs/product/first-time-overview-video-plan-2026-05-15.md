# First-Time Overview Video Plan

Date: 2026-05-15

## Scope

This plan keeps the Marketplace Overview video slots useful before real video
assets exist. It responds to GitLab work item `#5` and public feedback intake
issue <https://github.com/svelderrainruiz/vi-history-suite/issues/98>.

The Overview may reserve stable anchors and describe planned first-time-user
topics. It must not publish placeholder video URLs, fake thumbnails, dead media
embeds, or a maintainer control-plane dashboard.

## First Video Set

| Anchor | Topic | Asset State |
| --- | --- | --- |
| `video-install-and-prepare` | Install the extension and run `VI History: Prepare Local Runtime Settings CLI` before expecting `vihs`. | planned |
| `video-validate-runtime` | Run `vihs --validate`, read provider/year/bitness/runtime fields, and fix blocked next actions. | planned |
| `video-first-compare` | Compare a tracked VI from VS Code by selecting exactly two retained revisions and reviewing the compare preflight. | planned |
| `video-read-report-evidence` | Read the retained comparison report, comparison context, and evidence paths after Compare. | planned |
| `video-troubleshooting` | Follow-up support walkthrough for runtime validation failures and support requests. | planned |

## Publication Policy

- Keep anchors stable once they appear in the Overview.
- Publish no video link until the public target is live and reachable.
- Publish no thumbnail until the real thumbnail asset is committed or otherwise
  reachable through the chosen public media route.
- Keep the Overview concise and first-time-user focused.
- Keep Details and bundled docs as complementary user reference surfaces, not
  private release-control or runner dashboards.

## Verification

- `tests/unit/firstTimeOverviewVideoPlan.test.ts` checks the machine-readable
  plan, README Overview section, bundled Overview page, and sync source for
  stable anchors and no premature media.
- `node scripts/syncBundledDocs.js --check` keeps the bundled Overview aligned
  with the governed sync source.
