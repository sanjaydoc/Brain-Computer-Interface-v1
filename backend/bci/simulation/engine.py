"""Engine — the living twin's authoritative loop (PLAN §5.1, §6.3).

Ties the connectome (Brain Template) to a NeuronModel + Stepper and runs one loop:
    read stimulus (sono write) → propagate synapses → step neurons → publish snapshot.
Locomotion is *decoded from the real command-neuron activity* — not scripted — so the
worm's behavior emerges from simulating the connectome.
"""

from __future__ import annotations

import numpy as np

from ..connectome import Connectome
from .neuron import models as neuron_models
from .stepper import NumpyStepper, build_transpose, steppers  # noqa: F401

# GABAergic (inhibitory) neuron families — their synapses are negative.
INHIBITORY_PREFIXES = ("DD", "VD", "RME", "RIS", "AVL", "DVB", "RID")

# Locomotion command circuit (the touch-response wiring).
ROLES = {
    "fwd": ("AVBL", "AVBR", "PVCL", "PVCR"),
    "rev": ("AVAL", "AVAR", "AVDL", "AVDR", "AVEL", "AVER"),
    "touch_anterior": ("ALML", "ALMR", "AVM"),
    "touch_posterior": ("PLML", "PLMR", "PVM"),
}


def inhibitory_mask(ids: np.ndarray) -> np.ndarray:
    sign = np.ones(len(ids), dtype=np.float32)
    for i, name in enumerate(ids):
        if str(name).startswith(INHIBITORY_PREFIXES):
            sign[i] = -1.0
    return sign


class Engine:
    """The virtual environment's simulation core over one connectome."""

    def __init__(
        self,
        connectome: Connectome,
        neuron_impl: str = "lif",
        neuron_params: dict | None = None,
        gsyn: float = 0.9,
        bias: float = 0.05,      # background excitability -> sustained spontaneous activity
        noise: float = 0.05,
        global_inhibition: float = 2.2,
        stim_decay: float = 0.96,
        row_normalize: bool = True,
        seed: int = 0,
    ) -> None:
        self.c = connectome
        self.n = connectome.n_neurons
        self.neuron = neuron_models.create(neuron_impl, n=self.n, **(neuron_params or {}))
        # Real excit/inhib sign if the connectome carries it (e.g. FlyWire neurotransmitters);
        # otherwise fall back to the name-based heuristic (C. elegans GABAergic families).
        self.sign = (connectome.sign if getattr(connectome, "sign", None) is not None
                     else inhibitory_mask(connectome.ids))
        wt = build_transpose(connectome.weights, self.sign, row_normalize=row_normalize)
        self.stepper = NumpyStepper(wt, gsyn=gsyn)

        self.bias = float(bias)
        self.noise = float(noise)
        self.global_inh = float(global_inhibition)
        self.stim_decay = float(stim_decay)
        self.rng = np.random.default_rng(seed)

        self.spikes = np.zeros(self.n, dtype=bool)
        self.stim = np.zeros(self.n, dtype=np.float32)   # injected current (sono write)
        self.pop = 0.0                                    # population firing rate
        self.t = 0

        self.index = {str(name): i for i, name in enumerate(connectome.ids)}
        self.role_idx = {
            k: np.array([self.index[n] for n in names if n in self.index], dtype=np.int64)
            for k, names in ROLES.items()
        }

    # --- sono WRITE path: inject stimulus current into target neurons ------------
    def inject(self, indices, amount: float = 3.0) -> None:
        self.stim[np.asarray(indices, dtype=np.int64)] += amount

    def inject_role(self, role: str, amount: float = 3.0) -> None:
        self.inject(self.role_idx.get(role, []), amount)

    # --- one authoritative tick --------------------------------------------------
    def step(self, dt: float = 1.0) -> None:
        syn = self.stepper.propagate(self.spikes)
        gi = self.global_inh * self.pop
        drive = syn + self.stim + self.bias - gi
        drive += (self.rng.random(self.n, dtype=np.float32) - 0.5) * self.noise
        self.spikes = self.neuron.step(drive, dt)
        self.pop = self.pop * 0.9 + (self.spikes.mean()) * 0.1
        self.stim *= self.stim_decay
        self.t += 1

    # --- readouts (neural-dust READ path observes these) -------------------------
    @property
    def activity(self) -> np.ndarray:
        return self.neuron.activity

    def role_activity(self, role: str) -> float:
        idx = self.role_idx.get(role)
        if idx is None or len(idx) == 0:
            return 0.0
        return float(self.neuron.activity[idx].mean())

    def locomotion(self) -> float:
        """Decoded from the command neurons: forward drive − reverse drive.
        > 0 forward, < 0 reverse. Emerges from the simulated connectome."""
        return self.role_activity("fwd") - self.role_activity("rev")

    def snapshot(self) -> dict:
        return {
            "t": self.t,
            "firing": int((self.neuron.activity > 0.1).sum()),
            "mean": float(self.neuron.activity.mean()),
            "fwd": self.role_activity("fwd"),
            "rev": self.role_activity("rev"),
            "locomotion": self.locomotion(),
        }

    def reset(self) -> None:
        self.neuron.reset()
        self.spikes[:] = False
        self.stim[:] = 0
        self.pop = 0.0
        self.t = 0
