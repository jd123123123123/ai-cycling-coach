# Backend image for Railway (FastAPI + async SQLAlchemy + APScheduler).
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps kept minimal; psycopg2-binary/numpy/cryptography ship wheels.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . .

# Garmin OAuth token store lives here; back it with a Railway volume mounted at /data.
ENV GARMIN_TOKEN_STORE_ROOT=/data/garmin_tokens

# Uploaded crew-event GPX tours live here; same /data Railway volume.
ENV CREW_TOURS_ROOT=/data/crew_tours

# Run migrations, then boot the API on Railway's injected $PORT.
RUN chmod +x start.sh
CMD ["./start.sh"]
