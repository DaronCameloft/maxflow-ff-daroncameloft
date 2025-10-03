from pydantic import BaseModel, Field
from typing import List

class Edge(BaseModel):
    u: int
    v: int
    capacity: float = Field(..., ge=0)

class GraphInput(BaseModel):
    n: int = Field(..., ge=8, le=16)
    edges: List[Edge]
    source: int
    sink: int
