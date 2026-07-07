"""Unified chat-LLM adapter (stdlib only) — the reasoning backend for the invention engines
ported from inventor-studio-v3.

Picks a provider from the environment, tried in this order for ``backend="auto"``:
  1. **local**   — any OpenAI-compatible server: Ollama, vLLM, llama.cpp, LM Studio.
                   Set ``LOCAL_LLM_URL`` (e.g. http://localhost:11434/v1) + ``LOCAL_LLM_MODEL``
                   (e.g. qwen2.5:7b). This is the "download Qwen 7B and wire it up" path.
  2. **nvidia**  — NVIDIA NIM (OpenAI-compatible). Set ``NVIDIA_API_KEY`` (or ``NGC_API_KEY``);
                   model via ``BCI_LLM_MODEL`` (default meta/llama-3.1-8b-instruct).
  3. **openai** / **anthropic** / **openrouter** — cloud, via their API keys.

Everything degrades gracefully: if no provider is set (hosted demo / CI), callers fall back
to their deterministic rule-based generator, so the feature always works.
"""

from __future__ import annotations

import json
import os
import urllib.request

NVIDIA_BASE = "https://integrate.api.nvidia.com/v1"
OPENAI_BASE = "https://api.openai.com/v1"
OPENROUTER_BASE = "https://openrouter.ai/api/v1"


def provider() -> str | None:
    if os.environ.get("LOCAL_LLM_URL"):
        return "local"
    if os.environ.get("NVIDIA_API_KEY") or os.environ.get("NGC_API_KEY"):
        return "nvidia"
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("OPENROUTER_API_KEY"):
        return "openrouter"
    return None


def available() -> bool:
    return provider() is not None


def _post(url: str, headers: dict, payload: dict, timeout: float) -> dict:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _chat_completions(base: str, key: str | None, model: str, prompt: str, max_tokens: int, timeout: float) -> str:
    headers = {"content-type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    data = _post(f"{base.rstrip('/')}/chat/completions", headers, {
        "model": model, "max_tokens": max_tokens, "temperature": 0.5,
        "messages": [{"role": "user", "content": prompt}],
    }, timeout)
    return data["choices"][0]["message"]["content"]


def invoke_json(prompt: str, max_tokens: int = 1200, timeout: float = 60.0) -> str:
    """Return the raw model text (expected to be JSON). Raises if no provider / on failure."""
    p = provider()
    if p == "local":
        return _chat_completions(os.environ["LOCAL_LLM_URL"], os.environ.get("LOCAL_LLM_KEY"),
                                 os.environ.get("LOCAL_LLM_MODEL", "qwen2.5:7b"), prompt, max_tokens, timeout)
    if p == "nvidia":
        key = os.environ.get("NVIDIA_API_KEY") or os.environ["NGC_API_KEY"]
        return _chat_completions(NVIDIA_BASE, key,
                                 os.environ.get("BCI_LLM_MODEL", "meta/llama-3.1-8b-instruct"), prompt, max_tokens, timeout)
    if p == "openai":
        return _chat_completions(OPENAI_BASE, os.environ["OPENAI_API_KEY"],
                                 os.environ.get("BCI_LLM_MODEL", "gpt-4o-mini"), prompt, max_tokens, timeout)
    if p == "openrouter":
        return _chat_completions(OPENROUTER_BASE, os.environ["OPENROUTER_API_KEY"],
                                 os.environ.get("BCI_LLM_MODEL", "meta-llama/llama-3.1-8b-instruct"), prompt, max_tokens, timeout)
    if p == "anthropic":
        data = _post("https://api.anthropic.com/v1/messages",
                     {"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01", "content-type": "application/json"},
                     {"model": os.environ.get("BCI_LLM_MODEL", "claude-sonnet-5"), "max_tokens": max_tokens,
                      "temperature": 0.5, "messages": [{"role": "user", "content": prompt}]}, timeout)
        return "".join(b.get("text", "") for b in data.get("content", []))
    raise RuntimeError("no LLM provider configured (set LOCAL_LLM_URL / NVIDIA_API_KEY / OPENAI_API_KEY / …)")


def extract_json(text: str) -> dict | None:
    """Parse a JSON object from model output, tolerating markdown fences / surrounding prose."""
    import re
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", str(text))
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return None
    return None
