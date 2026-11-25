#!/usr/bin/env bash
# Cloud environment setup script (runs as root from the checkouts dir before Claude starts). Aider is NOT installed here: workers run it in GitHub Actions (py3.12); it fails to build on this image's py3.13.
command -v jq >/dev/null || apt-get install -y -q jq || true
[ -d ai-hq ] || git clone -q --depth 1 -b ai-hq https://github.com/waterislife414/radiocoopv-1 ai-hq || true
[ -d ai-hq ] && chmod +x ai-hq/bin/*.sh ai-hq/team/*.sh ai-hq/team/ai/*.sh
true
