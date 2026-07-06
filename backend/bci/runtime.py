"""Runtime — the authoritative loop that closes the four-part BCI loop (PLAN §5.1).

    environment writes stimulus (sono) → engine steps the twin → neural dust reads out.

Composes the Engine (Part 3/4) with the I/O contracts (Part 2) and an Environment. This
is what `bci run` and the API drive.
"""

from __future__ import annotations

from .connectome import sources
from .environment import environments
from .io import inputs, outputs
from .io.addressing import addressers
from .simulation import Engine


class Runtime:
    def __init__(self, engine: Engine, neural_output, neural_input, environment) -> None:
        self.engine = engine
        self.out = neural_output      # sono writer (WRITE)
        self.inp = neural_input       # dust reader (READ)
        self.env = environment

    def step(self):
        self.env.before_step(self.engine, self.out)   # sono write
        self.engine.step()                             # step the twin
        readout = self.inp.read(self.engine)           # dust read
        self.env.after_step(self.engine, readout)
        return readout

    def snapshot(self) -> dict:
        return self.engine.snapshot()

    def stimulate(self, role: str, amount: float = 3.4) -> None:
        """Interactive stimulus (e.g. from the GUI) via the sono writer."""
        idx = self.engine.role_idx.get(role)
        if idx is not None and len(idx):
            self.out.write(self.engine, idx, amount)

    @classmethod
    def build(
        cls,
        connectome_impl: str = "celegans",
        connectome_params: dict | None = None,
        engine_params: dict | None = None,
        events=None,
    ) -> "Runtime":
        """Compose a full runtime from config-selectable implementations."""
        connectome = sources.create(connectome_impl, **(connectome_params or {})).load()
        engine = Engine(connectome, **(engine_params or {}))
        addressing = addressers.create("idealized", n=engine.n)
        writer = outputs.create("simulated_sono", addressing=addressing)
        reader = inputs.create("simulated_dust", n=engine.n)
        env = environments.create("stimulus_protocol", events=events or [])
        return cls(engine, writer, reader, env)
