#!/usr/bin/env bash
# Workspace dev runner: brings up both services with one click.
set -e

# Install Node deps on first run.
[ -d node_modules ] || npm install

# Create the Python specialists venv on first run.
if [ ! -d services/specialists/.venv ]; then
  python3 -m venv services/specialists/.venv
  services/specialists/.venv/bin/pip install -r services/specialists/requirements.txt
fi

# Python specialists service on an internal port (background).
( cd services/specialists && exec .venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000 ) &

# Next.js dev server on the public port (foreground).
exec npm run dev
