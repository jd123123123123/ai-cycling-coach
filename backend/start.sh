#!/usr/bin/env sh
set -e
echo "STARTUP: PORT=${PORT:-8000} — running migrations"
alembic upgrade head
echo "STARTUP: migrations done — launching uvicorn on 0.0.0.0:${PORT:-8000}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
