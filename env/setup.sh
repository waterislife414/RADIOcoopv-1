#!/usr/bin/env bash
# Cloud environment setup script for AI-HQ sessions (runs as root before Claude starts, from the checkouts dir).
pip install -q aider-chat || true
command -v jq >/dev/null || apt-get install -y -q jq || true
if [ -d ai-hq ]; then chmod +x ai-hq/bin/*.sh ai-hq/team/*.sh ai-hq/team/ai/*.sh; fi
