"""Standalone job entrypoints run outside the FastAPI web process.

These are invoked by Railway cron (see backend/railway.cron.json), not by the
web container, so background work runs on schedule regardless of whether the web
service is awake.
"""
