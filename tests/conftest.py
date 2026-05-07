"""
Pytest fixtures shared across the suite.

- `tmp_db` spins up a fresh sqlite + applies all migrations into a temp file
  per test, so tests don't pollute the real strawberry.db.
- `fake_llm` / `fake_image` are stand-ins so unit tests never call real APIs.
"""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, AsyncIterator, Iterator, List, Optional, Type

import pytest
import pytest_asyncio


# ---------------------------------------------------------------------------
# Per-test temp database — fully isolated.
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def tmp_db(monkeypatch) -> AsyncIterator[str]:
    tmp = Path(tempfile.mkdtemp(prefix="strawberry_test_"))
    db_path = str(tmp / "test.db")

    # Patch the module-level DB_PATH so all callers point at our temp.
    from backend.database import core as core_mod

    monkeypatch.setattr(core_mod, "DB_PATH", db_path)

    # Apply migrations into the empty db.
    from backend.database.migrations import run_migrations

    await run_migrations(db_path)

    yield db_path

    shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------------------
# Provider fakes
# ---------------------------------------------------------------------------

class FakeLLMProvider:
    """Echoes a fixed response. Drop-in for `LLMProvider` in tests."""

    name = "fake-llm"

    def __init__(self, *, response: str = "ok") -> None:
        self.response = response
        self.calls: List[dict[str, Any]] = []

    async def complete(self, messages, *, model: str, **kwargs):
        from backend.providers.base import LLMResponse

        self.calls.append({"messages": messages, "model": model, "kwargs": kwargs})
        return LLMResponse(content=self.response, model=model, output_tokens=len(self.response))

    async def stream(self, messages, *, model: str, **kwargs):
        for chunk in self.response.split(" "):
            yield chunk + " "

    async def structured_output(self, messages, schema: Type, *, model: str, **kwargs):
        # Pick a reasonable default for testing
        return schema()  # works if schema has all defaults

    def models(self):
        return ["fake-llm-1"]


class FakeImageProvider:
    """Returns a deterministic local URL without calling an API."""

    name = "fake-image"

    def __init__(self) -> None:
        self.calls: List[Any] = []

    async def generate(self, req):
        from backend.providers.base import ImageGenResult

        self.calls.append(req)
        return ImageGenResult(
            image_urls=[f"/storage/generated/fake_{len(self.calls)}.png"],
            cost_usd=0.0,
            model_used=req.model,
            image_id=f"fake{len(self.calls)}",
            metadata={"fake": True},
        )

    async def edit(self, req):
        return await self.generate(req)

    def models(self):
        return ["fake-image-1"]


@pytest.fixture
def fake_llm() -> FakeLLMProvider:
    return FakeLLMProvider()


@pytest.fixture
def fake_image() -> FakeImageProvider:
    return FakeImageProvider()
