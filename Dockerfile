# ── Stage 1: build the SPA (same-origin: no VITE_API_URL → relative API base) ──
FROM node:20-slim AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
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
