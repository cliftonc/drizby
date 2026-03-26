#!/bin/sh
set -e

# Node listens on internal port, Caddy proxies on the external PORT
export NODE_PORT="${NODE_PORT:-3462}"
export PORT="${PORT:-3461}"

echo "Starting Drizby (Caddy on :${PORT}, Node on :${NODE_PORT})"

# Start Node in the background
node dist/server.js &
NODE_PID=$!

# Start Caddy in the foreground
caddy run --config /app/Caddyfile --adapter caddyfile &
CADDY_PID=$!

# Wait for either to exit — if one dies, kill the other
wait -n $NODE_PID $CADDY_PID
EXIT_CODE=$?

kill $NODE_PID $CADDY_PID 2>/dev/null || true
exit $EXIT_CODE
