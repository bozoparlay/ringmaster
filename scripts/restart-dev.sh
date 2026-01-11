#!/bin/bash
# Restart Ringmaster Dev Server
# Usage: ./scripts/restart-dev.sh [port]
# Default port: 3001

PORT=${1:-3001}

echo "🔄 Stopping all Ringmaster dev servers..."

# Kill any running next dev processes
pkill -f "next dev" 2>/dev/null || true
pkill -f "node.*ringmaster" 2>/dev/null || true

# Kill anything on common dev ports
for p in 3000 3001 3002 3003; do
  lsof -ti:$p 2>/dev/null | xargs kill -9 2>/dev/null || true
done

sleep 2

echo "🚀 Starting dev server on port $PORT..."
cd "$(dirname "$0")/.." || exit 1

# Start in background and wait for health check
npm run dev -- -p $PORT &
DEV_PID=$!

# Wait for server to be ready (max 30 seconds)
echo "⏳ Waiting for server to be ready..."
for i in {1..30}; do
  if curl -s "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
    echo ""
    echo "✅ Server ready at http://localhost:$PORT"
    echo "   PID: $DEV_PID"
    echo ""
    echo "📋 Quick links:"
    echo "   App:    http://localhost:$PORT"
    echo "   Health: http://localhost:$PORT/api/health"
    exit 0
  fi
  printf "."
  sleep 1
done

echo ""
echo "❌ Server failed to start within 30 seconds"
exit 1
