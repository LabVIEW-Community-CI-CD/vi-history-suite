# Optional Vagrant

Vagrant is retained as a local human helper for maintainers who already have a
compatible Windows/LabVIEW box. It is not part of required CI and is not a
release gate.

Validate the Vagrantfile:

```bash
npm run vagrant:validate
```

Start the VM manually:

```bash
cd vagrant
vagrant up
```

Expected host prerequisites:

- Vagrant
- VirtualBox
- a registered Windows 11 plus LabVIEW 2026 box named by `VIHS_VAGRANT_BOX`

Keep any evidence produced by local Vagrant testing outside release claims
unless a future plan explicitly promotes it.
