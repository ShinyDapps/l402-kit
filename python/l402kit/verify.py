import hashlib
import base64
import json
import time
import re


def parse_token(token: str) -> tuple[str, str]:
    idx = token.rfind(":")
    if idx == -1:
        raise ValueError("Invalid L402 token format")
    return token[:idx], token[idx + 1:]


def verify_token(token: str) -> bool:
    try:
        macaroon, preimage = parse_token(token)

        if not macaroon or not re.fullmatch(r"[0-9a-fA-F]{64}", preimage):
            return False

        payload = json.loads(base64.b64decode(macaroon).decode())
        if not payload.get("hash") or not payload.get("exp"):
            return False

        if int(time.time()) > payload["exp"]:
            return False

        digest = hashlib.sha256(bytes.fromhex(preimage)).hexdigest()
        return digest == payload["hash"]

    except Exception:
        return False
