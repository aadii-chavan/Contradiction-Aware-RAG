# Project Summary: Contradiction-Aware RAG

## 1. Overview

**Contradiction-Aware RAG** is a Retrieval-Augmented Generation (RAG) system built for the Prompt Engineering course project. It looks at one problem: **what should an LLM do when the documents it retrieves contradict each other?**

A standard RAG system retrieves the most relevant documents and asks the LLM to answer from them. When two sources disagree (for example, one note says the learning rate is `3e-4` and a later note says it is `1e-5`), a plain prompt often picks one value without saying so, or blends the two. The user never finds out that the sources disagreed.

The project tackles this at three levels:

| Level | What it adds | Question it answers |
|---|---|---|
| **1. Prompt engineering** | A *baseline* prompt vs a *conflict-aware* prompt, run on the same retrieved context | Can prompt design alone make the LLM notice and report contradictions? |
| **2. Retrieval** | TF-IDF keyword search, semantic **vector search** (LangChain + ChromaDB), and **hybrid retrieval** with reranking | Does the retriever surface *both* sides of a contradiction, even when the question is phrased differently from the notes? |
| **3. Agentic workflow** | A **LangGraph** state machine: understand → retrieve → analyse → classify → verify → answer, with conditional routing, retry and fallback | Can the conflict decision be broken into checkable steps, so every claim is verified against the source text before it is shown? |

The application provides five views:
- **Search**: runs both prompts side by side on any question, with a choice of retriever (TF-IDF, Vector or Hybrid).
- **Retrieval lab**: compares the three retrievers on the same query, plus a retrieval-only benchmark (**Demo 1**).
- **Agent workflow**: runs a query through the LangGraph agent and shows a live, node-by-node execution tracker (**Demo 2**).
- **Documents**: manages the 52-document knowledge base.
- **Evaluation**: a 30-query labelled benchmark measuring conflict detection, false alarms, attribution accuracy and latency.

---

## 2. Objectives

1. Show that **prompt design** alone can make an LLM detect and report contradictions in retrieved context.
2. Tell apart two kinds of conflict:
   - **Direct conflict**: the same parameter or fact with incompatible values, both presented as current.
   - **Temporal conflict**: a newer document revises or replaces an older one.
3. Make conflicts **visible and verifiable** by highlighting the exact conflicting text span in each source and citing document IDs.
4. Improve **retrieval recall** with semantic and hybrid search, so both documents of a conflicting pair reach the LLM, even for paraphrased questions.
5. Orchestrate detection as an **agentic workflow** with explicit state, conditional routing, deterministic evidence checks and retry/fallback handling, and make each step observable in the UI.
6. **Measure** everything with repeatable benchmarks against labelled ground truth, including clean control queries that check for false alarms, and record the latency cost.

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, CSS Modules, custom SVG charts and workflow graph |
| Build / dev server | Vite 7 (with `@vitejs/plugin-react`) |
| Node API | A custom Vite plugin (Node.js middleware) serving `/api/*` inside the Vite dev/preview server |
| Python API | **FastAPI** + Uvicorn on port 8000, reached through the Vite proxy at `/py/*` |
| Document processing | **LangChain** (`langchain-core`, `langchain-text-splitters`): `Document` objects, `RecursiveCharacterTextSplitter`, a `BaseDocumentCompressor` reranker |
| Vector database | **ChromaDB** (persistent, cosine space) through `langchain-chroma` |
| Embeddings | Google **`gemini-embedding-001`** (768 dimensions) through `langchain-google-genai`, with task types for documents and queries |
| Keyword retrieval | A hand-written TF-IDF cosine retriever (TypeScript), with an exact Python port |
| Reranker | **FlashRank** `ms-marco-MiniLM-L-12-v2` cross-encoder (local ONNX model, about 22 MB) |
| Agent orchestration | **LangGraph** `StateGraph` with conditional edges and custom stream events |
| LLM | Google **Gemini 2.5 Flash**: a REST client in Node and `ChatGoogleGenerativeAI` with structured (Pydantic) output in Python |
| Storage | `data/corpus.json` (documents), `data/evalSet.json` (labels), `backend/.chroma` (vectors), browser `localStorage` (edited prompts, retriever choice) |

---

## 4. System Architecture

