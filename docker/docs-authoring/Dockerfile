FROM node:24-bookworm

ARG LYCHEE_DOWNLOAD_URL="https://github.com/lycheeverse/lychee/releases/download/lychee-v0.24.1/lychee-x86_64-unknown-linux-musl.tar.gz"

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates curl git jq python3 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "${LYCHEE_DOWNLOAD_URL}" \
    | tar -xz --strip-components=1 -C /usr/local/bin lychee-x86_64-unknown-linux-musl/lychee \
    && chmod +x /usr/local/bin/lychee

COPY docker/docs-authoring/entrypoint.sh /usr/local/bin/vihs-docs-workbench
RUN chmod +x /usr/local/bin/vihs-docs-workbench

WORKDIR /workspace
ENTRYPOINT ["vihs-docs-workbench"]
CMD ["npm", "run", "docs:gate"]
