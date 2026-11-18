import { useState } from 'react';
import { compareRetrievers, runRetrievalBenchmark } from '../api';
import {
  RETRIEVER_LABELS,
  type BenchmarkResult,
  type BenchmarkSet,
  type RetrievalComparison,
  type RetrievedChunk,
  type RetrieverMode,
  type ServerInfo,
} from '../types';
import Meter from './Meter';
import QueryBar from './QueryBar';
import { signalLine } from './RetrievedContext';
import styles from './RetrievalLab.module.css';

const MODES: RetrieverMode[] = ['tfidf', 'vector', 'hybrid'];

const DESCRIPTIONS: Record<RetrieverMode, string> = {
  tfidf: 'Keyword overlap · TF-IDF cosine',
  vector: 'Semantic · Gemini embeddings in ChromaDB',
  hybrid: '0.3 TF-IDF + 0.7 vector, then cross-encoder rerank',
};

/** Queries that show where the retrievers agree and where they part ways. */
const SAMPLES = [
  { label: 'Exact wording', query: 'What learning rate should we use to fine-tune ViT-B/16 on the histology set?' },
  { label: 'Paraphrase', query: 'How frequently do we write model snapshots to disk?' },
  { label: 'Paraphrase', query: 'Which layer normalizes activations in our image classification network?' },
  { label: 'Paraphrase', query: 'How many accelerators are installed in every machine of our compute farm?' },
];

const ms = (n: number) => (n < 10 ? `${n.toFixed(1)} ms` : `${Math.round(n)} ms`);

export default function RetrievalLab({ info }: { info: ServerInfo | null }) {
  const [query, setQuery] = useState(SAMPLES[1].query);
  const [rerank, setRerank] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RetrievalComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const run = async (q = query) => {
    if (!q.trim()) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await compareRetrievers(q.trim(), rerank));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const idsBy = result ? Object.fromEntries(MODES.map((m) => [m, new Set(result.results[m].chunks.map((c) => c.id))])) : null;

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Retrieval lab</h1>
          <p className={styles.subtitle}>The same query through keyword, semantic and hybrid retrieval, top 4 each</p>
        </div>
      </header>

      {info && !info.python && (
        <div className={styles.notice}>
          The Python backend is offline. Start it with <code>npm run backend</code> (or <code>npm run dev:all</code>) to compare
          retrievers.
        </div>
      )}

      <QueryBar id="retrieval-query" query={query} onQueryChange={setQuery} onRun={() => run()} running={running} runLabel="Compare ▸">
        <label className={styles.check}>
          <input type="checkbox" checked={rerank} onChange={(e) => setRerank(e.target.checked)} />
          Cross-encoder rerank in hybrid
        </label>
        <div className={styles.samples}>
          {SAMPLES.map((s) => (
            <button
              key={s.query}
              type="button"
              className={styles.sample}
              onClick={() => {
                setQuery(s.query);
                run(s.query);
              }}
              title={s.query}
            >
              <span className={styles.sampleTag}>{s.label}</span>
              {s.query}
            </button>
          ))}
        </div>
      </QueryBar>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <section className={`${styles.columns} ${running ? styles.dimmed : ''}`} aria-live="polite">
        {MODES.map((mode) => {
          const run = result?.results[mode];
          return (
            <div key={mode} className={`${styles.column} ${mode === 'hybrid' ? styles.columnHybrid : ''}`}>
              <div className={styles.colHead}>
                <div>
                  <h2 className={styles.colTitle}>{RETRIEVER_LABELS[mode]}</h2>
                  <div className={styles.colDesc}>{DESCRIPTIONS[mode]}</div>
                </div>
                <div className={styles.latency}>{run ? ms(run.latencyMs) : '—'}</div>
              </div>
              {run ? (
                run.chunks.length ? (
                  <ol className={styles.list}>
                    {run.chunks.map((chunk, i) => (
                      <ResultRow
                        key={chunk.id}
                        rank={i + 1}
                        chunk={chunk}
                        unique={idsBy ? MODES.filter((m) => idsBy[m].has(chunk.id)).length === 1 : false}
                        highlighted={hover === chunk.id}
                        onHover={setHover}
                      />
                    ))}
                  </ol>
                ) : (
                  <p className={styles.empty}>No document shares a keyword with this query.</p>
                )
              ) : (
                <p className={styles.empty}>Run a query to see ranked documents and scores.</p>
              )}
              {run?.mode === 'hybrid' && run.reranked === false && rerank && (
                <p className={styles.warn}>Reranker unavailable: showing fused order.</p>
              )}
            </div>
          );
        })}
      </section>

      {result && (
        <div className={styles.overlap}>
          <span>
            In all three: <b>{result.shared.join(', ') || 'none'}</b>
          </span>
          <span className={styles.legendUnique}>Found by one retriever only</span>
          <span className={styles.muted}>Hover a document to trace it across columns</span>
        </div>
      )}

      {result?.results.hybrid.candidates && <FusionTable comparison={result} hover={hover} onHover={setHover} />}

      <Benchmark disabled={!info?.python} />
    </>
  );
}

