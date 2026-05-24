# Development

Use the devcontainer or Codespace as the primary development environment.

```bash
npm run check
npm test
npm run package
```

After `postStartCommand` completes (runs `npm run compile`), select the
`Run VI History Suite` launch configuration from the Run and Debug view and
press `F5`. A successful first launch opens an Extension Development Host
window after the compile/preLaunch step completes.

Useful commands:

```bash
npm run dev:watch
npm run public:fixture:icon-editor
npm run public:repo:clone -- --repo-url https://github.com/<owner>/<repo>.git
```

Maintainer release, runner, and validation operations are documented in
[docs/maintainer-operations.md](./maintainer-operations.md).
