#!/bin/bash
# Deploy 49Agents app (git pull + rebuild + restart)
set -e

SERVER="root@24.144.84.83"
PASS='Cs=A:>s?^2e>d~v'

run() {
  sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no "$SERVER" "$1"
}

echo "=> Pulling latest 49Agents..."
run 'cd /opt/49agents && git pull origin main'

echo "=> Installing dependencies..."
run 'cd /opt/49agents/cloud && npm install --include=dev'

echo "=> Rebuilding JS..."
run 'cd /opt/49agents/cloud && npm run build'

echo "=> Restarting server..."
run 'cd /opt/49agents/cloud && ADMIN_PORT=1071 TAILSCALE_IP=100.110.195.110 pm2 restart 49agents --update-env && pm2 save'

echo "=> Done! Checking status..."
run 'pm2 logs 49agents --lines 3 --nostream 2>&1'