```
 ┌────────────────────────────────── Browser: React + TypeScript ───────────────────────────────────┐
 │ Search (retriever toggle) · Retrieval lab · Agent workflow · Documents · Evaluation (retriever toggle) │
 └────────────────────┬───────────────────────────────────────────────────┬─────────────────────────┘
                      │ /api/*                                            │ /py/*  (Vite proxy)
 ┌────────────────────▼──────────────────────────┐        ┌───────────────▼─────────────────────────────┐
 │ Node API: Vite plugin (server/)               │        │ Python FastAPI (backend/app/)               │
 │  corpus.ts   load / edit / save documents     │        │  corpus.py      reload corpus.json, chunk   │
 │  retriever.ts  TF-IDF, top 4 (in process)     │        │  tfidf.py       TF-IDF (same as Node)       │
 │  pipeline.ts   baseline + aware prompts       │ /retrieve vectorstore.py ChromaDB + Gemini embeds │
 │     └─ vector / hybrid ───────────────────────┼───────►│  rerank.py      FlashRank cross-encoder     │
 │  evaluate.ts   30-query benchmark (NDJSON)    │        │  retrieval.py   tfidf / vector / hybrid     │
 │  promptGen.ts  sample-question generator      │        │  agent/         LangGraph workflow          │
 │  llm.ts        Gemini REST client             │        │  main.py        REST + NDJSON streaming     │
 └────────────────────┬──────────────────────────┘        └───────────────┬─────────────────────────────┘
                      │                                                   │
                      └──────────────► Gemini 2.5 Flash  ◄────────────────┘   (+ gemini-embedding-001)

 Shared files: data/corpus.json · data/evalSet.json · data/paraphraseSet.json
```

**How the two backends fit together**
- The **Node API** keeps every original feature: the prompt comparison, TF-IDF, documents, the evaluation and question generation. TF-IDF still runs in process, so the original app works even without Python.
- The **Python API** adds LangChain, ChromaDB and LangGraph. When the Search tab or the evaluation chooses *Vector* or *Hybrid*, Node fetches the top-4 chunks from Python's `/retrieve` and then runs the same prompts on them.
- Both backends read the **same corpus file**. Python reloads it when its modification time changes, and the vector index re-syncs **incrementally**, so an edit made on the Documents page shows up in vector search on the next query.

### Request flow: Search tab (prompt comparison)
1. The user enters a question, picks a retriever, and presses **Run both**.
2. `POST /api/query { query, prompts?, retriever }`.
3. Retrieval: TF-IDF in Node, or vector / hybrid from Python. The result is the **top 4** chunks.
4. The **same context** goes to Gemini twice, **in parallel**: once with the baseline prompt (plain text) and once with the conflict-aware prompt (JSON mode).
5. Each call is timed. The baseline's `DOC-xx` citations are extracted. The conflict-aware JSON is parsed, and each quoted value is located in its source document for highlighting. Quotes that cannot be found are discarded.
6. The UI shows both answers, their latencies, a conflict banner, side-by-side source cards with highlighted values, and the retrieved chunks with their scores.

### Request flow: Agent workflow
1. `POST /py/agent/stream { query, simulate_failure? }`.
2. LangGraph runs the nodes. Each node sends `running` and `done` events (with timing, a summary, details and the next route) through LangGraph's custom stream.
3. FastAPI streams these as newline-delimited JSON. The React tracker updates node colours, traversed edges, the trace log and the inspector **in real time**.
4. A final `done` event carries the complete workflow state: understanding, retrieval, analysis, classification, verification, fallback, result and trace.

---

## 5. Component Details: Prompt-Engineering Core (original system)

### 5.1 Document Corpus (`data/corpus.json`, `server/corpus.ts`)
- **52 documents** written as a research lab's internal notes (ML training recipes, dataset cards, cluster notes, lab policies), dated **July 2023 to May 2025**. Documents are short (about 140 characters on average).
- Each document has an `id` (`DOC-01` …), `title`, `date` (YYYY-MM-DD), `text`, and an optional sample question (`prompt`).
- **20 seeded conflict pairs**, for example:
  - `DOC-02` *Pipeline config v1* (BatchNorm) vs `DOC-11` *Pipeline changelog* (switched to GroupNorm in 2025)
  - `DOC-04` *ViT fine-tuning recipe* (3e-4) vs `DOC-09` *Histology ablation log* (stable peak 1e-5)
  - `DOC-13` *Cluster inventory* (4 × A100) vs `DOC-14` *Cluster upgrade* (8 × H100)
  - `DOC-15` *Reproducibility checklist* (seed 42) vs `DOC-16` *Seed policy memo* (seed 1337, 42 retired)
  - …plus pairs on input resolution, dropout, vocabulary size, epochs, RandAugment, checkpoints, GAN update ratio, embedding size, licensing, dataset size, gradient accumulation, latency SLA, beam size, replay buffer and dedup threshold.
- `DOC-47`–`DOC-52` are consistent policy documents used by the clean control queries.
- `corpus.ts` validates input (title and text required, valid ISO date), handles create/update/delete and ID assignment, writes to disk, and notifies listeners so the TF-IDF index is rebuilt immediately.

