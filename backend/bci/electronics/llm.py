"""Electronics LLM shim — delegates to the shared bci.llm adapter, so circuit generation
uses the same providers (NVIDIA NIM, local Ollama/vLLM/Qwen, OpenAI, Anthropic, OpenRouter).
Kept as a thin module so existing imports (``from . import llm``) keep working.
"""

from __future__ import annotations

from .. import llm as _llm


def available() -> bool:
    return _llm.available()


def invoke_json(prompt: str, max_tokens: int = 2500, timeout: float = 45.0) -> str:
    return _llm.invoke_json(prompt, max_tokens=max_tokens, timeout=timeout)
