"""#168: one JSON object per log line (12-factor logs). Messages follow the repo's rule: the attempt, then the
outcome with its cause; structured details go in `extra=fields(...)`."""
from __future__ import annotations

import datetime as dt
import json
import logging
import sys


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        doc = {"ts": dt.datetime.fromtimestamp(record.created, dt.timezone.utc).isoformat(timespec="milliseconds"),
               "level": record.levelname, "logger": record.name, "msg": record.getMessage()}
        doc.update(getattr(record, "fields", {}))
        if record.exc_info:
            doc["exc"] = self.formatException(record.exc_info)
        return json.dumps(doc, ensure_ascii=False, default=str)


def setup(stream=None) -> None:
    handler = logging.StreamHandler(stream or sys.stdout)
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)


def fields(**kw) -> dict:
    return {"fields": kw}
