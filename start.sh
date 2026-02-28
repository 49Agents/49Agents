#!/bin/bash
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}49Agents — Setup${NC}"
echo "──────────────────────────────"
echo ""

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
(cd cloud && npm install --silent)
(cd agent && npm install --silent)
echo -e "${GREEN}Done.${NC}"
echo ""

# ── Setup type ──────────────────────────────────────────────
echo "How are you setting this up?"
echo ""
echo "  1) Single machine  — cloud + agent on this machine (default)"
echo "  2) Multi machine   — choose what runs on this machine"
echo ""
read -rp "Enter choice [1/2, default: 1]: " SETUP_CHOICE
SETUP_CHOICE="${SETUP_CHOICE:-1}"
echo ""

RUN_CLOUD=false
RUN_AGENT=false
CLOUD_PORT=1071
AGENT_CLOUD_URL=""

if [ "$SETUP_CHOICE" = "1" ]; then
  # Single machine — run both
  RUN_CLOUD=true
  RUN_AGENT=true
  read -rp "Port to run the server on [default: 1071]: " PORT_INPUT
  CLOUD_PORT="${PORT_INPUT:-1071}"
  AGENT_CLOUD_URL="ws://localhost:${CLOUD_PORT}"

elif [ "$SETUP_CHOICE" = "2" ]; then
  echo "What should this machine run?"
  echo ""
  echo "  1) Cloud server only"
  echo "  2) Agent only"
  echo "  3) Both"
  echo ""
  read -rp "Enter choice [1/2/3]: " ROLE_CHOICE
  echo ""

  if [ "$ROLE_CHOICE" = "1" ]; then
    RUN_CLOUD=true
    read -rp "Port to run the cloud server on [default: 1071]: " PORT_INPUT
    CLOUD_PORT="${PORT_INPUT:-1071}"

  elif [ "$ROLE_CHOICE" = "2" ]; then
    RUN_AGENT=true
    read -rp "URL of the cloud server (e.g. ws://192.168.1.10:1071): " URL_INPUT
    AGENT_CLOUD_URL="${URL_INPUT:-ws://localhost:1071}"

  elif [ "$ROLE_CHOICE" = "3" ]; then
    RUN_CLOUD=true
    RUN_AGENT=true
    read -rp "Port to run the cloud server on [default: 1071]: " PORT_INPUT
    CLOUD_PORT="${PORT_INPUT:-1071}"
    AGENT_CLOUD_URL="ws://localhost:${CLOUD_PORT}"

  else
    echo "Invalid choice. Exiting."
    exit 1
  fi

else
  echo "Invalid choice. Exiting."
  exit 1
fi

# ── Cleanup on exit ──────────────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$CLOUD_PID" ] && kill "$CLOUD_PID" 2>/dev/null
  [ -n "$AGENT_PID" ] && kill "$AGENT_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

# ── Start services ───────────────────────────────────────────
echo ""

if [ "$RUN_CLOUD" = true ]; then
  echo -e "${YELLOW}Starting cloud server on port ${CLOUD_PORT}...${NC}"
  export PORT="$CLOUD_PORT"
  (cd cloud && node src/index.js) &
  CLOUD_PID=$!
  sleep 4
fi

if [ "$RUN_AGENT" = true ]; then
  echo -e "${YELLOW}Starting agent...${NC}"
  export TC_CLOUD_URL="$AGENT_CLOUD_URL"
  (cd agent && node bin/49-agent.js start) &
  AGENT_PID=$!
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Running!${NC}"
if [ "$RUN_CLOUD" = true ]; then
  echo -e "  Cloud  → ${CYAN}http://localhost:${CLOUD_PORT}${NC}"
fi
if [ "$RUN_AGENT" = true ]; then
  echo -e "  Agent  → ${CYAN}${AGENT_CLOUD_URL}${NC}"
fi
echo ""
echo "Press Ctrl+C to stop."
echo ""

wait
