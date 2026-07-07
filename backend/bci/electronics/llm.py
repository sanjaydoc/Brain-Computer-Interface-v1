"""Minimal multi-provider chat adapter for circuit generation.

Mirrors inventor-studio-v3's ``reasoningLLM.invokeJson`` (JSON-mode, low temperature) but
dependency-free (stdlib ``urllib``) and provider-agnostic: it uses whichever API key is in
the environment. If none is set — or the call fails — the ElectronicsService falls back to
the deterministic rule-based composer, so generation always returns a circuit.
"""

from __future__ import annotations

import json
import os
import urllib.request


def available() -> bool:
    return bool(_provider())


def _provider() -> str | None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    if os.environ.get("OPENROUTER_API_KEY"):
        return "openrouter"
    return None


def _post(url: str, headers: dict, payload: dict, timeout: float) -> dict:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def invoke_json(prompt: str, max_tokens: int = 2500, timeout: float = 45.0) -> str:
    """Return the raw model text (expected to be JSON). Raises if no provider/failure."""
    provider = _provider()
    if provider == "anthropic":
        data = _post(
            "https://api.anthropic.com/v1/messages",
            {"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
             "content-type": "application/json"},
            {"model": os.environ.get("BCI_LLM_MODEL", "claude-sonnet-5"), "max_tokens": max_tokens,
             "temperature": 0.4, "messages": [{"role": "user", "content": prompt}]},
            timeout,
        )
        return "".join(b.get("text", "") for b in data.get("content", []))

    if provider in ("openai", "openrouter"):
        base = ("https://api.openai.com/v1" if provider == "openai"
                else "https://openrouter.ai/api/v1")
        key = os.environ["OPENAI_API_KEY" if provider == "openai" else "OPENROUTER_API_KEY"]
        default_model = "gpt-4o-mini" if provider == "openai" else "anthropic/claude-3.5-sonnet"
        data = _post(
            f"{base}/chat/completions",
            {"Authorization": f"Bearer {key}", "content-type": "application/json"},
            {"model": os.environ.get("BCI_LLM_MODEL", default_model), "max_tokens": max_tokens,
             "temperature": 0.4, "messages": [{"role": "user", "content": prompt}]},
            timeout,
        )
        return data["choices"][0]["message"]["content"]

    raise RuntimeError("no LLM provider configured (set ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY)")
