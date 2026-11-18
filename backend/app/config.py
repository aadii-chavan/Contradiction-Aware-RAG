"""Settings shared by the backend, read from the project's root .env (same file the Vite server uses)."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
load_dotenv(ROOT / ".env")

CORPUS_FILE = ROOT / "data" / "corpus.json"
EVAL_FILE = ROOT / "data" / "evalSet.json"
CHROMA_DIR = Path(os.getenv("CHROMA_DIR", BACKEND / ".chroma"))
MODEL_CACHE = Path(os.getenv("MODEL_CACHE_DIR", BACKEND / ".models"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "768"))
RERANK_MODEL = os.getenv("RERANK_MODEL", "ms-marco-MiniLM-L-12-v2")

TOP_K = 4
CHUNK_SIZE = 256
CHUNK_OVERLAP = 32