### 5.2 TF-IDF Retriever (`server/retriever.ts`)
- **TF-IDF + cosine similarity**, written from scratch.
- Tokenisation: lowercase; keeps technical tokens such as `vit-b/16`, `3e-4` and `resnet-50` while also indexing their parts; light plural stemming; stopword removal.
- Weighting: sublinear term frequency `(1 + ln tf)` × smoothed IDF `ln(1 + N / (1 + df))`, with L2-normalised vectors.
- Returns the **top K = 4** documents with a score above 0.

### 5.3 Prompts (`server/prompts.ts`): the core prompt-engineering artefact

**Baseline system prompt**
> You answer questions about a research lab's internal notes using only the provided context. Answer concisely and cite the document IDs you rely on in square brackets, e.g. [DOC-04].

**Conflict-aware system prompt** techniques:
- **Explicit pre-answer check**: "Before answering, check whether any two documents give incompatible information about the same thing."
- **Conflict taxonomy**: `direct` (same fact, incompatible values) and `temporal` (a newer document revises an older one; "compare the dates").
- **False-positive guard**: "Only report a conflict if the documents genuinely disagree on what the question asks about. Differences in unrelated details are not conflicts."
- **Structured output schema** (JSON only):
  ```json
  {
    "conflict": true,
    "conflict_type": "direct | temporal | null",
    "conflicting": [{"id": "DOC-XX", "value": "<shortest exact span>"}, {"id": "DOC-YY", "value": "..."}],
    "answer": "<2-4 sentence answer>"
  }
  ```
- **Verbatim, minimal span extraction**: each `value` must be copied word for word and be as short as possible (e.g. `3e-4`, `BatchNorm`), so the app can find it in the source and highlight it.
- **Answer policy**: when sources conflict, the model must say they disagree, give each value with its document ID, and note evidence of reliability (newer date, more specific scope). It must **not silently pick one**.

Both prompts share the same user-message format: `[DOC-ID] (date) Title\ntext` for each chunk, followed by `Question: …`. Both system prompts can be edited in the UI (saved in `localStorage`, with a reset button).

### 5.4 Pipeline (`server/pipeline.ts`)
- `retrieveWith(retriever, query)`: TF-IDF runs in process; `vector` and `hybrid` call the Python backend (`server/pyBackend.ts`).
- Runs both prompts concurrently with `Promise.all` and times each call.
- **Baseline post-processing**: extracts unique `DOC-\d+` citations.
- **Conflict-aware post-processing**: robust JSON extraction with a raw-text fallback; a **grounding check** that keeps a conflicting source only if its ID was retrieved **and** its value appears in that document; `pre / val / post` sentence splitting for highlighting; readable conflict labels.

### 5.5 LLM Client (`server/llm.ts`)
- Gemini `generateContent` REST API. **Temperature 0** for reproducibility, **`thinkingBudget: 0`** so latency reflects the prompt rather than a reasoning pass, and JSON response mode for the conflict-aware prompt.
- Clear errors for a missing key, HTTP failures (e.g. 429 rate limits) and blocked or empty responses.

### 5.6 Sample Question Generator (`server/promptGen.ts`)
- Sends every document that lacks a sample question to Gemini in **one batched call** and gets back a JSON map `{ "DOC-01": "..." }`. Checks the IDs and saves the questions in a single write.

---

## 6. Feature 1: Semantic Vector Search and Hybrid Retrieval

### 6.1 Document processing with LangChain (`backend/app/corpus.py`)
- Loads `data/corpus.json` and reloads it whenever the file's modification time changes (the Node app owns the file).
- Turns each document into LangChain `Document` chunks with `RecursiveCharacterTextSplitter` (chunk size 256, overlap 32, sentence-aware separators). Each chunk carries the document **title as a header**, plus metadata: `doc_id`, `title`, `date`, chunk index and a content **fingerprint** (SHA-1 of title, date and text).

### 6.2 Persistent vector store (`backend/app/vectorstore.py`)
- **ChromaDB** collection `corpus_gemini_embedding_001_768` in `backend/.chroma`, using cosine distance.
- **Gemini embeddings** (`gemini-embedding-001`, 768 dimensions) through LangChain, with `RETRIEVAL_DOCUMENT` task type for chunks and `RETRIEVAL_QUERY` for queries. Query embeddings are cached in an LRU cache.
- **Incremental sync**: chunk fingerprints are compared with what is stored. Only new or changed documents are embedded, and deleted ones are removed. Verified in testing: creating a document embedded exactly 1 chunk and made it searchable at once; deleting it removed 1 chunk.
- The collection name includes the model and dimension, so changing the embedding model never mixes vectors.
- A document's score is the cosine similarity of its **best-matching chunk**.

