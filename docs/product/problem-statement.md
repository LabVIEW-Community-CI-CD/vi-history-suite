# Problem Statement

The repository currently has a legal shell but no product baseline. The user has
already defined a concrete product direction: a VS Code extension that can
identify LabVIEW VIs by content and expose a meaningful history review flow in
Git repositories.

If the repo starts with only code scaffolding, the product intent will drift.
If it starts with only documents, the extension will remain theoretical.

This baseline therefore has to do both:

- capture the product and engineering intent from the research paper
- implement the smallest useful extension skeleton that already reflects the
  intended command surface and domain model

## Non-Goals

- Reusing `comparevi-history` or `compare-vi-cli-action` as runtime
  dependencies
- Solving LabVIEW comparison report generation in the first slice
- Publishing a Marketplace-ready extension before local developer value exists

