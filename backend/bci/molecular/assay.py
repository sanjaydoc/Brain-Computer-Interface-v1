"""Connectome assay — test a generated channel on the living twin.

A sonogenetic channel makes its target neurons ultrasound-responsive. The assay makes
those neurons express the channel (sono-write gain ∝ its modeled sensitivity), delivers an
ultrasound pulse, and measures the neural + locomotion response — a *real simulation* of
the connectome given the channel's (proxy) properties. Better-coupled / more-sensitive
channels produce a larger, measurable effect, so candidates can be ranked.
"""

from __future__ import annotations

import numpy as np

from ..connectome import Connectome
from ..simulation import Engine
from .channel import SonogeneticChannel


def test_on_connectome(
    connectome: Connectome,
    channel: SonogeneticChannel,
    *,
    pulse_base: float = 2.2,
    warmup: int = 120,
    observe: int = 80,
    seed: int = 1,
) -> dict:
    """Deliver an ultrasound pulse through the channel and measure the response."""
    eng = Engine(connectome, seed=seed)
    for _ in range(warmup):
        eng.step()
    base_loco = float(np.mean([eng.locomotion() for _ in range(20)]))

    # ultrasound WRITE via the channel: gain scales with modeled sensitivity
    eng.inject_role(channel.target, pulse_base * channel.sensitivity)

    peak_firing = 0
    loco_peak = 0.0   # largest-magnitude signed excursion from baseline
    for _ in range(observe):
        eng.step()
        peak_firing = max(peak_firing, int((eng.activity > 0.1).sum()))
        d = eng.locomotion() - base_loco
        if abs(d) > abs(loco_peak):
            loco_peak = d

    # a simple 0..1 score: how strongly the pulse moved the command circuit
    score = round(min(1.0, abs(loco_peak) / 2.0), 3)
    direction = "reverse" if loco_peak < -0.05 else ("forward" if loco_peak > 0.05 else "weak")
    return {
        "channel": channel.id,
        "sensitivity": channel.sensitivity,
        "target": channel.target,
        "peak_firing": peak_firing,
        "loco_response": round(float(loco_peak), 3),
        "direction": direction,
        "score": score,
    }
