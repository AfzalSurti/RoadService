from __future__ import annotations

from typing import Any

import requests
from django.conf import settings


class APIError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class FastAPIClient:
    """Thin HTTP client — all business logic stays in FastAPI."""

    def __init__(self, token: str | None = None):
        self.base = settings.FASTAPI_BASE_URL
        self.token = token

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _handle(self, resp: requests.Response) -> Any:
        if resp.status_code >= 400:
            try:
                detail = resp.json().get("detail", resp.text)
            except Exception:
                detail = resp.text
            raise APIError(str(detail), resp.status_code)
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    def login(self, email: str, password: str) -> dict:
        resp = requests.post(
            f"{self.base}/api/v1/auth/login/json",
            json={"email": email, "password": password},
            timeout=30,
        )
        return self._handle(resp)

    def get(self, path: str, params: dict | None = None) -> Any:
        resp = requests.get(
            f"{self.base}{path}",
            headers=self._headers(),
            params=params,
            timeout=30,
        )
        return self._handle(resp)

    def post(self, path: str, json: dict | None = None) -> Any:
        resp = requests.post(
            f"{self.base}{path}",
            headers=self._headers(),
            json=json,
            timeout=30,
        )
        return self._handle(resp)

    def patch(self, path: str, json: dict | None = None) -> Any:
        resp = requests.patch(
            f"{self.base}{path}",
            headers=self._headers(),
            json=json,
            timeout=30,
        )
        return self._handle(resp)

    def download(self, path: str) -> tuple[bytes, str]:
        resp = requests.get(
            f"{self.base}{path}",
            headers=self._headers(),
            timeout=60,
        )
        if resp.status_code >= 400:
            raise APIError(resp.text, resp.status_code)
        content_type = resp.headers.get("Content-Type", "application/octet-stream")
        return resp.content, content_type


def client_from_request(request) -> FastAPIClient:
    return FastAPIClient(token=request.session.get("api_token"))