### 6.3 TF-IDF port (`backend/app/tfidf.py`)
- An exact Python port of `server/retriever.ts`, so the three retrievers can be compared on the same footing. On all 50 benchmark and paraphrased queries it returned the **same documents and scores as the Node retriever (0 mismatches)**.

### 6.4 Hybrid retrieval and reranking (`backend/app/retrieval.py`, `backend/app/rerank.py`)
1. **Candidate pools**: top 10 from TF-IDF and top 10 from Chroma.
2. **Score fusion**: each list is min-max normalised over its candidates, then combined as `0.3 × TF-IDF + 0.7 × vector`. A document missing from a list scores 0 for that retriever.
3. **Reranking**: a FlashRank cross-encoder (wrapped as a LangChain `BaseDocumentCompressor`) scores every (query, document) pair, and its score is **blended in** with weight 0.3: `final = (fused + 0.3 × rerank) / 1.3`.
4. Each result keeps its **signals** (TF-IDF score and rank, vector score and rank, fused score and rank, rerank score), so the UI can explain every ranking decision.
5. If the reranker is unavailable (for example, the model download fails), retrieval falls back to the fused order.

**How the fusion design was chosen (an experiment, not a guess).** Each option was scored by how often both conflicting documents reached the top 4, on the 20 conflict queries and on 20 paraphrases of them:

| Fusion strategy | Benchmark wording | Paraphrased |
|---|---|---|
| Reciprocal Rank Fusion, equal weights | 20/20 | 12/20 |
| RRF, 0.3 TF-IDF / 0.7 vector | 20/20 | 16/20 |
| Cross-encoder reorders on its own | 20/20 | 10/20 |
| Min-max fusion, 0.3 / 0.7 | 20/20 | 19/20 |
| **Min-max 0.3 / 0.7 + 0.3 × cross-encoder (chosen)** | **20/20** | **19/20** |
| Vector only (reference) | 20/20 | 19/20 |

Equal-weight RRF let TF-IDF's noisy keyword matches push a relevant document out. The general-purpose MS-MARCO cross-encoder was weak on these short technical notes, so it works best as one signal rather than the final judge.

### 6.5 Retrieval lab UI (`src/components/RetrievalLab.tsx`)
- **Side-by-side columns** for TF-IDF, Vector and Hybrid: ranked document IDs, titles, scores, score meters, latency, and per-retriever signals.
- Documents **found by only one retriever** are highlighted, documents found by all three are listed, and hovering a document traces it across all columns and the fusion table.
- **"How hybrid ranked the candidates"** table: every fused candidate with its TF-IDF score and rank, vector score and rank, fused score and rank, rerank score, and whether it made the final top 4.
- **Retrieval benchmark**: one click runs all 20 conflict queries (benchmark wording or paraphrased) through the three retrievers, with no LLM calls. It reports *pair recall@4*, *any recall@4*, MRR and average latency, plus a per-query hit grid.

### 6.6 Integration with the existing app
- **Search tab**: a **Retriever** toggle (TF-IDF / Vector / Hybrid, remembered in the browser) feeds the chosen retriever's chunks to both prompts. Retrieved-context cards show the hybrid signals.
- **Evaluation**: the same toggle runs the full 30-query prompt benchmark over any retriever.
- **Header**: shows the Python backend's status (vector store, embedding model, reranker) or "offline". Vector and Hybrid are disabled when it is offline.

---

## 7. Feature 2: LangGraph Agentic Contradiction Detection

### 7.1 Workflow graph (`backend/app/agent/graph.py`)

```
 START → understand → retrieve → analyze ─┬─(conflict)────→ classify ──┐
                         ▲                └─(no conflict)──────────────┴→ verify ─┬─(passed)──────────────→ generate → END
                         │                                                        ├─(failed, retries left)─┐
                         └────────────────────────────────────────────────────────┘                        │
                                                                                  └─(failed ×2)→ fallback → generate
```

- Built with `StateGraph(AgentState)`: 7 nodes and 11 edges, **5 of them conditional** (routing functions `route_after_analysis` and `route_after_verification`).
- `GET /agent/graph` returns the compiled graph's nodes, edges and Mermaid source. This is the real graph, not a drawing.

### 7.2 Workflow state (`backend/app/agent/state.py`)
A typed `AgentState` carries: `query`, `attempt`, `understanding`, `retrieval`, `analysis`, `classification`, `verification`, `fallback`, `result`, and an append-only **`trace`** (a LangGraph reducer, `operator.add`) recording every node run with its attempt number, duration and summary. LLM outputs are **Pydantic schemas** (`QueryUnderstanding`, `ConflictAnalysis`, `ConflictClassification`, `FinalAnswer`) and are requested with `with_structured_output`, so every step returns typed, validated data.

