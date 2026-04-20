import hashlib

_used_preimages: set[str] = set()


def check_and_mark_preimage(preimage: str) -> bool:
    key = hashlib.sha256(preimage.encode()).hexdigest()
    if key in _used_preimages:
        return False
    _used_preimages.add(key)
    return True
