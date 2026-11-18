# Contradiction-Aware RAG

A small RAG demo that compares two prompt strategies over the same retrieved context:

- **Baseline prompt**: answers from the retrieved documents and cites them.
- **Conflict-aware prompt**: first checks whether the documents disagree (a *direct* conflict or a *temporal* one), shows the conflicting sources side by side, and answers accordingly.

Retrieval runs over a seeded corpus of lab notes, some of which deliberately contradict each other. The LLM is Gemini 2.5 Flash.

Two additions run in a Python FastAPI backend:

- **Semantic and hybrid retrieval** (LangChain + ChromaDB): Gemini embeddings in a persistent Chroma store, fused with the original TF-IDF retriever and reranked by a cross-encoder. The **Retrieval lab** compares all three on the same query.
- **Agentic contradiction detection** (LangGraph): a six-step workflow (understand → retrieve → analyse → classify → verify → answer) with conditional routing, retry and fallback, streamed live to a visual tracker on the **Agent workflow** page.

```
React + TypeScript (Vite)
   │  /api/*  ──►  Node API (Vite plugin): TF-IDF, both prompts, evaluation, documents
   │                   └── vector / hybrid retrieval ──┐
   │  /py/*   ──►  Python FastAPI (port 8000)  ◄───────┘
   │                   ├── LangChain: chunking, Gemini embeddings, retrievers, reranker
   │                   ├── ChromaDB: persistent vectors in backend/.chroma
   │                   └── LangGraph: contradiction-detection agent
   └── data/corpus.json, data/evalSet.json (shared by both backends)
```

## Requirements

- Node.js 20.19 or newer (required by Vite 7)
- Python 3.10 to 3.13 for the backend (tested on 3.13)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey); it is used for both the LLM and the embeddings

## Run it

```bash
npm install
cp .env.example .env
```

Open `.env` and paste your key:

```
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.5-flash
```

Set up the Python backend once:

```bash
npm run backend:setup          # creates backend/.venv and installs backend/requirements.txt
```

If your default `python3` is 3.14 or newer, create the venv with an older interpreter instead: `python3.13 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt`.

Then start everything:

```bash
npm run dev:all                # Python backend on :8000 + Vite on :5173
```

Or run the two servers in separate terminals with `npm run backend` and `npm run dev`. Open http://localhost:5173. Restart both after changing `.env`.

On first start the backend embeds the 52 documents into ChromaDB (one batched Gemini call) and downloads the ~22 MB FlashRank reranker model into `backend/.models`. After that, vectors persist in `backend/.chroma`, and only edited documents are re-embedded.

Without the Python backend, the original app still works: the Search tab, TF-IDF retrieval, evaluation and documents. The header shows whether the backend is online.

Other scripts:

```bash
npm run backend   # Python backend only, auto-reloads on changes
npm run build     # type-check and build
npm run preview   # serve the production build (API included)
```

## Using the app

**Search tab**
- Pick a document question from the **Prompts & documents** panel or type your own, then press **Run both**. Both prompts run on the same top-4 retrieved chunks, with their latencies shown.
- The **Retriever** toggle picks TF-IDF (in-process, the default), Vector, or Hybrid for both prompts. Vector and Hybrid results show their per-retriever ranks and scores.
- The same panel has tabs for editing the baseline and conflict-aware system prompts (saved in your browser, with a reset button).
- Keep the JSON response format in the conflict-aware prompt, or the conflict banner and source cards will not render.
- Each retrieved chunk has an **Edit document** link.

**Documents tab** (the document icon in the sidebar)
- Browse, search, create, edit and delete documents. Each document also has a sample question.
- **Generate missing questions** asks Gemini to write one question for every document that lacks one.
- Changes are saved to `data/corpus.json` and apply to the next query.

**Retrieval lab** (the list icon in the sidebar, `#/retrieval`), for Demo 1
- Runs one query through **TF-IDF**, **Vector** and **Hybrid** side by side, showing ranked document IDs, scores and latency. Documents found by only one retriever are highlighted, and hovering a document traces it across the columns.
- **How hybrid ranked the candidates** shows the whole fusion: each candidate's TF-IDF and vector rank and score, the fused score, the cross-encoder score and whether it made the top 4.
- **Retrieval benchmark** checks, for the 20 seeded-conflict queries, whether each retriever puts **both** conflicting documents in its top 4. It uses no LLM calls. Choose the benchmark's own wording or `data/paraphraseSet.json`, the same 20 questions reworded to avoid the documents' keywords.

| Both conflicting docs in top 4 | TF-IDF | Vector | Hybrid |
|---|---|---|---|
| Benchmark wording (20) | 20 | 20 | 20 |
| Paraphrased (20) | 7 | 19 | 19 |

The fusion weights were chosen from these sets. Plain Reciprocal Rank Fusion managed 12/20 on the paraphrases. Letting the MS-MARCO cross-encoder reorder results on its own managed 10/20, because it is weak on these short technical notes. So hybrid min-max normalises each retriever's scores, combines them as 0.3 × TF-IDF + 0.7 × vector, and blends the cross-encoder in at weight 0.3 rather than letting it decide the order.

Good demo queries: *How frequently do we write model snapshots to disk?* Here TF-IDF misses the older checkpoint note (DOC-27), so in the Search tab the conflict-aware prompt flags the wrong pair with TF-IDF and the real DOC-27 ↔ DOC-28 conflict with Hybrid.

