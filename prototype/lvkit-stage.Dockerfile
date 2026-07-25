# Minimal LabVIEW-FREE lvkit staging image for the prototype relay/Ollama exercise.
# lvkit is pure-Python (reads .vi binaries directly), so staging — git blob
# extraction + `lvkit diff` — runs entirely in this Linux container; no LabVIEW,
# no host lvkit install. Build (tiny context) from the repo root:
#
#   docker build -f prototype/lvkit-stage.Dockerfile -t vihs-lvkit-stage:local prototype
#
# Then point the exercise driver at it:
#   $env:LVKIT_DOCKER_IMAGE = 'vihs-lvkit-stage:local'
#   node prototype/relayLvkitOllamaExercise.mjs
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir lvkit

# lvkit + git are now on PATH for in-container staging.
CMD ["lvkit", "--version"]
