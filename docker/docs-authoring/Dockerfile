# Documentation authoring workbench for VI History Suite.
#
# Provides a reproducible, repo-native environment for authoring and validating
# the project documentation set (Markdown under docs/, bundled help pages, and
# the documentation gates) without depending on a contributor's host toolchain.
#
# Build from the repository root:
#
#   docker build -f docker/docs-authoring/Dockerfile -t vi-history-suite-docs-authoring:local .
#
# Run the documentation gates inside the container:
#
#   docker run --rm vi-history-suite-docs-authoring:local            # runs docs:gate (default)
#   docker run --rm vi-history-suite-docs-authoring:local npm run docs:links
#
# See docs/documentation-workbench.md for the full usage guide.

FROM node:24-bookworm-slim

WORKDIR /workspace

# Install dependencies first so editing documentation sources does not bust the
# npm layer cache. The documentation gates themselves rely only on the Node
# standard library, but the full install keeps Markdown rendering (marked) and
# the broader gate toolchain available inside the workbench.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Bring in the documentation sources and the gates that validate them.
COPY . .

# Default to the documentation gate; override the command to run other gates.
CMD ["npm", "run", "docs:gate"]
