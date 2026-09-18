# ── Stage 1: build the SPA (same-origin: no VITE_API_URL → relative API base) ──
FROM node:20-slim AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
# An escape hatch for a stale SPA. Buildkit keys `COPY` on copied-file content,
# so changed source normally misses the cache on its own — but a cached
# `frontend` stage DOES get replayed here (seen 2026-08-20: `RUN npx vite build`
# printing its step name and no output, with the served index.html keeping an
# older build's `last-modified` across a redeploy). Bumping this number rebuilds
# the COPY and everything after it.
#
# BEFORE BUMPING, CHECK PROPERLY — the app is code-split, and the entry chunk
# hash barely moves between builds, so "the bundle hash didn't change" proves
# nothing at all. Read the entry chunk to find the lazy chunk you care about,
# then grep THAT for a string only your new code contains:
#   E=$(curl -s $HOST/e/w3-today | grep -o 'assets/index-[A-Za-z0-9_-]*\.js')
#   curl -s "$HOST/$E" | grep -oE '[A-Za-z0-9._-]+-[A-Za-z0-9_-]{8}\.js' | sort -u
#   curl -s "$HOST/assets/<the chunk>" | grep -c "<a string from your new code>"
ARG SPA_CACHE_EPOCH=33

COPY frontend/ ./
ENV VITE_API_URL=
# skip tsc (pre-existing type-debt in untouched files); vite build is the gate
RUN npx vite build

# ── Stage 2: FastAPI backend that also serves the built SPA ──
FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq5 postgresql-client \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
# The background-removal model, baked in at BUILD time. It is 179 MB and rembg
# fetches it on first use — at runtime that would mean the first rider after
# every deploy waits for a download, on a request that is already slow because
# it is rendering. See `services/cutout.py`.
RUN python -c "from rembg import new_session; new_session('isnet-general-use')"
ENV NUMBA_CACHE_DIR=/tmp U2NET_HOME=/root/.u2net
COPY backend/ .
# built frontend served by the backend at the same origin
COPY --from=frontend /fe/dist /app/frontend_dist
ENV FRONTEND_DIST=/app/frontend_dist
ENV GARMIN_TOKEN_STORE_ROOT=/data/garmin_tokens
RUN chmod +x start.sh
CMD ["./start.sh"]
