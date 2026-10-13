# Contradiction-Aware RAG

A small RAG demo that compares two prompt strategies over the same retrieved context:

- **Baseline prompt**: answers from the retrieved documents and cites them.
- **Conflict-aware prompt**: first checks whether the documents disagree (a *direct* conflict or a *temporal* one), shows the conflicting sources side by side, and answers accordingly.

Retrieval is a local TF-IDF cosine retriever over a seeded corpus of lab notes, some of which deliberately contradict each other. The LLM is Gemini 2.5 Flash.

## Requirements

- Node.js 20.19 or newer (required by Vite 7)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

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

Then start the app:

```bash
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The API runs inside the Vite dev server, so there is no separate backend to start. Restart `npm run dev` after changing `.env`.

Other scripts:

```bash
npm run build     # type-check and build
npm run preview   # serve the production build (API included)
```

## Using the app

**Search tab**
- Pick a preset or type a question, then press **Run both**. Both prompts run on the same top-4 retrieved chunks, with their latencies shown.
- Open **Prompts & documents** to edit the baseline and conflict-aware system prompts (saved in your browser, with a reset button), or to pick a ready-made question for any document.
- Keep the JSON response format in the conflict-aware prompt, or the conflict banner and source cards will not render.
- Each retrieved chunk has an **Edit document** link.

**Documents tab** (the document icon in the sidebar)
- Browse, search, create, edit and delete documents. Each document also has a sample question.
- **Generate missing questions** asks Gemini to write one question for every document that lacks one.
- Changes are saved to `data/corpus.json` and apply to the next query.

**Evaluation**
- **Run evaluation** runs the 30 labelled queries in `server/evalSet.ts` (20 seeded conflicts, 10 clean controls) against both prompts, with live progress. It always uses the default prompts and takes about a minute.
- Metrics: conflicts detected, false alarms, attribution accuracy (the answer names both seeded documents) and average latency.
- The baseline counts as detecting a conflict only if its answer uses words like "conflict" or "disagree", so its detection score is strict.
- Editing or deleting a seeded conflict document changes what the evaluation measures.

## Project layout

```
data/corpus.json     the document corpus (editable from the app)
server/              API, retriever, prompts and Gemini client (Vite plugin)
  corpus.ts          loads, edits and saves the corpus
  retriever.ts       TF-IDF cosine retrieval, top 4
  prompts.ts         default baseline and conflict-aware prompts
  pipeline.ts        runs both prompts on the retrieved chunks
  evaluate.ts        streaming evaluation
  evalSet.ts         the 30 labelled queries
  llm.ts             Gemini generateContent client
src/                 React + TypeScript UI
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

## Troubleshooting

- **"GEMINI_API_KEY is not set"**: add the key to `.env` and restart the dev server.
- **Gemini request failed (429)**: you hit the free-tier rate limit; wait a minute and retry.
- **The conflict cards do not show**: check that your edited conflict-aware prompt still returns the JSON format.
