# Fast VS Code Loop

## Purpose

Reduce friction between code changes and live extension checks by using a
dedicated Extension Development Host as the default inner loop, while keeping
VSIX packaging as a milestone proof lane instead of the normal iteration path.

## Recommended Loop

Use two terminals and one disposable VS Code development host:

1. Keep TypeScript compiling continuously:

   ```bash
   npm run dev:watch
   ```

2. Launch a dedicated Extension Development Host:

   ```bash
   npm run dev:host
   ```

3. After code changes land, switch to the dev host and run:

   ```text
   Developer: Reload Window
   ```

This is the fast inner loop. It avoids packaging and reinstalling a VSIX after
every product slice.

## Workspace Modes

### Reusable Fixture Workspace

Default `npm run dev:host` behavior prepares and opens a bounded reusable Git
workspace with content-detected VI fixtures.

You can prepare that workspace without launching VS Code:

```bash
npm run dev:workspace
```

### Real Repository Workspace

To exercise the extension against a real repository, pass an explicit path:

```bash
npm run dev:host -- --workspace-path "C:\dev\labview-icon-editor"
```

This keeps the extension-development loop fast while still letting the human
consumer validate behavior on a real LabVIEW history repository.

## Extension Modes

### Direct Mode

Default mode points the Extension Development Host directly at the repo root.
This is the fastest option because `tsc --watch` updates the same `out/`
directory that the dev host reloads.

### Staged Mode

If direct WSL-path loading is not usable on the local machine, staged mode
copies `package.json` and `out/` into a Windows-local extension directory
before launch:

```bash
npm run dev:host -- --stage-extension
```

Use staged mode only when direct mode is not workable, because staged mode adds
copy overhead to the loop.

## Milestone Proof Lane

Use VSIX packaging only when the slice needs an installable artifact for a
human-proof or release checkpoint:

```bash
npm run preview:refresh
```

That command refreshes the preview VSIX in:

- `preview-evidence/`
- `C:\Users\sveld\Downloads\`

Do not use preview refresh as the default inner loop.

## Developer Guidance

- Keep one normal VS Code window for real work and one disposable Extension
  Development Host for extension checks.
- Keep the active human repro narrow: one repo, one VI, one command, one
  question.
- Close the normal Windows VS Code instance only when the governed
  extension-host integration lane needs to run for real.
