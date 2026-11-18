"""Gemini chat model via LangChain, with typed (structured) outputs."""

from functools import lru_cache
from typing import TypeVar

from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from .config import GEMINI_API_KEY, GEMINI_MODEL

T = TypeVar("T", bound=BaseModel)


@lru_cache(maxsize=1)
def chat_model() -> ChatGoogleGenerativeAI:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set. Add it to .env and restart the backend.")
    # thinking_budget=0 matches the Node client: latency reflects the prompt, not a reasoning pass.
    return ChatGoogleGenerativeAI(model=GEMINI_MODEL, google_api_key=GEMINI_API_KEY, temperature=0, thinking_budget=0, max_retries=2)


def structured(schema: type[T], system: str, user: str) -> T:
    result = chat_model().with_structured_output(schema).invoke([("system", system), ("human", user)])
    if result is None:
        raise RuntimeError(f"Model returned no {schema.__name__}.")
    return result  # type: ignore[return-value]
