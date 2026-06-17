"""Minimal Band REST client — the Environmental specialist reads and posts in the
same room as the TypeScript committee, as a first-class Band participant."""
from __future__ import annotations

import os

import httpx

BASE_URL = os.getenv("BAND_BASE_URL", "https://app.band.ai/api/v1")
API_KEY = os.getenv("BAND_ENVIRONMENTAL_API_KEY", "")  # default identity
TIMEOUT = 12.0


def _headers(api_key: str | None = None) -> dict:
    # Use exactly the key the caller passes. Only fall back to the module default
    # when no key is given at all (api_key is None). An explicit empty string is
    # NOT replaced, so a misconfigured specialist fails loudly instead of posting
    # under another agent's identity.
    key = API_KEY if api_key is None else api_key
    return {"X-API-Key": key, "Content-Type": "application/json"}


def post_message(room_id: str, content: str, mention_ids: list[str], api_key: str | None = None) -> str:
    """Post a message as this specialist (its own api_key → its own handle in Band)."""
    mentions = [{"id": m} for m in mention_ids if m]
    with httpx.Client(timeout=TIMEOUT) as client:
        res = client.post(
            f"{BASE_URL}/agent/chats/{room_id}/messages",
            headers=_headers(api_key),
            json={"message": {"content": content, "mentions": mentions}},
        )
        res.raise_for_status()
        body = res.json()
        data = body.get("data") if isinstance(body, dict) else None
        return (data or body or {}).get("id", "")


def post_event(room_id: str, content: str, kind: str = "thought", api_key: str | None = None) -> None:
    """Post a Band event (thought / tool_call / tool_result / error) as this specialist."""
    with httpx.Client(timeout=TIMEOUT) as client:
        res = client.post(
            f"{BASE_URL}/agent/chats/{room_id}/events",
            headers=_headers(api_key),
            json={"event": {"content": content, "message_type": kind}},
        )
        res.raise_for_status()


def get_context(room_id: str, api_key: str | None = None) -> list[dict]:
    """Read the room as this specialist sees it (messages it sent or was @mentioned in)."""
    with httpx.Client(timeout=TIMEOUT) as client:
        res = client.get(f"{BASE_URL}/agent/chats/{room_id}/context", headers=_headers(api_key))
        res.raise_for_status()
        body = res.json()
        data = body.get("data") if isinstance(body, dict) else body
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("messages"), list):
            return data["messages"]
        return []
