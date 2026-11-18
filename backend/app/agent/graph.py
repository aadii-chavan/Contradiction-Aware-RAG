"""LangGraph wiring for the agentic contradiction-detection workflow.

    understand → retrieve → analyze ─┬─(conflict)──→ classify ─┐
                                     └─(no conflict)───────────┴→ verify ─┬─(passed)──────────────→ generate → END
                                                                          ├─(failed, retries left)→ retrieve
                                                                          └─(failed, exhausted)───→ fallback → generate
"""

from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from . import nodes
from .state import AgentState

NODE_ORDER = ["understand", "retrieve", "analyze", "classify", "verify", "fallback", "generate"]


@lru_cache(maxsize=1)
def build_graph():
    g = StateGraph(AgentState)
    g.add_node("understand", nodes.understand)
    g.add_node("retrieve", nodes.retrieve)
    g.add_node("analyze", nodes.analyze)
    g.add_node("classify", nodes.classify)
    g.add_node("verify", nodes.verify)
    g.add_node("fallback", nodes.fallback)
    g.add_node("generate", nodes.generate)

    g.add_edge(START, "understand")
    g.add_edge("understand", "retrieve")
    g.add_edge("retrieve", "analyze")
    g.add_conditional_edges("analyze", nodes.route_after_analysis, {"classify": "classify", "verify": "verify"})
    g.add_edge("classify", "verify")
    g.add_conditional_edges("verify", nodes.route_after_verification, {"generate": "generate", "retrieve": "retrieve", "fallback": "fallback"})
    g.add_edge("fallback", "generate")
    g.add_edge("generate", END)
    return g.compile()
