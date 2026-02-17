"""Autumn billing API client for server-side check/track."""

import httpx
import logging

logger = logging.getLogger(__name__)

AUTUMN_API = "https://api.useautumn.com/v1"


async def autumn_check(
    autumn_key: str, customer_id: str, feature_id: str
) -> dict:
    """Check if a customer can use a feature."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{AUTUMN_API}/check",
            json={"customer_id": customer_id, "feature_id": feature_id},
            headers={"Authorization": f"Bearer {autumn_key}"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()


async def autumn_track(
    autumn_key: str,
    customer_id: str,
    feature_id: str,
    value: int = 1,
) -> dict:
    """Track usage of a feature for billing."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{AUTUMN_API}/track",
            json={
                "customer_id": customer_id,
                "feature_id": feature_id,
                "value": value,
            },
            headers={"Authorization": f"Bearer {autumn_key}"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
