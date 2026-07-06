"""StimulusProtocol — scripted or interactive stimuli delivered via the sono writer.

Events are (time, role_or_indices, amount). At each matching tick the environment writes
that stimulus through the NeuralOutput (sonogenetics), so the whole loop stays: device
→ brain → device. Works for any connectome.
"""

from __future__ import annotations

from .base import environments


@environments.register("stimulus_protocol")
class StimulusProtocol:
    def __init__(self, events=None) -> None:
        # events: list of {"t": int, "role": str, "amount": float}
        self.events = list(events or [])

    def before_step(self, engine, writer) -> None:
        for ev in self.events:
            if ev.get("t") == engine.t:
                target = ev.get("role")
                idx = engine.role_idx.get(target)
                if idx is not None and len(idx):
                    writer.write(engine, idx, ev.get("amount", 3.0))

    def after_step(self, engine, readout) -> None:  # hook for behavior/body models
        pass
