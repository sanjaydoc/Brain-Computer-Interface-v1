"""bci CLI — P0 entry point.

    bci load profiles/synthetic_small.yaml     # build a connectome from a profile, print stats
    bci sources                                 # list registered connectome sources
"""

from __future__ import annotations

import argparse
import sys
import time

from .config import Config
from .connectome import sources


def _load(path: str) -> None:
    cfg = Config.load(path)
    t0 = time.perf_counter()
    source = sources.create(cfg.connectome.impl, **cfg.connectome.params)
    connectome = source.load()
    dt = time.perf_counter() - t0
    print(f"profile: {cfg.name}  (source: {cfg.connectome.impl})")
    print(connectome.summary())
    print(f"loaded in {dt * 1000:.1f} ms")


def _sources() -> None:
    print("connectome sources:", ", ".join(sources.keys()))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="bci")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_load = sub.add_parser("load", help="build a connectome from a profile and print stats")
    p_load.add_argument("profile", help="path to a profile YAML")

    sub.add_parser("sources", help="list registered connectome sources")

    args = parser.parse_args(argv)
    if args.cmd == "load":
        _load(args.profile)
    elif args.cmd == "sources":
        _sources()
    return 0


if __name__ == "__main__":
    sys.exit(main())
