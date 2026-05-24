# Contributing

Thanks for helping VI History Suite get simpler and more useful.

## Development Loop

Use the devcontainer or Codespace path when possible:

```bash
npm ci
npm run check
npm test
npm run package
```

Then press `F5` in VS Code to launch the extension development host.

## Pull Requests

Pull requests are welcome. By opening a pull request, you agree that your
contribution is provided under the repository license, BSD0 / `0BSD`.

Keep changes focused, include tests when behavior changes, and update the
README or install notes when user-facing behavior changes.

Use GitHub Issues for bugs and feature requests. Do not open public issues for
security vulnerabilities; use [SECURITY.md](./SECURITY.md) instead.

## Optional Test Repositories

To clone the standard public fixture:

```bash
npm run public:fixture:icon-editor
```

To clone another public repository for review:

```bash
npm run public:repo:clone -- --repo-url https://github.com/<owner>/<repo>.git
```
