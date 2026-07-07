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


def _run(impl: str, steps: int, neuron: str) -> None:
    """Run the full four-part loop headless and show emergent locomotion."""
    from .runtime import Runtime

    events = [
        {"t": 120, "role": "fwd", "amount": 3.4},   # drive forward command
        {"t": 360, "role": "rev", "amount": 3.4},   # drive reverse command
    ]
    rt = Runtime.build(connectome_impl=impl, engine_params={"neuron_impl": neuron}, events=events)
    print(f"running {impl} ({neuron}): {rt.engine.n} neurons — driving fwd@120, rev@360\n")
    print(f"{'t':>5} {'firing':>7} {'locomotion':>11}  behavior")
    for _ in range(steps):
        rt.step()
        if rt.engine.t % 40 == 0:
            s = rt.snapshot()
            loco = s["locomotion"]
            beh = "reverse ←" if loco < -0.02 else ("forward →" if loco > 0.02 else "idle")
            print(f"{s['t']:>5} {s['firing']:>7} {loco:>+11.3f}  {beh}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="bci")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_load = sub.add_parser("load", help="build a connectome from a profile and print stats")
    p_load.add_argument("profile", help="path to a profile YAML")

    sub.add_parser("sources", help="list registered connectome sources")

    p_run = sub.add_parser("run", help="run the full four-part loop headless")
    p_run.add_argument("--connectome", default="celegans", help="connectome source (default: celegans)")
    p_run.add_argument("--steps", type=int, default=520, help="number of steps")
    p_run.add_argument("--neuron", default="lif", choices=["lif", "hodgkin_huxley"], help="neuron model")

    p_serve = sub.add_parser("serve", help="serve the REST + WebSocket live API")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=8000)

    args = parser.parse_args(argv)
    if args.cmd == "load":
        _load(args.profile)
    elif args.cmd == "sources":
        _sources()
    elif args.cmd == "run":
        _run(args.connectome, args.steps, args.neuron)
    elif args.cmd == "serve":
        import uvicorn

        print(f"\n  BCI control plane → http://{args.host}:{args.port}/app/")
        print(f"  API + live WebSocket → http://{args.host}:{args.port}/api/health\n")
        uvicorn.run("bci.api.app:app", host=args.host, port=args.port)
    return 0


if __name__ == "__main__":
    sys.exit(main())
