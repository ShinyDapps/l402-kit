import hashlib
from typing import Any

_used_preimages: set[str] = set()


def check_and_mark_preimage(preimage: str) -> bool:
    """In-memory replay protection (single process). Resets on restart."""
    key = hashlib.sha256(preimage.encode()).hexdigest()
    if key in _used_preimages:
        return False
    _used_preimages.add(key)
    return True


class MemoryReplayAdapter:
    """In-memory replay store. Zero dependencies, single-process only."""

    def __init__(self) -> None:
        self._used: set[str] = set()

    def check_and_mark(self, preimage: str) -> bool:
        key = hashlib.sha256(preimage.encode()).hexdigest()
        if key in self._used:
            return False
        self._used.add(key)
        return True


class RedisReplayAdapter:
    """Redis-backed replay protection for multi-instance / production deployments.

    Usage:
        import redis
        from l402kit.replay import RedisReplayAdapter

        r = redis.Redis.from_url(os.environ["REDIS_URL"])
        adapter = RedisReplayAdapter(r)

        # Pass to middleware:
        l402_middleware(price_sats=10, lightning=provider, replay=adapter)
    """

    def __init__(self, redis_client: Any, ttl_seconds: int = 86400) -> None:
        self._redis = redis_client
        self._ttl = ttl_seconds

    def check_and_mark(self, preimage: str) -> bool:
        """Returns True on first use, False if already seen (replay attack)."""
        key = "l402:used:" + hashlib.sha256(preimage.encode()).hexdigest()
        # SET key 1 NX EX ttl — atomic: only sets if key doesn't exist
        result = self._redis.set(key, "1", nx=True, ex=self._ttl)
        return result is not None
