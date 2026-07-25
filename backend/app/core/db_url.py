from urllib.parse import parse_qs, urlencode, urlparse, urlunparse


def normalize_database_urls(async_url: str, sync_url: str) -> tuple[str, str]:
    """
    Neon URLs often include sslmode / channel_binding query params.
    - psycopg2 (sync/Alembic): keep sslmode=require, drop channel_binding
    - asyncpg: remove sslmode/channel_binding (use connect_args ssl instead)
    """
    sync = _strip_query_keys(sync_url, {"channel_binding"})
    if "sslmode=" not in sync and "ssl=" not in sync:
        sync = _append_query(sync, {"sslmode": "require"})

    async_clean = _strip_query_keys(async_url, {"sslmode", "channel_binding", "ssl"})
    # Ensure async driver prefix
    if async_clean.startswith("postgresql://"):
        async_clean = "postgresql+asyncpg://" + async_clean[len("postgresql://") :]
    elif async_clean.startswith("postgres://"):
        async_clean = "postgresql+asyncpg://" + async_clean[len("postgres://") :]
    return async_clean, sync


def _strip_query_keys(url: str, keys: set[str]) -> str:
    parts = urlparse(url)
    q = parse_qs(parts.query, keep_blank_values=True)
    for key in keys:
        q.pop(key, None)
    return urlunparse(parts._replace(query=urlencode({k: v[0] for k, v in q.items()})))


def _append_query(url: str, extra: dict[str, str]) -> str:
    parts = urlparse(url)
    q = parse_qs(parts.query, keep_blank_values=True)
    for k, v in extra.items():
        q[k] = [v]
    return urlunparse(parts._replace(query=urlencode({k: v[0] for k, v in q.items()})))
