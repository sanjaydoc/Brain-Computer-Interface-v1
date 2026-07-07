"""WaveInventor — invents a new wave (a combination of physical wave modalities) that meets a
goal on neural tissue. Adapted from inventor-studio-v3's invention agent (services/agents/
mvpGenerator.js): an LLM reasoning call with retries + robust JSON extraction, producing a
critiqued structured spec, with a deterministic rule-based fallback so it always returns a
wave (hosted demo / CI / no LLM).

Why combine modalities: ultrasound alone only reaches its focal spot — it leaves blind spots.
A good invented wave picks 2-4 modalities whose reaches are COMPLEMENTARY (deep + surface +
whole-volume), so together they cover the whole brain.
"""

from __future__ import annotations

from .. import llm

# modality ids MUST match the frontend MODES table (docs/app/js/waves.js)
MODES = {
    "ultrasound": "focused acoustic — deep but a tiny focal spot",
    "infrasound": "low-frequency acoustic — broad, weak, diffuse",
    "radio": "radio/MRI — penetrates the whole volume",
    "microwave": "microwave — medium depth",
    "infrared": "optical/NIR (fNIRS) — cortical surface only, blind to depth",
    "xray": "X-ray — a penetrating band (CT-like)",
    "gamma": "gamma/PET — whole-volume, functional/metabolic",
}
WAVEFORMS = ("pulse", "continuous", "burst", "chirp")


def build_invent_prompt(goal: str) -> str:
    modes = "\n".join(f"- {k}: {v}" for k, v in MODES.items())
    return f"""You are the Wave Inventor Agent for a brain-computer interface. Invent ONE new wave —
a combination of physical wave modalities across the acoustic + electromagnetic spectrum — that
achieves this goal on neural tissue. Output ONLY raw JSON, no markdown.

GOAL: {goal[:300]}

Available modalities (id: reach):
{modes}
Waveforms: {", ".join(WAVEFORMS)}

Rules:
- Choose 2-4 modalities whose reaches are COMPLEMENTARY (cover deep + surface + whole-volume →
  no blind spots). Ultrasound alone is not enough.
- "sign": +1 to excite neurons, -1 to inhibit. "freq" 0.3-2.0 (modulation). "amplitude" 1-8.

JSON:
{{"name":"short catchy name","modes":["ultrasound","infrared","radio"],"waveform":"pulse","freq":1.0,"amplitude":5,"sign":1,"rationale":"one sentence on why this covers the goal","noveltyScore":0.8,"coverageEstimate":0.95}}"""


def sanitize_wave(raw: dict, goal: str = "") -> dict:
    modes, seen = [], set()
    for m in (raw.get("modes") or []):
        m = str(m).strip().lower()
        if m in MODES and m not in seen:
            seen.add(m); modes.append(m)
    modes = modes[:4]
    if len(modes) < 2:   # ensure a real, complementary combination
        for m in ("ultrasound", "infrared", "radio"):
            if m not in seen:
                modes.append(m); seen.add(m)
            if len(modes) >= 3:
                break
    waveform = raw.get("waveform") if raw.get("waveform") in WAVEFORMS else "pulse"
    freq = _clamp(_num(raw.get("freq"), 1.0), 0.3, 2.0)
    amplitude = _clamp(_num(raw.get("amplitude"), 5), 1, 8)
    sign = 1 if _num(raw.get("sign"), 1) >= 0 else -1
    name = str(raw.get("name") or _name_from(goal)).strip()[:40] or "Invented-Wave"
    return {
        "name": name, "modes": modes, "waveform": waveform, "freq": round(freq, 2),
        "amplitude": amplitude, "sign": sign,
        "rationale": str(raw.get("rationale") or f"Combines {', '.join(modes)} for complementary reach.")[:200],
        "noveltyScore": round(_clamp(_num(raw.get("noveltyScore"), 0.6), 0, 1), 2),
        "coverageEstimate": round(_clamp(_num(raw.get("coverageEstimate"), 0.9), 0, 1), 2),
    }


def compose_wave(goal: str) -> dict:
    """Deterministic rule-based inventor — used when no LLM is available."""
    t = (goal or "").lower()
    want = lambda *ks: any(k in t for k in ks)
    modes: list[str] = []
    if want("deep", "subcortical", "thalam", "whole", "entire", "map", "all"):
        modes += ["ultrasound", "radio"]
    if want("surface", "cortical", "cortex", "optical", "fnirs", "scalp"):
        modes += ["infrared"]
    if want("functional", "metabolic", "activity", "pet", "blood"):
        modes += ["gamma"]
    if want("bone", "skull", "structural", "ct", "dense"):
        modes += ["xray"]
    if want("broad", "diffuse", "field", "wide"):
        modes += ["infrasound"]
    if not modes:
        modes = ["ultrasound", "infrared", "radio"]   # default blind-spot cover
    waveform = ("chirp" if want("scan", "sweep", "image")
                else "burst" if want("stimulate", "drive", "pulse")
                else "continuous" if want("monitor", "continuous", "record", "read")
                else "pulse")
    return sanitize_wave({"name": _name_from(goal), "modes": modes, "waveform": waveform,
                          "freq": 1.0, "amplitude": 5, "sign": 1,
                          "rationale": f"Combines {', '.join(dict.fromkeys(modes))} so their reaches cover deep, surface and whole-volume tissue — no blind spots.",
                          "noveltyScore": 0.6, "coverageEstimate": 0.9}, goal)


class WaveInventor:
    def backends(self) -> dict:
        return {"llm": llm.available(), "provider": llm.provider(), "fallback": True}

    def invent(self, goal: str, *, backend: str = "auto") -> dict:
        goal = (goal or "").strip()
        if not goal:
            raise ValueError("goal is required")
        chosen = backend if backend != "auto" else ("llm" if llm.available() else "fallback")
        note = None
        if chosen == "llm":
            for _ in range(3):
                try:
                    parsed = llm.extract_json(llm.invoke_json(build_invent_prompt(goal), max_tokens=700))
                except Exception as exc:
                    parsed, note, chosen = None, f"llm failed ({exc}); used fallback", "fallback"
                    break
                if parsed and parsed.get("modes"):
                    return {**sanitize_wave(parsed, goal), "backend": "llm", "provider": llm.provider()}
            if chosen == "llm":
                note, chosen = "llm returned no usable wave; used fallback", "fallback"
        out = {**compose_wave(goal), "backend": "fallback"}
        if note:
            out["note"] = note
        return out


def _num(x, default):
    try:
        return float(x)
    except Exception:
        return default


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def _name_from(goal: str) -> str:
    words = [w for w in "".join(c if c.isalnum() or c == " " else " " for c in (goal or "")).split() if len(w) > 2]
    return ("".join(w.capitalize() for w in words[:2]) or "Invented") + "-Wave"
