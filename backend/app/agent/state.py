"""Workflow state shared by every LangGraph node."""

import operator
from typing import Annotated, Literal, TypedDict

from pydantic import BaseModel, Field

MAX_ATTEMPTS = 2  # retrieval attempts before falling back


class QueryUnderstanding(BaseModel):
    intent: str = Field(description="One short phrase: what the user wants, e.g. 'look up a training hyperparameter'.")
    target: str = Field(description="The specific fact or parameter asked about, e.g. 'peak learning rate'.")
    entities: list[str] = Field(description="Named models, datasets, components or systems in the question.")
    search_query: str = Field(description="A keyword-rich rewrite of the question for document search.")


class Claim(BaseModel):
    doc_id: str = Field(description="Document ID, e.g. DOC-04.")
    value: str = Field(description="Shortest span copied VERBATIM from that document that states its value for the target (e.g. '3e-4', 'GroupNorm').")
    statement: str = Field(description="One-sentence paraphrase of what the document says about the target.")


class ConflictAnalysis(BaseModel):
    claims: list[Claim] = Field(description="One claim per document that states something about the target. Omit irrelevant documents.")
    conflict: bool = Field(description="True only if two documents give incompatible values for the same target.")
    conflicting_ids: list[str] = Field(description="The two disagreeing document IDs, or empty.")
    reasoning: str = Field(description="One or two sentences explaining the decision.")


class ConflictClassification(BaseModel):
    type: Literal["direct", "temporal", "none"] = Field(
        description="'temporal' if the newer document revises/replaces the older one; 'direct' if both claim to be current but disagree; 'none' if on reflection they do not truly conflict (different scope or setting)."
    )
    rationale: str = Field(description="One sentence justifying the label, citing dates or wording.")
    authoritative_id: str | None = Field(default=None, description="The document that should be trusted more, if any.")


class FinalAnswer(BaseModel):
    answer: str = Field(description="2-4 sentence answer citing document IDs in square brackets.")


class TraceEntry(TypedDict, total=False):
    node: str
    attempt: int
    status: Literal["done", "error"]
    ms: int
    summary: str


class AgentState(TypedDict, total=False):
    query: str
    simulate_failure: bool  # demo toggle: fail verification on the first attempt to show the retry path
    attempt: int
    understanding: dict
    retrieval: dict  # {mode, query, k, chunks, latencyMs}
    analysis: dict
    classification: dict
    verification: dict
    fallback: dict
    result: dict
    trace: Annotated[list[TraceEntry], operator.add]
