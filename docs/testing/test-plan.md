# Test Plan

## Required Lightweight CI

Run these on pull requests and pushes to `main`:

```bash
npm ci
npm run check
npm test
npm run package
```

## Devcontainer Human Check

Inside the devcontainer or Codespace:

1. Wait for `postCreateCommand` to finish.
2. Run `npm run check`.
3. Run `npm test`.
4. Press `F5` and confirm the extension host starts.
5. Open a trusted Git repository with a tracked LabVIEW file and open
   `VI History`.

## Optional Vagrant Check

When Vagrant and a compatible Windows/LabVIEW box are already available:

```bash
npm run vagrant:validate
cd vagrant
vagrant up
```

Vagrant evidence is useful local confidence only. It is not required for a
release.
