#!/usr/bin/env python3
"""#170: the owner's gallery CLI. list | add <id> <title> [<description>] | remove <id>.

Everything goes through ONE host, RHYFLITZER_ADMIN_API (default http://127.0.0.1:8081, the SSH tunnel to the
rhyflitzer-admin listener; inside that container http://127.0.0.1:8001). The bearer token is read only from the
environment (RHYFLITZER_ADMIN_TOKEN): there is no --token flag, because a flag lands in shell history and `ps`.
The equivalent call by hand:

    curl -X PUT -H "Authorization: Bearer $RHYFLITZER_ADMIN_TOKEN" -H 'Content-Type: application/json' \
         -d '{"title": "...", "description": "..."}' "$RHYFLITZER_ADMIN_API/api/admin/gallery/<id>"
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

DEFAULT_API = "http://127.0.0.1:8081"
ID = re.compile(r"[0-9a-f]{12}")
TIMEOUT = 15


def build_request(host: str, token: str | None, action: str, world_id: str | None, title: str | None,
                  description: str | None) -> tuple[str, str, dict, bytes | None]:
    """(method, url, headers, body); exits with a message for a bad id or a missing token, before any request."""
    if action == "list":
        return "GET", f"{host}/api/gallery", {}, None
    if not world_id or not ID.fullmatch(world_id):
        sys.exit("The world id is 12 lowercase hex characters, e.g. 0123456789ab.")
    if not token:
        sys.exit("Set RHYFLITZER_ADMIN_TOKEN in the environment (from Passbolt); there is no --token flag on purpose.")
    url, headers = f"{host}/api/admin/gallery/{world_id}", {"Authorization": f"Bearer {token}"}
    if action == "remove":
        return "DELETE", url, headers, None
    body = json.dumps({"title": title, "description": description or ""}).encode("utf-8")
    return "PUT", url, {**headers, "Content-Type": "application/json"}, body


def send(method: str, url: str, headers: dict, body: bytes | None) -> tuple[int, str]:
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as reply:
            return reply.status, reply.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")


def parse(argv) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Curate the region editor's world gallery")
    sub = ap.add_subparsers(dest="action", required=True)
    sub.add_parser("list")
    add = sub.add_parser("add")
    add.add_argument("world_id")
    add.add_argument("title")
    add.add_argument("description", nargs="?", default="")
    sub.add_parser("remove").add_argument("world_id")
    return ap.parse_args(argv)


def main(argv=None) -> None:
    a = parse(argv)
    host = os.environ.get("RHYFLITZER_ADMIN_API", DEFAULT_API).rstrip("/")
    method, url, headers, body = build_request(host, os.environ.get("RHYFLITZER_ADMIN_TOKEN"), a.action,
                                               getattr(a, "world_id", None), getattr(a, "title", None), getattr(a, "description", None))
    status, text = send(method, url, headers, body)
    print(f"{status} {text}")
    if status >= 400:
        sys.exit(1)


if __name__ == "__main__":
    main()
