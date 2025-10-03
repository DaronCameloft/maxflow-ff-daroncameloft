from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from models import GraphInput
from algorithms import edmonds_karp
from random import random, randint

app = FastAPI(title="MaxFlow API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"]
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/maxflow")
def compute_maxflow(payload: GraphInput):
    edges_tuples = [(e.u, e.v, e.capacity) for e in payload.edges]
    return edmonds_karp(payload.n, edges_tuples, payload.source, payload.sink)



@app.get("/api/random")
def random_graph(n: int = 8, density: float = 0.3, cmin: int = 1, cmax: int = 20):
    assert 8 <= n <= 16, "n fuera de rango"
    edges = []
    for u in range(n):
        for v in range(n):
            if u != v and random() < density:
                edges.append({"u": u, "v": v, "capacity": randint(cmin, cmax)})
    # Garantiza al menos una salida desde 0 y una llegada a n-1
    if not any(e["u"] == 0 for e in edges):
        edges.append({"u": 0, "v": randint(1, n-1), "capacity": randint(cmin, cmax)})
    if not any(e["v"] == n-1 for e in edges):
        edges.append({"u": randint(0, n-2), "v": n-1, "capacity": randint(cmin, cmax)})
    return {"n": n, "edges": edges, "source": 0, "sink": n-1}
