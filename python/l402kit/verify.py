import hashlib
import hmac
import base64
import json
import time
import re


# Reject oversized tokens before parsing (DoS guard) — parity with TS SDK.
MAX_TOKEN_LEN = 4096
# Cap on how far in the future a token may claim to expire. Mirrors the TS
# SDK's 2-hour MAX_EXP_MS — prevents forged tokens with absurd `exp`.
MAX_EXP_MS = 2 * 60 * 60 * 1000


def parse_token(token: str) -> tuple[str, str]:
    idx = token.rfind(":")
    if idx == -1:
        raise ValueError("Invalid L402 token format")
    return token[:idx], token[idx + 1:]


def verify_token(token: str) -> bool:
    try:
        # DoS guard: reject before any parsing or base64 work
        if len(token) > MAX_TOKEN_LEN:
            return False

        macaroon, preimage = parse_token(token)

        if not macaroon or not re.fullmatch(r"[0-9a-fA-F]{64}", preimage):
            return False

        payload = json.loads(base64.b64decode(macaroon).decode())
        if not payload.get("hash") or not payload.get("exp"):
            return False

        now_ms = int(time.time() * 1000)
        if now_ms > payload["exp"]:
            return False

        # Forward-cap: reject tokens with exp more than 2h in the future
        if payload["exp"] > now_ms + MAX_EXP_MS:
            return False

        digest = hashlib.sha256(bytes.fromhex(preimage)).hexdigest()

        # Timing-safe compare to defeat hash-prefix side-channel attacks
        if len(digest) != len(payload["hash"]):
            return False
        return hmac.compare_digest(digest, payload["hash"])

    except Exception:
        return False
