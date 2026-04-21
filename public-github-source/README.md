# VI History Suite

`vi-history-suite` is a Visual Studio Code extension for reviewing LabVIEW VI
history in Git repositories.

## Install And Use

If you installed the extension from the VS Code Marketplace or from a VSIX,
start here. You do not need to fork this repo or choose a branch to use the
extension locally.

In Windows PowerShell, run:

```powershell
irm https://gitlab.com/svelderrainruiz/vi-history-suite/-/raw/develop/scripts/install-vihs-extension.ps1 | iex
```

Then:

1. Press `Enter` to keep the current settings or change provider, LabVIEW
   year, and bitness with the keyboard.
2. Run `vihs --validate`.
3. Open a trusted Git repo containing an eligible LabVIEW VI.
4. Run `VI History`.
5. Select exactly two retained revisions with the commit checkboxes.
6. Review the explicit compare preflight.
7. Choose `Compare`.

Installed-user help:

- Home:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki`
- Install and release:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Install-And-Release`
- User workflow:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/User-Workflow`
- Comparison reports and dashboard review:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Comparison-Reports-And-Dashboard-Review`
- support and troubleshooting:
  [SUPPORT.md](./SUPPORT.md)

## Supported Today

- exact released `main` / Marketplace `1.2.2`: Docker-only and x64-only
- maintained public candidate on `develop`: Windows PowerShell bootstrap plus
  `vihs`, with default `host/windows/2026/x64`
- host Windows LabVIEW years `2020` through `2026` are selectable when they
  are installed locally
- `docker/windows` is supported for `2026` `x64` only
- Docker years before `2026` are unsupported
- `docker/linux` for `2026` and `host/linux` are not currently implemented
- blocked or unsupported paths fail closed with explicit next-step guidance

## Report A Problem Or Request Support

Use the public GitHub issue templates when install, `vihs`, validation, or
compare do not behave as expected:

- issue chooser:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose`
- bug report:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=bug-report.yml`
- LabVIEW version support request:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=labview-version-support.yml`
- feature request:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=feature-request.yml`

Useful issue facts:

- extension version and VS Code version
- whether the problem happened during the install bootstrap, `vihs`,
  `vihs --validate`, or compare
- provider, LabVIEW year, and bitness
- the current `vihs --validate` output
- exact reproduction steps and the current vs expected result

## Need Source Evaluation Or Contribution?

Installed users can stop above. Source evaluation and contribution are kept
separate:

- source install and evaluation guide:
  [INSTALL.md](./INSTALL.md)
- contribution guide:
  [CONTRIBUTING.md](./CONTRIBUTING.md)
- first-time source evaluation assumes a brand new fork and a brand new
  Codespace
- generic public repo clone helper:
  `npm run public:repo:clone`
- first-time public sample quickstart:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Fork-Codespace-Quickstart`
- review any public repo:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Review-Public-LabVIEW-VI-Changes`
- refresh an existing Codespace:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Refresh-Codespace-Repositories`
- public repo examples include Hampel Software Engineering material through the
  generic repo-review path

Use `main` when you only need the latest exact released source. Use `develop`
when you are evaluating the next public candidate.
