ARG BASE_IMAGE=nationalinstruments/labview:2026q1-linux
FROM ${BASE_IMAGE}

ARG BASE_IMAGE
ARG NODE_MAJOR=24

LABEL org.opencontainers.image.title="vi-history-suite-github-linux-dashboard-benchmark"
LABEL org.opencontainers.image.description="GitHub-hosted Linux dashboard benchmark image for vi-history-suite"
LABEL io.vihs.base-image="${BASE_IMAGE}"
LABEL io.vihs.runtime-plane="github-linux-dashboard-benchmark"

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    coreutils \
    curl \
    git \
    jq \
    procps \
    unzip \
    xauth \
    xvfb \
  && curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    nodejs \
  && npm install --global npm@latest \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

CMD ["bash", "-lc", "sleep infinity"]
