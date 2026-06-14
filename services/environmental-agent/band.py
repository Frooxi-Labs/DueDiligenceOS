"""Minimal Band REST client — the Environmental specialist reads and posts in the
same room as the TypeScript committee, as a first-class Band participant."""
from __future__ import annotations

import os

import httpx

BASE_URL = os.getenv("BAND_BASE_URL", "https://app.band.ai/api/v1")
API_KEY = os.getenv("BAND_ENVIRONMENTAL_API_KEY", "")
TIMEOUT = 12.0


def _headers() -> dict:
    return {"X-API-Key": API_KEY, "Content-Type": "application/json"}


def post_message(room_id: str, content: str, mention_ids: list[str]) -> str:
    """Post a message to the room, @mentioning the given agent ids."""
    mentions = [{"id": m} for m in mention_ids if m]
    with httpx.Client(timeout=TIMEOUT) as client:
        res = client.post(
            f"{BASE_URL}/agent/chats/{room_id}/messages",
            headers=_headers(),
            json={"message": {"content": content, "mentions": mentions}},
        )
        res.raise_for_status()
        body = res.json()
        data = body.get("data") if isinstance(body, dict) else None
        return (data or body or {}).get("id", "")


def post_event(room_id: str, content: str, kind: str = "thought") -> None:
    """Post a Band event (thought / tool_call / tool_result / error) — makes the
    specialist's reasoning visible in the room."""
    with httpx.Client(timeout=TIMEOUT) as client:
        res = client.post(
            f"{BASE_URL}/agent/chats/{room_id}/events",
            headers=_headers(),
            json={"event": {"content": content, "message_type": kind}},
        )
        res.raise_for_status()


def get_context(room_id: str) -> list[dict]:
    """Read the room as this agent sees it (messages it sent or was @mentioned in)
    — the shared context the specialist reasons over."""
    with httpx.Client(timeout=TIMEOUT) as client:
        res = client.get(f"{BASE_URL}/agent/chats/{room_id}/context", headers=_headers())
        res.raise_for_status()
        body = res.json()
        data = body.get("data") if isinstance(body, dict) else body
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("messages"), list):
            return data["messages"]
        return []
