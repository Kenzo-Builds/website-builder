#!/bin/bash
# Website Builder Backend — Startup Script
# Run this to start/restart the API server with correct env vars
# Usage: bash start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create writable dirs if they don't exist
mkdir -p /tmp/wb-builds /tmp/wb-deployed /tmp/wb-docker-apps

# Kill any existing server process
pkill -f "node server.js" 2>/dev/null || true
sleep 1

# Start server
cd "$SCRIPT_DIR"
BUILDS_DIR=/tmp/wb-builds \
DEPLOYED_BUILDS_DIR=/tmp/wb-deployed \
DOCKER_APPS_DIR=/tmp/wb-docker-apps \
nohup node server.js > /tmp/server.log 2>&1 &

echo "✅ Website Builder API started (PID: $!)"
echo "📋 Logs: tail -f /tmp/server.log"

# Wait and verify
sleep 3
if curl -s http://localhost:3500/health > /dev/null 2>&1; then
  echo "✅ Health check passed — server is running"
else
  echo "❌ Health check failed — check /tmp/server.log"
  tail -20 /tmp/server.log
fi
