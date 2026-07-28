from __future__ import annotations

import time

import httpx

from .config import get_settings
from .schemas import SearchResponse, TrackMatch

TOKEN_URL = "https://accounts.spotify.com/api/token"  # noqa: S105 - endpoint, not a secret
SEARCH_URL = "https://api.spotify.com/v1/search"


class SpotifyNotConfigured(RuntimeError):
    pass


class SpotifyClient:
    """
    Client Credentials flow, entirely server side.

    This exists so the browser never sees the client secret. It is also
    strictly a metadata lookup: it returns titles, artists, artwork and
    durations so an export can be tagged. It does not and will not fetch
    audio. Spotify streams are DRM protected, and the 30 second preview_url
    is Spotify's own hosted clip, passed through untouched when present.
    """

    def __init__(self) -> None:
        self._token: str | None = None
        self._expires_at: float = 0.0

    async def _access_token(self, client: httpx.AsyncClient) -> str:
        settings = get_settings()
        if not settings.spotify_configured:
            raise SpotifyNotConfigured(
                "Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in the server .env"
            )

        # Reuse the token until it is nearly expired.
        if self._token and time.time() < self._expires_at - 30:
            return self._token

        response = await client.post(
            TOKEN_URL,
            data={"grant_type": "client_credentials"},
            auth=(settings.spotify_client_id, settings.spotify_client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        response.raise_for_status()
        payload = response.json()
        self._token = payload["access_token"]
        self._expires_at = time.time() + payload.get("expires_in", 3600)
        return self._token

    async def search(self, query: str, limit: int = 8) -> SearchResponse:
        async with httpx.AsyncClient(timeout=12) as client:
            token = await self._access_token(client)
            response = await client.get(
                SEARCH_URL,
                params={"q": query, "type": "track", "limit": limit},
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()
            items = response.json().get("tracks", {}).get("items", [])

        results = [
            TrackMatch(
                id=item["id"],
                title=item["name"],
                artist=", ".join(a["name"] for a in item.get("artists", [])),
                album=item.get("album", {}).get("name", ""),
                artwork_url=next(
                    (i["url"] for i in item.get("album", {}).get("images", [])), None
                ),
                duration_ms=item.get("duration_ms", 0),
                preview_url=item.get("preview_url"),
                spotify_url=item.get("external_urls", {}).get("spotify", ""),
            )
            for item in items
        ]
        return SearchResponse(query=query, results=results)


spotify = SpotifyClient()
