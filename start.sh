#!/usr/bin/env bash
# Production runner for the published Reserved VM deployment.
set -e
export PORT=3000

# Python specialists service on an internal port (background).
( cd services/specialists && exec .venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000 ) &

# Next.js app on the public port (foreground).
exec npm start