**Agent workflow** (the graph icon, `#/agent`), for Demo 2
- Runs a query through the LangGraph workflow and streams each node's status (waiting / running / done / skipped / error), timing and routing decision to the graph as it runs. Click any node to inspect its output.

| Node | What it does |
|---|---|
| 1. Understand query | LLM extracts the intent, the target fact, the entities and a keyword search query |
| 2. Hybrid retrieval | Hybrid retrieval, top 4. A retry broadens to the rewritten query with k = 6 and keeps the earlier documents |
| 3. Conflict analysis | LLM extracts one claim per document with the value quoted verbatim, and decides whether two documents conflict |
| 4. Classification | Runs only when a conflict was found. LLM labels it **direct**, **temporal** or **no conflict** (dismissed) and names the document to trust. Code guards check that a temporal conflict has different dates |
| 5. Evidence check | Deterministic, with no LLM. Every quoted value must appear verbatim in a retrieved document, the two conflicting values must differ, and a temporal pair must have distinct dates |
| ↺ Fallback | Runs if verification fails twice. The answer uses only verified evidence and is marked low confidence |
| 6. Final answer | LLM writes the answer from the verified evidence. The UI shows the conflict banner, the highlighted source pair and the trusted document |

Routing: after analysis, a conflict goes to classification and no conflict goes straight to verification. After verification, a pass goes to the answer. A failure goes back to retrieval with feedback on what failed, up to 2 attempts, and then to fallback. Tick **Simulate a failed verification** to force the retry path on demand. The run's state and trace are kept in the LangGraph state and returned at the end.

**Evaluation**
- **Run evaluation** runs the 30 labelled queries in `data/evalSet.json` (20 seeded conflicts, 10 clean controls) against both prompts, with live progress. It always uses the default prompts and takes about a minute. The retriever toggle next to the button runs it over TF-IDF (the original setup), Vector or Hybrid retrieval.
- Metrics: conflicts detected, false alarms, attribution accuracy (the answer names both seeded documents) and average latency.
- The baseline counts as detecting a conflict only if its answer uses words like "conflict" or "disagree", so its detection score is strict.
- Editing or deleting a seeded conflict document changes what the evaluation measures.

## Project layout

```
data/corpus.json     the document corpus (editable from the app)
data/evalSet.json    the 30 labelled queries (shared by Node and Python)
data/paraphraseSet.json  the 20 conflict queries reworded, for the retrieval benchmark
server/              API, retriever, prompts and Gemini client (Vite plugin)
  pyBackend.ts       client for the Python backend (vector / hybrid retrieval)
  corpus.ts          loads, edits and saves the corpus
  retriever.ts       TF-IDF cosine retrieval, top 4
  prompts.ts         default baseline and conflict-aware prompts
  pipeline.ts        runs both prompts on the retrieved chunks
  evaluate.ts        streaming evaluation
  evalSet.ts         typed wrapper around data/evalSet.json
  llm.ts             Gemini generateContent client
src/                 React + TypeScript UI
  components/RetrievalLab.tsx    Demo 1: retriever comparison + benchmark
  components/AgentWorkflow.tsx   Demo 2: live LangGraph tracker
backend/             Python FastAPI service
  app/main.py        endpoints
  app/corpus.py      loads data/corpus.json, LangChain chunking (reloads when the file changes)
  app/tfidf.py       Python port of server/retriever.ts (identical scores)
  app/vectorstore.py ChromaDB + Gemini embeddings, incremental sync
  app/rerank.py      FlashRank cross-encoder as a LangChain document compressor
  app/retrieval.py   tfidf / vector / hybrid retrieval and fusion
  app/agent/         LangGraph state, nodes and graph
scripts/dev-all.mjs  starts both servers
```

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/info` | retriever, model and whether the key is configured |
| `POST /api/query` | `{ query, prompts? }` runs both prompts |
| `POST /api/eval` | streams evaluation progress as newline-delimited JSON |
| `GET /api/prompts` | default prompts |
| `GET/POST /api/docs`, `PUT/DELETE /api/docs/:id` | manage documents |
| `POST /api/docs/generate-prompts` | generate sample questions |

`/api/query` and `/api/eval` also accept `retriever: "tfidf" | "vector" | "hybrid"`.

Python backend (port 8000; the UI reaches it through the Vite proxy at `/py`). Interactive docs are at http://localhost:8000/docs.

| Endpoint | Purpose |
|---|---|
| `GET /health` | models, index status |
| `POST /retrieve` | `{ query, mode, k?, rerank? }` one retriever |
| `POST /retrieve/compare` | `{ query }` all three retrievers |
| `POST /retrieve/benchmark` | `{ set: "eval" \| "paraphrase" }` retrieval metrics |
| `POST /agent/stream` | `{ query, simulate_failure? }` streams node events as NDJSON |
| `POST /agent/run` | same, returns only the final state and trace |
| `GET /agent/graph` | the compiled graph's nodes, edges and Mermaid source |
| `POST /index/sync` | force a Chroma re-sync |

## Troubleshooting

- **"GEMINI_API_KEY is not set"**: add the key to `.env` and restart the dev server.
- **Gemini request failed (429)**: you hit the free-tier rate limit; wait a minute and retry.
- **"The Python backend is not running"**: start it with `npm run backend` or `npm run dev:all`. Vector, Hybrid, the Retrieval lab and the Agent workflow need it.
- **Changing the embedding model** (`EMBEDDING_MODEL` / `EMBEDDING_DIM` in `.env`) creates a new Chroma collection, so vectors from different models never mix.
- **The conflict cards do not show**: check that your edited conflict-aware prompt still returns the JSON format.
