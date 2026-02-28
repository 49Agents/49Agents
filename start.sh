#!/bin/bash
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${CYAN}49Agents — Local Setup${NC}"
echo "──────────────────────────────"

# Install dependencies
echo ""
echo -e "${YELLOW}Installing dependencies...${NC}"
(cd cloud && npm install --silent)
(cd agent && npm install --silent)
echo -e "${GREEN}Done.${NC}"

# Trap to kill both processes on exit
cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$CLOUD_PID" "$AGENT_PID" 2>/dev/null
  wait "$CLOUD_PID" "$AGENT_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

# Start cloud server
echo ""
echo -e "${YELLOW}Starting cloud server...${NC}"
(cd cloud && node src/index.js) &
CLOUD_PID=$!

# Wait for cloud to be ready
sleep 2

# Start agent
echo -e "${YELLOW}Starting agent...${NC}"
(cd agent && node bin/49-agent.js start) &
AGENT_PID=$!

echo ""
echo -e "${GREEN}Everything is running!${NC}"
echo -e "  Open ${CYAN}http://localhost:3001${NC} in your browser."
echo ""
echo "Press Ctrl+C to stop."
echo ""

# Wait for either process to exit
wait "$CLOUD_PID" "$AGENT_PID"
