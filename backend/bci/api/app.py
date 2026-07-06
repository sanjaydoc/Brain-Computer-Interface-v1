"""FastAPI app — REST for connectome data + a WebSocket that streams live simulation.

This is the "live mode" backend behind the LabSuite-style GUI (which also has a pure
browser "demo mode"). REST serves any connectome; the WebSocket runs a Runtime and pushes
per-tick frames, and accepts stimulate commands — the same four-part loop as `bci run`,
now streamed.
"""

from __future__ import annotations

import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from ..connectome import sources
from ..runtime import Runtime


def _connectome_payload(impl: str) -> dict:
    c = sources.create(impl).load()
    coo = c.weights.tocoo()
    outdeg = [int(x) for x in c.weights.getnnz(axis=1).ravel()]
    return {
        "name": impl,
        "n_neurons": c.n_neurons,
        "n_synapses": c.n_synapses,
        "ids": c.ids.tolist(),
        "types": c.types.tolist(),
        "pos": [[round(float(v), 3) for v in row] for row in c.pos],
        "outdeg": outdeg,
        "edges": [[int(i), int(j), float(w)]
                  for i, j, w in zip(coo.row.tolist(), coo.col.tolist(), coo.data.tolist())],
    }


def create_app() -> FastAPI:
    app = FastAPI(title="Brain-Computer-Interface", version="0.1.0")

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True, "sources": list(sources.keys())}

    @app.get("/api/connectome/{impl}")
    def connectome(impl: str) -> dict:
        return _connectome_payload(impl)

    @app.websocket("/ws")
    async def ws(websocket: WebSocket) -> None:
        await websocket.accept()
        impl = websocket.query_params.get("connectome", "celegans")
        rt = Runtime.build(connectome_impl=impl)
        try:
            while True:
                # drain any pending stimulate commands (non-blocking)
                try:
                    while True:
                        msg = await asyncio.wait_for(websocket.receive_json(), timeout=0.001)
                        if msg.get("cmd") == "stimulate":
                            rt.stimulate(msg.get("role", "fwd"), float(msg.get("amount", 3.4)))
                        elif msg.get("cmd") == "reset":
                            rt.engine.reset()
                except asyncio.TimeoutError:
                    pass
                for _ in range(2):
                    rt.step()
                s = rt.snapshot()
                await websocket.send_json({
                    "t": s["t"], "firing": s["firing"], "locomotion": s["locomotion"],
                    "activity": [round(float(x), 3) for x in rt.engine.activity],
                })
                await asyncio.sleep(0.033)
        except WebSocketDisconnect:
            return

    return app


app = create_app()
