"""Minimal Band REST client — the Environmental specialist posts into the same
room as the TypeScript committee, as a first-class Band participant."""
from __future__ import annotations

import os

import httpx

BASE_URL = os.getenv("BAND_BASE_URL", "https://app.band.ai/api/v1")
API_KEY = os.getenv("BAND_ENVIRONMENTAL_API_KEY", "")
TIMEOUT = 12.0


def post_message(room_id: str, content: str, mention_ids: list[str]) -> str:
    """Post a message to the room, @mentioning the given agent ids.

    Band requires at least one mention; callers pass the requesting agent and
    the Deal Director. Mirrors the TS BandClient.postMessage contract exactly.
    """
    mentions = [{"id": m} for m in mention_ids if m]
    with httpx.Client(timeout=TIMEOUT) as client:
        res = client.post(
            f"{BASE_URL}/agent/chats/{room_id}/messages",
            headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
            json={"message": {"content": content, "mentions": mentions}},
        )
        res.raise_for_status()
        body = res.json()
        data = body.get("data") if isinstance(body, dict) else None
        return (data or body or {}).get("id", "")
