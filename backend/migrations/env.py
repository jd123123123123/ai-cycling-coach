from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine import Connection

from alembic import context

# Import settings for DATABASE_URL
from app.config import settings

# Import Base and ALL models so autogenerate can detect them
from app.database import Base  # noqa: F401
from app.models import user, athlete_profile, consent, activity, garmin_credential, daily_metric  # noqa: F401

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Set the database URL from app settings (overrides alembic.ini).
# Alembic migrations use psycopg2 (sync) — convert asyncpg URL to psycopg2 URL.
# The app itself continues to use asyncpg at runtime.
sync_db_url = settings.DATABASE_URL.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
).split("?")[0]  # Strip query params (e.g., ?ssl=disable) — psycopg2 handles SSL differently
config.set_main_option("sqlalchemy.url", sync_db_url)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Model metadata for autogenerate support
target_metadata = Base.metadata


def include_object(object, name, type_, reflected, compare_to):
    """Prevent autogenerate from touching TimescaleDB-managed tables and indexes.

    - The activities and daily_metrics tables were created via raw SQL as
      TimescaleDB hypertables (migration a076ea752213). Alembic must not try
      to CREATE or DROP these tables during autogenerate.
    - TimescaleDB also auto-creates indexes on hypertable time columns.
      Alembic would try to drop them (reflected-only, no Python definition).

    See: https://github.com/sqlalchemy/alembic/discussions/1465
    """
    # Skip TimescaleDB hypertables created via raw SQL (not Alembic-managed)
    if type_ == "table" and name in ("activities", "daily_metrics"):
        return False
    # Skip reflected-only indexes - these are created by TimescaleDB
    if type_ == "index" and reflected and compare_to is None:
        return False
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine, though an Engine is
    acceptable here as well. By skipping the Engine creation we don't even need a DBAPI
    to be available.

    Calls to context.execute() here emit the given string to the script output.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode using synchronous psycopg2 driver.

    The app uses asyncpg at runtime, but Alembic migrations use psycopg2 for
    simplicity. The DATABASE_URL is converted from postgresql+asyncpg:// to
    postgresql+psycopg2:// above.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        do_run_migrations(connection)

    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
