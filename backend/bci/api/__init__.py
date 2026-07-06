"""HTTP + WebSocket API — live streaming from the backend engine (PLAN §5.1 P3)."""

from .app import app, create_app

__all__ = ["app", "create_app"]
