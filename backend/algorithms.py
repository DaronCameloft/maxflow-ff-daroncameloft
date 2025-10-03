from collections import deque
from typing import List, Tuple, Dict, Any

def edmonds_karp(n: int, edges: List[Tuple[int,int,float]], s: int, t: int) -> Dict[str, Any]:
    cap = [[0.0]*n for _ in range(n)]
    adj = [[] for _ in range(n)]
    for u, v, c in edges:
        cap[u][v] += c
        adj[u].append(v); adj[v].append(u)

    parent = [-1]*n
    logs = []
    flow = 0.0

    def bfs():
        nonlocal parent
        parent = [-1]*n; parent[s] = -2
        q = deque([(s, float("inf"))])
        while q:
            u, f = q.popleft()
            for v in adj[u]:
                if parent[v] == -1 and cap[u][v] > 1e-12:
                    parent[v] = u
                    nf = min(f, cap[u][v])
                    if v == t: return nf
                    q.append((v, nf))
        return 0.0

    while True:
        bottleneck = bfs()
        if bottleneck <= 0: break
        path, v = [], t
        while v != s:
            u = parent[v]
            path.append((u, v))
            cap[u][v] -= bottleneck
            cap[v][u] += bottleneck
            v = u
        path.reverse()
        flow += bottleneck
        logs.append({"augmenting_path": path, "bottleneck": bottleneck, "flow_so_far": flow})

    flow_assign = {}
    for u, v, _ in edges:
        pushed = max(0.0, cap[v][u])
        flow_assign[(u, v)] = pushed if pushed > 1e-12 else 0.0

    seen = [False]*n
    dq = deque([s]); seen[s] = True
    while dq:
        u = dq.popleft()
        for v in adj[u]:
            if not seen[v] and cap[u][v] > 1e-12:
                seen[v] = True; dq.append(v)
    S = [i for i in range(n) if seen[i]]; T = [i for i in range(n) if not seen[i]]
    min_cut_edges = [(u, v) for u in S for v in adj[u] if v in T]

    return {
        "max_flow": flow,
        "logs": logs,
        "flow_assignments": [{"u": u, "v": v, "flow": f} for (u, v), f in flow_assign.items()],
        "min_cut": {"S": S, "T": T, "edges_S_to_T": min_cut_edges}
    }