### 7.3 The nodes (`backend/app/agent/nodes.py`)

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | **Query understanding** | LLM | Extracts the intent, the target fact (e.g. "peak learning rate"), the entities and a keyword-rich search query. Falls back to the raw question if the LLM fails. |
| 2 | **Hybrid retrieval** | Retrieval | Attempt 1: hybrid top 4 on the original question. Retry: a **broadened** query (rewritten query + target + entities) with k = 6, merged with the earlier documents. |
| 3 | **Conflict analysis** | LLM | Extracts one **claim per relevant document**, with the value **quoted verbatim** and a paraphrase, and decides whether two documents conflict. On a retry it is given the previous verification failures as **feedback**. |
| 4 | **Conflict classification** | LLM + rules | Runs only when a conflict is suspected. Labels it **Direct**, **Temporal** or **No conflict** (dismissed on closer reading, e.g. different scope), and names the document to trust. Code guards: a temporal conflict needs different dates, otherwise it becomes direct; the trusted document defaults to the newer one. |
| 5 | **Evidence verification** | Deterministic (no LLM) | Every claimed value must be found **verbatim** in a retrieved document, matching whole tokens so that "4" does not match the 4 in "40 GB". For a conflict, both values must be grounded and must actually differ, and a temporal pair needs distinct dates. With no conflict, at least one grounded supporting claim is required. Ungrounded side claims are dropped. |
| ↺ | **Fallback** | Deterministic | Runs when verification fails twice. Keeps only verified evidence and marks the result **low confidence**, with the reason. |
| 6 | **Final answer generation** | LLM | Writes the answer from the verified evidence and classification: states the disagreement, gives both values with document IDs, and says which source to trust and why. Returns the conflict label, the highlighted source pair (`pre / val / post`), citations and confidence. |

**Conditional routing and retry**
- After analysis: a suspected conflict goes to **classify**; otherwise straight to **verify**, and classification is shown as *skipped*.
- After verification: a pass goes to **generate**. A failure with retries left goes back to **retrieve** (up to 2 retrieval attempts), with the failure reasons passed to the next analysis as feedback. A failure after the last attempt goes to **fallback**, then **generate**.
- A **"Simulate a failed verification"** toggle (clearly labelled as a demo control) forces verification to fail on attempt 1, so the retry loop can be shown on demand.

### 7.4 Observability and streaming
- A `@traced` decorator wraps every node: it sends `running`, `done` and `error` events through LangGraph's **custom stream writer** (`get_stream_writer`), with timing, a one-line summary, structured details and the route the conditional edge will take. It also appends a trace entry to the state.
- `POST /agent/stream` sends these events as **NDJSON** (`stream_mode=["custom", "values"]`), followed by the final state. `POST /agent/run` returns only the final state.

### 7.5 Visual execution tracker (`src/components/AgentWorkflow.tsx`)
- An **SVG graph** of the workflow that mirrors `graph.py`. Each node's status updates **live**: waiting (dashed), running (pulsing lime), done (dark, with duration), skipped (faded), error (red). A **×2 badge** appears on nodes that ran twice.
- **Traversed edges** are drawn solid, and the edge into the currently running node is animated. Conditional edges are dashed and labelled (*conflict*, *no conflict*, *verified*, *failed → retry*, *failed ×2*).
- **Execution trace**: a timestamped list of every node run, with attempt numbers, durations, summaries and routing decisions.
- **Node inspector**: click any node to see its output, for example the understood target and entities, the retrieved documents with scores, the extracted claims with highlighted quoted values, the classification label and rationale, the verification checklist (✓ / ✕), and why a node was skipped.
- **Final answer card**: an "Evidence verified" or "Low confidence" badge, total time, citations, the conflict banner, and both source cards with the **conflicting value highlighted** and the **trusted** document marked.

---

## 8. Evaluation and Results

### 8.1 Prompt benchmark (`data/evalSet.json`, `server/evaluate.ts`)
- **30 labelled queries**: **20 conflict queries**, each labelled with its seeded conflicting pair, and **10 clean control queries** used to measure false alarms.
- Run one after another to respect API rate limits. Progress is streamed live (NDJSON) to metric cards, a per-query latency chart and a pass/fail results table.
- Always uses the default prompts, so runs are comparable. It can now run over any retriever.

| Metric | Definition |
|---|---|
| **Conflicts detected** | Conflict queries where the prompt flagged a conflict (out of 20) |
| **False alarms** | Clean queries wrongly flagged as conflicts (out of 10) |
| **Attribution accuracy** | Conflict queries where the answer identified **both** seeded documents (conflict-aware: the reported pair must match exactly) |
| **Average latency** | Mean response time per query |