function ResultRow({
  rank,
  chunk,
  unique,
  highlighted,
  onHover,
}: {
  rank: number;
  chunk: RetrievedChunk;
  unique: boolean;
  highlighted: boolean;
  onHover: (id: string | null) => void;
}) {
  return (
    <li
      className={`${styles.row} ${unique ? styles.rowUnique : ''} ${highlighted ? styles.rowHover : ''}`}
      onMouseEnter={() => onHover(chunk.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className={styles.rowHead}>
        <span className={styles.rank}>{rank}</span>
        <span className={styles.docId}>{chunk.id}</span>
        <span className={styles.rowTitle}>{chunk.title}</span>
        <span className={styles.score}>{chunk.score.toFixed(3)}</span>
      </div>
      <Meter value={chunk.score} segments={10} size="sm" />
      {chunk.signals && (chunk.signals.rerank !== undefined || chunk.signals.tfidfRank !== undefined) && (
        <div className={styles.signals}>{signalLine(chunk)}</div>
      )}
      <div className={styles.text}>{chunk.text}</div>
    </li>
  );
}

function FusionTable({
  comparison,
  hover,
  onHover,
}: {
  comparison: RetrievalComparison;
  hover: string | null;
  onHover: (id: string | null) => void;
}) {
  const hybrid = comparison.results.hybrid;
  const finalIds = hybrid.chunks.map((c) => c.id);
  const w = hybrid.weights;
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>How hybrid ranked the candidates</h2>
        <span className={styles.caption}>
          Top 10 from each retriever → min-max normalise → {w ? `${w.tfidf} × TF-IDF + ${w.vector} × vector` : 'weighted fusion'}
          {w && w.rerank > 0 ? ` → + ${w.rerank} × cross-encoder` : ''} → top 4
        </span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Doc</th>
              <th className={styles.num}>TF-IDF (rank)</th>
              <th className={styles.num}>Vector (rank)</th>
              <th className={styles.num}>Fused (rank)</th>
              <th className={styles.num}>Rerank</th>
              <th>Final</th>
            </tr>
          </thead>
          <tbody>
            {hybrid.candidates!.map((c) => {
              const pos = finalIds.indexOf(c.id);
              return (
                <tr
                  key={c.id}
                  className={`${pos >= 0 ? styles.kept : ''} ${hover === c.id ? styles.rowHover : ''}`}
                  onMouseEnter={() => onHover(c.id)}
                  onMouseLeave={() => onHover(null)}
                >
                  <td>
                    <span className={styles.docId}>{c.id}</span>
                  </td>
                  <td className={styles.num}>{c.tfidfRank ? `${c.tfidf?.toFixed(3)} (#${c.tfidfRank})` : '–'}</td>
                  <td className={styles.num}>{c.vectorRank ? `${c.vector?.toFixed(3)} (#${c.vectorRank})` : '–'}</td>
                  <td className={styles.num}>
                    {c.fused?.toFixed(3)} (#{c.fusedRank})
                  </td>
                  <td className={styles.num}>{c.rerank !== undefined ? c.rerank.toFixed(3) : '–'}</td>
                  <td>{pos >= 0 ? <span className={styles.keptTag}>#{pos + 1}</span> : <span className={styles.muted}>dropped</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const SET_LABELS: Record<BenchmarkSet, string> = {
  eval: 'Benchmark wording (20)',
  paraphrase: 'Paraphrased (20)',
};

function Benchmark({ disabled }: { disabled: boolean }) {
  const [set, setSet] = useState<BenchmarkSet>('paraphrase');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setResult(await runRetrievalBenchmark(set));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const best = result ? Math.max(...MODES.map((m) => result.summary[m].pairRecall)) : -1;

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Retrieval benchmark</h2>
        <span className={styles.caption}>
          The 20 seeded-conflict queries: does each retriever put <b>both</b> conflicting documents in its top 4? No LLM calls.
        </span>
        <div className={styles.benchControls}>
          <div className={styles.segment} role="radiogroup" aria-label="Query set">
            {(Object.keys(SET_LABELS) as BenchmarkSet[]).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={set === s}
                className={`${styles.segOption} ${set === s ? styles.segActive : ''}`}
                onClick={() => setSet(s)}
                disabled={running}
              >
                {SET_LABELS[s]}
              </button>
            ))}
          </div>
          <button type="button" className={styles.run} onClick={run} disabled={running || disabled}>
            {running ? 'Running…' : 'Run benchmark'}
          </button>
        </div>
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      {result && (
        <>
          <div className={styles.metrics}>
            {MODES.map((m) => {
              const s = result.summary[m];
              return (
                <div key={m} className={`${styles.metric} ${s.pairRecall === best ? styles.metricBest : ''}`}>
                  <div className={styles.metricLabel}>{RETRIEVER_LABELS[m]}</div>
                  <div className={styles.metricValue}>
                    {s.pairRecall} / {s.total}
                  </div>
                  <div className={styles.metricSub}>both conflicting docs in top {result.k}</div>
                  <Meter value={s.pairRecall / s.total} segments={10} size="sm" />
                  <div className={styles.metricFoot}>
                    at least one {s.anyRecall}/{s.total} · MRR {s.mrr.toFixed(2)} · {ms(s.avgLatencyMs)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Query ({SET_LABELS[result.set]})</th>
                  <th>Expected pair</th>
                  {MODES.map((m) => (
                    <th key={m}>{RETRIEVER_LABELS[m]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.query}>
                    <td className={styles.queryCell}>{r.query}</td>
                    <td className={styles.mono}>{r.expected.join(' ↔ ')}</td>
                    {MODES.map((m) => {
                      const hits = r.modes[m].hits;
                      return (
                        <td key={m} title={r.modes[m].ids.join(', ')}>
                          <span className={hits === r.expected.length ? styles.hitFull : hits ? styles.hitHalf : styles.hitNone}>
                            {hits}/{r.expected.length}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
