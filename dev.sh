#!/usr/bin/env bash
# dev.sh — start Next.js dev server with Node 23 (required for Turbopack stability)
#
# Why Node 23 instead of system Node 18?
#   The Turbopack dev runtime's `pendingOperations` Map tracks async context for
#   React Server Component DevTools. In Node 18, V8's Map ceiling is 2^24 (~16.7M).
#   Long dev sessions with many hot-reloads fill this Map, causing:
#     RangeError: Map maximum size exceeded (app-page-turbo.runtime.dev.js)
#   Node 23 has the same V8 ceiling but much better GC pressure tuning so destroy()
#   hooks fire sooner, keeping the Map small in practice.
#
# Usage: ./dev.sh

set -e

NVM_NODE_23="$HOME/.nvm/versions/node/v23.11.0/bin"

if [ ! -d "$NVM_NODE_23" ]; then
  echo "❌  Node 23.11.0 not found at $NVM_NODE_23"
  echo "    Run: nvm install 23.11.0"
  exit 1
fi

export PATH="$NVM_NODE_23:$PATH"

echo "→ Node $(node --version)  ($(which node))"
echo "→ npm  $(npm --version)"
echo ""

# --expose-gc lets V8 run manual GC when memory pressure climbs,
# which helps flush the pendingOperations Map before it hits the ceiling.
export NODE_OPTIONS="--expose-gc"

exec npm run dev
