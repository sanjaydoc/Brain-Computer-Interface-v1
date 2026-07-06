"""Environment — the Part-4 world seam (PLAN §5.1).

`stimulus_protocol` is the universal default (scripted/interactive stimuli in, activity
out) that works for any connectome — worm to human. `worm_body` (OpenWorm-style) is an
optional worm-only add-on for later.
"""

from .base import Environment, environments
from . import stimulus  # noqa: F401  — registers "stimulus_protocol"

__all__ = ["Environment", "environments"]
