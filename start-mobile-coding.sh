#!/usr/bin/env bash
# Usage: ./start-mobile-coding.sh --opencode | --aider
set -e
cd "$(dirname "$0")"
[ -f .env.mobile ] && set -a && . ./.env.mobile && set +a
IP=$(tailscale ip -4 2>/dev/null | head -1); IP=${IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}
case "$1" in
  --opencode)
    echo "Open on phone: http://$IP:4096"
    exec opencode web --hostname 0.0.0.0 --port 4096 ;;
  --aider)
    echo "Open on phone: http://$IP:8501"
    export STREAMLIT_SERVER_ADDRESS=0.0.0.0 STREAMLIT_SERVER_PORT=8501
    exec aider --browser --model "${AIDER_MODEL:-gemini/gemini-2.5-flash}" --architect ;;
  *) echo "Usage: $0 --opencode | --aider"; exit 1 ;;
esac