The baseline counts as "detecting" a conflict only if its prose uses words such as *conflict, disagree, contradict, inconsistent*. It is never told to look for conflicts, so this is a strict measure of whether a plain prompt reports disagreement on its own.

**Measured results (Gemini 2.5 Flash, temperature 0, 30 queries):**

| Retriever | Prompt | Conflicts detected | False alarms | Attribution accuracy | Avg latency |
|---|---|---|---|---|---|
| TF-IDF (original) | Baseline | 0 / 20 | 0 / 10 | 5% (1/20) | 0.99 s |
| TF-IDF (original) | **Conflict-aware** | **20 / 20** | 1 / 10 | **100%** (20/20) | 1.55 s |
| Vector | Baseline | 0 / 20 | 0 / 10 | 10% (2/20) | 0.96 s |
| Vector | **Conflict-aware** | **20 / 20** | 1 / 10 | **100%** (20/20) | 1.54 s |
| Hybrid | Baseline | 0 / 20 | 0 / 10 | 10% (2/20) | 1.01 s |
| Hybrid | **Conflict-aware** | **20 / 20** | 1 / 10 | **100%** (20/20) | 1.61 s |

Key findings:
- **The prompt makes the difference.** On identical context, the baseline never once said its sources disagreed (0/20). It usually answered with one value and cited one document. The conflict-aware prompt detected every seeded conflict and named the exact pair every time.
- **The cost is small**: about 0.55 s more latency per query (about 1.6× the baseline), and one false alarm out of 10 clean queries. The false alarm was a near-miss on overlapping notes about evaluation (TF-IDF, hybrid) or warmup schedules (vector).
- **All three retrievers score the same on this benchmark**, because its questions reuse the documents' wording, so every retriever finds both documents (see 8.2). Retrieval differences only appear when questions are paraphrased.

### 8.2 Retrieval benchmark (no LLM; Retrieval lab)
Whether **both** conflicting documents of each seeded pair appear in the top 4:

| Query set | TF-IDF | Vector | Hybrid |
|---|---|---|---|
| Benchmark wording (20 queries) | 20/20 | 20/20 | 20/20 |
| **Paraphrased** (20 queries, `data/paraphraseSet.json`) | **7/20** (≥1 doc: 12/20, MRR 0.52) | **19/20** (≥1: 20/20, MRR 1.00) | **19/20** (≥1: 20/20, MRR 0.94) |

- The benchmark questions reuse the documents' keywords, so every retriever succeeds on them. The paraphrased set (e.g. *"How frequently do we write model snapshots to disk?"* instead of *"How often are checkpoints saved during training?"*) shows the value of semantic search: TF-IDF gets both documents only **35%** of the time, while vector and hybrid get them **95%** of the time.
- Latency: TF-IDF under 1 ms, vector about 0.5 s per uncached query (embedding call), hybrid about 60 ms more for the cross-encoder.

### 8.3 Why retrieval matters for contradiction detection (end-to-end example)
Query: *"How frequently do we write model snapshots to disk?"*
- **TF-IDF** retrieves DOC-28 but misses DOC-27, so the conflict-aware prompt **flags the wrong pair** (DOC-37 ↔ DOC-38, about gradient accumulation).
- **Hybrid** retrieves both DOC-28 and DOC-27, so the prompt correctly reports a **temporal conflict**: checkpoints were saved every 1,000 steps (2023 guide), and now every 5,000 steps (2025 storage memo).

A prompt can only reconcile sources it is shown. Better retrieval is a precondition for conflict awareness.

### 8.4 Agent workflow runs (examples verified during testing)

| Query | Path taken | Outcome |
|---|---|---|
| *What is the default random seed for experiments?* | understand → retrieve → analyze → **classify** → verify ✓ → generate | Temporal conflict, DOC-15 (42) vs DOC-16 (1337), trust DOC-16; about 6 s |
| *What Python version do lab projects use?* | understand → retrieve → analyze → verify ✓ → generate (classify **skipped**) | No conflict, Python 3.11 [DOC-51, DOC-52]; about 4 s |
| *How many GPUs does each node have?* + simulated failure | … → verify ✕ → **retrieve (attempt 2, k = 6)** → analyze → classify → verify ✓ → generate | Temporal conflict, 4 × A100 vs 8 × H100, trust DOC-14; about 9 s |
| Verification forced to fail on both attempts (test) | … → verify ✕ → retrieve → … → verify ✕ → **fallback** → generate | Answer says the notes do not clearly settle it, confidence **low** |

---

## 9. User Interface Summary (`src/`)

