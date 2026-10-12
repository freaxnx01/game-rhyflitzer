"""#168: the human check on new builds. ALTCHA proof of work (PoW v2) through the `altcha` package (MIT): the server
signs a short-lived challenge with an HMAC key, the browser spends about a second of CPU finding a counter whose
PBKDF2 key starts with the required prefix, and the signed solution rides along with POST /api/jobs. No third party,
no cookie, no puzzle. A solution may admit one build: spending the ticket is the store's job (store.human_gate)."""
from __future__ import annotations

import logging
from dataclasses import dataclass

import altcha

log = logging.getLogger("rhyflitzer.api")
ALGORITHM = "PBKDF2/SHA-256"
MAX_PAYLOAD = 4096


class Unavailable(Exception):
    """No usable HMAC key: the human check fails closed."""


@dataclass(frozen=True)
class Ticket:
    signature: str      # of the challenge; identifies it for replay protection
    expires: float


def secret(settings) -> str:
    path = settings.altcha_secret_file
    try:
        value = path.read_text(encoding="utf-8").strip() if path else ""
    except OSError:
        value = ""
    if not value:
        raise Unavailable("the ALTCHA key file is missing or empty")
    return value


def issue(settings, now: float) -> dict:
    """A signed challenge, good for settings.altcha_ttl seconds."""
    return altcha.create_challenge(algorithm=ALGORITHM, cost=settings.altcha_cost, expires_at=int(now + settings.altcha_ttl),
                                   hmac_secret=secret(settings)).to_dict()


def check(payload, settings) -> Ticket | None:
    """The ticket of a valid, unexpired solution to a challenge we signed; None for anything else (the cause is
    logged, never sent back)."""
    if not isinstance(payload, str) or not 0 < len(payload) <= MAX_PAYLOAD:
        return None
    try:
        result = altcha.verify_solution(payload, secret(settings))
    except Unavailable as exc:
        log.warning("Human check impossible: %s", exc)
        return None
    if not result.verified:
        why = "expired" if result.expired else "forged" if result.invalid_signature else result.error or "wrong solution"
        log.info("Human check failed: %s", why)
        return None
    signed = altcha.Payload.from_base64(payload).challenge
    return Ticket(signed.signature, signed.parameters.expires_at)
