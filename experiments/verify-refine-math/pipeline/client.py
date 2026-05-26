"""Thin wrappers around the Anthropic and Ollama SDKs. Both expose
the same `.call(prompt, *, system, model, max_tokens, temperature)`
and `.conversation(turns, *, system, model, max_tokens, temperature)`
interface so the pipeline `loop.py` is backend-agnostic.

The Ollama backend is the default when running locally for $0.
The Anthropic backend stays as the canonical replication target —
the paper used frontier hosted models (Gemini 2.5 Pro / Grok-4 /
GPT-5), and Sonnet 4.6 / Opus 4.7 are the comparable Anthropic tier.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Optional, Union

from .types import TokenUsage


# --- Model aliasing ---------------------------------------------------------

ANTHROPIC_ALIASES = {
    "sonnet": "claude-sonnet-4-6",
    "opus": "claude-opus-4-7",
    "haiku": "claude-haiku-4-5",
}

# Aliases for the locally-installed Ollama models on the project's
# 8 GB Mac. Only models that fit under the ~7B/Q4_K_M cap (per the
# `hardware-constraint` memory) are aliased here; bigger ones
# (granite4.1:8b, devstral-small-2:24b) require explicit naming and
# are documented as cloud-tier in the project's calibration log.
OLLAMA_ALIASES = {
    "qwen": "qwen2.5-coder:7b",
    "qwen3b": "qwen2.5-coder:3b",
    "starcoder": "starcoder2:7b",
    "llama": "llama3.2:3b",
    "phi": "phi3:mini",
    "deepseek": "deepseek-r1:1.5b",
    "qwen-math": "qwen2-math:1.5b",
}


def resolve_model(name: str, backend: str = "anthropic") -> str:
    if backend == "anthropic":
        return ANTHROPIC_ALIASES.get(name, name)
    if backend == "ollama":
        return OLLAMA_ALIASES.get(name, name)
    return name


# --- Result type ------------------------------------------------------------


@dataclass
class CallResult:
    text: str
    usage: TokenUsage
    stop_reason: str
    latency_seconds: float


# --- Backends ---------------------------------------------------------------


class AnthropicClient:
    """Anthropic Messages API. Solver and verifier run in fresh contexts
    (no cross-role history) to keep the verifier from being primed by
    the solver's framing.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        default_model: str = "claude-sonnet-4-6",
        max_tokens: int = 16000,
        temperature: float = 0.1,
    ) -> None:
        import anthropic  # lazy import so ollama-only runs don't need it

        key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Export it or pass api_key=..."
            )
        self.client = anthropic.Anthropic(api_key=key)
        self.default_model = resolve_model(default_model, "anthropic")
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.backend_name = "anthropic"

    def call(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        system: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> CallResult:
        mdl = resolve_model(model, "anthropic") if model else self.default_model
        t0 = time.time()
        kwargs = dict(
            model=mdl,
            max_tokens=max_tokens or self.max_tokens,
            temperature=self.temperature if temperature is None else temperature,
            messages=[{"role": "user", "content": prompt}],
        )
        if system:
            kwargs["system"] = system
        resp = self.client.messages.create(**kwargs)
        latency = time.time() - t0
        text = "".join(
            b.text for b in resp.content if getattr(b, "type", None) == "text"
        )
        usage = TokenUsage(resp.usage.input_tokens, resp.usage.output_tokens)
        return CallResult(text, usage, resp.stop_reason, latency)

    def conversation(
        self,
        turns: list[dict],
        *,
        model: Optional[str] = None,
        system: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> CallResult:
        mdl = resolve_model(model, "anthropic") if model else self.default_model
        t0 = time.time()
        kwargs = dict(
            model=mdl,
            max_tokens=max_tokens or self.max_tokens,
            temperature=self.temperature if temperature is None else temperature,
            messages=turns,
        )
        if system:
            kwargs["system"] = system
        resp = self.client.messages.create(**kwargs)
        latency = time.time() - t0
        text = "".join(
            b.text for b in resp.content if getattr(b, "type", None) == "text"
        )
        usage = TokenUsage(resp.usage.input_tokens, resp.usage.output_tokens)
        return CallResult(text, usage, resp.stop_reason, latency)


class OllamaClient:
    """Ollama local-model backend. Uses the official `ollama` Python SDK
    against the daemon at OLLAMA_HOST (default http://localhost:11434).

    Note vs Anthropic: Ollama's chat API takes a single `messages` list
    where the system prompt is the first message with role="system",
    not a separate parameter. We pre-pend the system message here so
    the loop's call sites don't need to know the difference.

    Multi-block user content (list of {"type": "text", "text": ...},
    used by the correction step) is collapsed into a single string —
    Ollama's chat API expects string content per message.
    """

    def __init__(
        self,
        default_model: str = "qwen2.5-coder:7b",
        max_tokens: int = 16000,
        temperature: float = 0.1,
        host: Optional[str] = None,
        num_ctx: int = 16384,
        keep_alive: str = "10m",
    ) -> None:
        import ollama

        self.client = ollama.Client(host=host) if host else ollama.Client()
        self.default_model = resolve_model(default_model, "ollama")
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.num_ctx = num_ctx
        # keep_alive holds the model in VRAM between calls; otherwise each
        # call pays the load-from-disk cost (~10-30 s on a Mac).
        self.keep_alive = keep_alive
        self.backend_name = "ollama"

    @staticmethod
    def _content_to_string(content: Union[str, list]) -> str:
        if isinstance(content, str):
            return content
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "\n\n".join(parts)

    def _build_messages(
        self, system: Optional[str], turns: list[dict]
    ) -> list[dict]:
        msgs: list[dict] = []
        if system:
            msgs.append({"role": "system", "content": system})
        for t in turns:
            msgs.append(
                {
                    "role": t["role"],
                    "content": self._content_to_string(t["content"]),
                }
            )
        return msgs

    def _chat(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int,
        temperature: float,
    ) -> CallResult:
        t0 = time.time()
        resp = self.client.chat(
            model=model,
            messages=messages,
            keep_alive=self.keep_alive,
            options={
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": self.num_ctx,
            },
        )
        latency = time.time() - t0
        text = resp.message.content or ""
        usage = TokenUsage(
            input_tokens=resp.prompt_eval_count or 0,
            output_tokens=resp.eval_count or 0,
        )
        stop_reason = resp.done_reason or "stop"
        return CallResult(text, usage, stop_reason, latency)

    def call(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        system: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> CallResult:
        mdl = resolve_model(model, "ollama") if model else self.default_model
        msgs = self._build_messages(system, [{"role": "user", "content": prompt}])
        return self._chat(
            msgs,
            mdl,
            max_tokens or self.max_tokens,
            self.temperature if temperature is None else temperature,
        )

    def conversation(
        self,
        turns: list[dict],
        *,
        model: Optional[str] = None,
        system: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> CallResult:
        mdl = resolve_model(model, "ollama") if model else self.default_model
        msgs = self._build_messages(system, turns)
        return self._chat(
            msgs,
            mdl,
            max_tokens or self.max_tokens,
            self.temperature if temperature is None else temperature,
        )


# --- Backend selection ------------------------------------------------------


def make_client(backend: str, **kwargs) -> Union[AnthropicClient, OllamaClient]:
    if backend == "anthropic":
        return AnthropicClient(**kwargs)
    if backend == "ollama":
        kwargs.pop("api_key", None)
        return OllamaClient(**kwargs)
    raise ValueError(f"unknown backend: {backend!r}; expected 'anthropic' or 'ollama'")


# Backward-compat alias — earlier scripts imported `Client` directly.
Client = AnthropicClient


DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-6",
    "ollama": "qwen2.5-coder:7b",
}