| Component | Purpose |
|---|---|
| `Sidebar` | Hash routing: Search sections, **Retrieval lab** (`#/retrieval`), **Agent workflow** (`#/agent`), Documents (`#/documents`). Wraps into a row on phones. |
| `Header` | Retrievers, k, model and document count, plus the Python backend's status (Chroma, embedding model, reranker). |
| `QueryBar` + `RetrieverToggle` | Question input, run button, and the TF-IDF / Vector / Hybrid selector. |
| `PromptsPanel` | Pick a document's sample question, or edit and reset the two system prompts. |
| `AnswerPanels` | Baseline and conflict-aware answers with latency meters, a conflict banner and highlighted source cards (reused by the agent page). |
| `RetrievedContext` | Top-4 chunks with score bars, hybrid signals and an **Edit document** link. |
| `RetrievalLab` | Demo 1: three-retriever comparison, fusion breakdown table, retrieval benchmark. |
| `AgentWorkflow` | Demo 2: live LangGraph tracker, execution trace, node inspector, verified final answer. |
| `DocumentsPage` | Browse, search, create, edit and delete documents; generate missing questions. |
| `Evaluation` + `LatencyChart` | Live benchmark with retriever choice, metric cards, an SVG per-query latency chart and a pass/fail table. |
| `Meter` | Segmented meter used for scores, latencies and progress. |

The frontend ignores stale responses (a request-ID guard), turns network and backend errors into clear messages (e.g. "The Python backend is not running…"), and was checked at desktop width and at a 390 px phone width without horizontal page scrolling.

---

## 10. API Reference

**Node API (`/api`)**

| Method & endpoint | Purpose |
|---|---|
| `GET /api/info` | Retriever, model, K, document count, LLM configured, Python backend status |
| `POST /api/query` | `{ query, prompts?, retriever? }` runs both prompts on the chosen retriever's context |
| `POST /api/eval` | `{ retriever? }` streams evaluation progress and the final result (NDJSON) |
| `GET /api/prompts` | Default prompts |
| `GET/POST /api/docs`, `PUT/DELETE /api/docs/:id` | Document management |
| `POST /api/docs/generate-prompts` | Generate sample questions with Gemini |

**Python API (port 8000, proxied at `/py`; interactive docs at `/docs`)**

| Method & endpoint | Purpose |
|---|---|
| `GET /health` | Models, index and reranker status |
| `POST /retrieve` | `{ query, mode: tfidf \| vector \| hybrid, k?, rerank? }` |
| `POST /retrieve/compare` | All three retrievers on one query (Demo 1) |
| `POST /retrieve/benchmark` | `{ set: eval \| paraphrase }` retrieval metrics |
| `POST /agent/stream` | `{ query, simulate_failure? }` live node events (Demo 2) |
| `POST /agent/run` | Final agent state and trace |
| `GET /agent/graph` | Compiled LangGraph nodes, edges and Mermaid source |
| `POST /index/sync` | Force a Chroma re-sync |

---

## 11. Project Structure

```
.
├── data/
│   ├── corpus.json            # 52-document knowledge base (editable from the app)
│   ├── evalSet.json           # 30 labelled queries (shared by Node and Python)
│   └── paraphraseSet.json     # 20 conflict queries reworded, for the retrieval benchmark
├── server/                    # Node API (Vite plugin)
│   ├── plugin.ts              # /api routes
│   ├── corpus.ts  retriever.ts  prompts.ts  pipeline.ts  llm.ts
│   ├── promptGen.ts  evaluate.ts  evalSet.ts
│   └── pyBackend.ts           # client for the Python backend
├── backend/                   # Python FastAPI service
│   ├── requirements.txt
│   └── app/
│       ├── main.py            # endpoints, NDJSON streaming
│       ├── config.py  corpus.py  tfidf.py  vectorstore.py
│       ├── rerank.py  retrieval.py  evidence.py  llm.py
│       └── agent/  state.py  nodes.py  graph.py
├── src/                       # React + TypeScript frontend
│   ├── App.tsx  api.ts  types.ts  main.tsx
│   └── components/            # incl. RetrievalLab, AgentWorkflow, RetrieverToggle
├── scripts/dev-all.mjs        # starts both servers
├── vite.config.ts             # /py proxy
└── README.md
```

---

## 12. Setup and Running

Requirements: **Node.js 20.19+**, **Python 3.10–3.13**, and a **Gemini API key**.

```bash
npm install
cp .env.example .env          # set GEMINI_API_KEY
npm run backend:setup         # creates backend/.venv and installs LangChain, ChromaDB, LangGraph, FastAPI…
npm run dev:all               # Python on :8000 + Vite on :5173 → open http://localhost:5173
```

On first start the backend embeds the corpus (one batched call) and downloads the reranker model. After that, the vectors persist in `backend/.chroma`. Without the Python backend, the original features still work on TF-IDF.

---

## 13. Demo Script

**Demo 1: retrieval comparison (Retrieval lab)**
1. Run *"What learning rate should we use to fine-tune ViT-B/16 on the histology set?"*: all three retrievers find the DOC-04 / DOC-09 pair (the keywords match).
2. Run *"How frequently do we write model snapshots to disk?"*: TF-IDF misses DOC-27, while vector and hybrid find both checkpoint notes. Point out the lime "found by one retriever only" cards and the fusion table.
3. Run the **benchmark** on the paraphrased set: TF-IDF 7/20, vector 19/20, hybrid 19/20.
4. Optional: in the Search tab, run the same query with TF-IDF (wrong conflict pair) and then Hybrid (correct temporal conflict).

**Demo 2: agentic workflow (Agent workflow)**
1. Run *"What is the default random seed for experiments?"*: watch nodes light up in turn; analysis routes to classification (temporal); verification passes 4/4 checks; the final answer marks DOC-16 as trusted, with 42 vs 1337 highlighted.
2. Run *"What Python version do lab projects use?"*: classification is **skipped** and the answer comes straight from the evidence.
3. Tick **Simulate a failed verification** and run again: verification fails, the graph routes back to retrieval (attempt 2, ×2 badges), then passes. Click nodes to show the claims, checks and trace.

---

## 14. Key Design Decisions

- **Same context, different prompt**: in the prompt comparison, both strategies get exactly the same chunks, so the difference comes from prompt engineering alone.
- **Structured, verifiable outputs**: JSON and Pydantic schemas with verbatim spans let code check the LLM's claims against the source and discard quotes it cannot find.
- **LLM for judgement, code for verification**: the agent uses the LLM for understanding, analysis, classification and writing, but evidence verification is deterministic, so a hallucinated quote cannot pass.
- **Retry with feedback, then degrade gracefully**: a failed check triggers broader retrieval plus feedback to the analyser; a second failure produces an answer explicitly marked low confidence, never an answer that looks verified when it is not.
- **Fusion weights chosen by measurement**: hybrid settings were picked on a labelled benchmark, and the result where RRF and the cross-encoder underperformed is reported.
- **Integrate, don't rewrite**: the original Node app is unchanged in behaviour (TF-IDF stays the default and works offline). The Python service plugs in through a proxy and a shared corpus file.
- **Deterministic settings**: temperature 0 and no thinking budget for reproducible runs and fair latency comparisons.
- **Clean controls**: the 10 clean queries penalise a strategy that flags everything as a conflict.

---

## 15. Limitations and Future Work

- **Hybrid does not beat pure vector on this corpus**: both get 19/20 on paraphrases, and hybrid's MRR is slightly lower (0.94 vs 1.00). Its value here is robustness on exact-term queries; a larger, noisier corpus would test it better. A domain-tuned reranker or an LLM listwise reranker could help.
- **Small synthetic corpus**: 52 short hand-written documents and 30 queries suit a controlled demo but not real-world scale or noise.
- **Pairwise conflicts only**: both the prompt schema and the agent report at most two conflicting sources.
- **Agent not yet in the 30-query evaluation**: it makes 3–4 LLM calls per query (about 120 calls per run); adding it as a third column is the natural next step.
- **Keyword-based baseline scoring** may under- or over-count the baseline's detections.
- **Single LLM provider**: only Gemini 2.5 Flash is tested; comparing models or adding self-consistency would be next steps.
- **Local demo**: no authentication, file-based storage, and two processes to run.

---

## 16. Conclusion

The project shows that RAG systems can be made to **notice, classify and openly report contradictions** instead of silently picking one source, and that this works best as a combination of three layers:

1. **Prompt engineering**: an explicit pre-answer check, a conflict taxonomy, a false-positive guard, a strict JSON schema with verbatim spans, and a rule against silent choices turn a plain RAG prompt into a conflict-aware one.
2. **Better retrieval**: semantic and hybrid search with ChromaDB and reranking raise the rate at which both sides of a contradiction reach the model on paraphrased questions from 35% (TF-IDF) to 95%. A prompt cannot reconcile a source it never sees.
3. **Agentic orchestration**: a LangGraph workflow splits the decision into observable steps, routes on whether a conflict exists, verifies every quoted value against the source in code, and retries or falls back when evidence does not hold up. The live tracker makes each step of that reasoning visible.

Together these produce answers that are **transparent** (they state the disagreement), **attributable** (they cite and highlight the exact spans) and **verified** (every claim is grounded in the retrieved text). The built-in benchmarks measure the gains against the costs in false alarms and latency.
