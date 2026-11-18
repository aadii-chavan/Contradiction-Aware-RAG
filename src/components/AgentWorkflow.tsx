import { useEffect, useRef, useState } from 'react';
import { runAgent } from '../api';
import type { AgentClaim, AgentFinalState, AgentNodeEvent, AgentNodeId, ServerInfo, VerificationCheck } from '../types';
import { ConflictBanner, SourceCard } from './AnswerPanels';
import QueryBar from './QueryBar';
import styles from './AgentWorkflow.module.css';

type NodeStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

interface NodeView {
  status: NodeStatus;
  runs: number;
  ms: number;
  summary?: string;
  detail?: unknown;
}

const NODES: { id: AgentNodeId; step: string; label: string; x: number; y: number }[] = [
  { id: 'understand', step: '1', label: 'Understand query', x: 20, y: 70 },
  { id: 'retrieve', step: '2', label: 'Hybrid retrieval', x: 190, y: 70 },
  { id: 'analyze', step: '3', label: 'Conflict analysis', x: 360, y: 70 },
  { id: 'classify', step: '4', label: 'Classification', x: 470, y: 190 },
  { id: 'verify', step: '5', label: 'Evidence check', x: 600, y: 70 },
  { id: 'fallback', step: '↺', label: 'Fallback', x: 720, y: 190 },
  { id: 'generate', step: '6', label: 'Final answer', x: 840, y: 70 },
];
const W = 140;
const H = 64;
const LABELS = Object.fromEntries(NODES.map((n) => [n.id, n.label])) as Record<AgentNodeId, string>;

/** Graph edges, matching backend/app/agent/graph.py. */
const EDGES: { from: AgentNodeId; to: AgentNodeId; d: string; label?: string; lx?: number; ly?: number; conditional?: boolean }[] = [
  { from: 'understand', to: 'retrieve', d: 'M160 102 H190' },
  { from: 'retrieve', to: 'analyze', d: 'M330 102 H360' },
  { from: 'analyze', to: 'classify', d: 'M440 134 V222 H470', label: 'conflict', lx: 446, ly: 182, conditional: true },
  { from: 'analyze', to: 'verify', d: 'M500 102 H600', label: 'no conflict', lx: 550, ly: 94, conditional: true },
  { from: 'classify', to: 'verify', d: 'M610 222 H670 V134' },
  { from: 'verify', to: 'generate', d: 'M740 102 H840', label: 'verified', lx: 790, ly: 94, conditional: true },
  { from: 'verify', to: 'fallback', d: 'M700 134 V222 H720', label: 'failed ×2', lx: 706, ly: 182, conditional: true },
  { from: 'fallback', to: 'generate', d: 'M860 222 H910 V134' },
  { from: 'verify', to: 'retrieve', d: 'M670 70 V30 H260 V70', label: 'failed → retry with broader query', lx: 465, ly: 22, conditional: true },
];

const SAMPLES = [
  'What is the default random seed for experiments?',
  'Does the ResNet-50 pipeline use batch normalization?',
  'What Python version do lab projects use?',
  'How frequently do we write model snapshots to disk?',
];

const initialNodes = (): Record<AgentNodeId, NodeView> =>
  Object.fromEntries(NODES.map((n) => [n.id, { status: 'pending', runs: 0, ms: 0 }])) as Record<AgentNodeId, NodeView>;

const sec = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

export default function AgentWorkflow({ info }: { info: ServerInfo | null }) {
  const [query, setQuery] = useState(SAMPLES[0]);
  const [simulate, setSimulate] = useState(false);
  const [running, setRunning] = useState(false);
  const [nodes, setNodes] = useState(initialNodes);
  const [path, setPath] = useState<AgentNodeId[]>([]);
  const [events, setEvents] = useState<AgentNodeEvent[]>([]);
  const [final, setFinal] = useState<AgentFinalState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentNodeId | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pinned = useRef(false);

  // Live clock while the workflow runs.
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - start), 100);
    return () => window.clearInterval(timer);
  }, [running]);

  const run = async (q = query) => {
    if (!q.trim()) return;
    setRunning(true);
    setError(null);
    setFinal(null);
    setNodes(initialNodes());
    setPath([]);
    setEvents([]);
    setSelected(null);
    setElapsed(0);
    pinned.current = false;
    try {
      const state = await runAgent(q.trim(), simulate, (event) => {
        if (event.type !== 'node') return;
        if (event.status === 'running') setPath((p) => [...p, event.node]);
        else setEvents((list) => [...list, event]);
        setNodes((prev) => {
          const cur = prev[event.node];
          const next: NodeView =
            event.status === 'running'
              ? { ...cur, status: 'running' }
              : { status: event.status, runs: cur.runs + 1, ms: cur.ms + (event.ms ?? 0), summary: event.summary, detail: event.detail };
          return { ...prev, [event.node]: next };
        });
        if (!pinned.current) setSelected(event.node);
      });
      setFinal(state);
      setElapsed(state.totalMs);
      setNodes((prev) => {
        const out = { ...prev };
        for (const n of NODES) if (out[n.id].status === 'pending') out[n.id] = { ...out[n.id], status: 'skipped' };
        return out;
      });
      if (!pinned.current) setSelected('generate');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setNodes((prev) => {
        const out = { ...prev };
        for (const n of NODES) if (out[n.id].status === 'running') out[n.id] = { ...out[n.id], status: 'error' };
        return out;
      });
    } finally {
      setRunning(false);
    }
  };

  const traversed = new Set(path.slice(1).map((to, i) => `${path[i]}>${to}`));
  const active = running ? path[path.length - 1] : undefined;
  const pick = (id: AgentNodeId) => {
    pinned.current = true;
    setSelected(id);
  };

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Agent workflow</h1>
          <p className={styles.subtitle}>
            A LangGraph state machine that retrieves, detects, classifies and verifies conflicts before answering
          </p>
        </div>
      </header>

      {info && !info.python && (
        <div className={styles.notice}>
          The Python backend is offline. Start it with <code>npm run backend</code> (or <code>npm run dev:all</code>).
        </div>
      )}

      <QueryBar id="agent-query" query={query} onQueryChange={setQuery} onRun={() => run()} running={running} runLabel="Run workflow ▸">
        <label className={styles.check} title="Forces evidence verification to fail on the first attempt so the retry loop runs">
          <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} disabled={running} />
          Simulate a failed verification (demo of retry)
        </label>
        <div className={styles.samples}>
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.sample}
              disabled={running}
              onClick={() => {
                setQuery(s);
                run(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </QueryBar>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <section className={styles.graphCard} aria-label="Workflow execution">
        <div className={styles.graphHead}>
          <h2 className={styles.cardTitle}>Execution</h2>
          <span className={styles.caption}>
            {running
              ? `Running ${active ? LABELS[active].toLowerCase() : ''}…`
              : final
                ? `${final.trace.length} node runs · ${final.attempts} retrieval attempt${final.attempts === 1 ? '' : 's'}`
                : 'Click a node to inspect its output'}
          </span>
          <span className={styles.clock}>{running || final ? sec(elapsed) : '—'}</span>
        </div>
        <div className={styles.graphScroll}>
          <svg className={styles.graph} viewBox="0 0 1000 270" role="img" aria-label="LangGraph workflow with live node status">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" className={styles.arrowHead} />
              </marker>
              <marker id="arrowOn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" className={styles.arrowHeadOn} />
              </marker>
            </defs>
            {EDGES.map((e) => {
              const on = traversed.has(`${e.from}>${e.to}`);
              const live = on && active === e.to && path[path.length - 2] === e.from;
              return (
                <g key={`${e.from}>${e.to}`}>
                  <path
                    d={e.d}
                    className={`${styles.edge} ${e.conditional ? styles.edgeCond : ''} ${on ? styles.edgeOn : ''} ${live ? styles.edgeLive : ''}`}
                    markerEnd={on ? 'url(#arrowOn)' : 'url(#arrow)'}
                  />
                  {e.label && (
                    <text x={e.lx} y={e.ly} className={`${styles.edgeLabel} ${on ? styles.edgeLabelOn : ''}`} textAnchor={e.lx && e.ly && e.ly > 150 ? 'start' : 'middle'}>
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            {NODES.map((n) => {
              const v = nodes[n.id];
              return (
                <g
                  key={n.id}
                  className={`${styles.node} ${styles[v.status]} ${selected === n.id ? styles.selected : ''}`}
                  transform={`translate(${n.x} ${n.y})`}
                  onClick={() => pick(n.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.label}: ${v.status}`}
                  onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && pick(n.id)}
                >
                  <rect width={W} height={H} rx={18} className={styles.nodeBox} />
                  <circle cx={20} cy={20} r={11} className={styles.stepDot} />
                  <text x={20} y={24} textAnchor="middle" className={styles.stepText}>
                    {n.step}
                  </text>
                  <text x={36} y={24.5} className={styles.nodeLabel}>
                    {n.label}
                  </text>
                  <text x={14} y={50} className={styles.nodeMeta}>
                    {statusText(v)}
                  </text>
                  {v.runs > 1 && (
                    <g transform={`translate(${W - 30} -9)`}>
                      <rect width={34} height={20} rx={10} className={styles.runsBadge} />
                      <text x={17} y={14} textAnchor="middle" className={styles.runsText}>
                        ×{v.runs}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <div className={styles.legend}>
          {(['pending', 'running', 'done', 'skipped', 'error'] as NodeStatus[]).map((s) => (
            <span key={s} className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles['sw_' + s]}`} />
              {s}
            </span>
          ))}
          <span className={styles.legendItem}>
            <span className={styles.legendDash} /> conditional edge
          </span>
        </div>
      </section>

      <div className={styles.split}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Execution trace</h2>
          {events.length === 0 && !running && <p className={styles.empty}>Each node run appears here with its timing and routing decision.</p>}
          <ol className={styles.trace}>
            {events.map((e, i) => (
              <li key={i} className={`${styles.traceItem} ${e.status === 'error' ? styles.traceError : ''}`}>
                <button type="button" className={styles.traceBtn} onClick={() => pick(e.node)}>
                  <span className={styles.traceT}>{sec(e.t)}</span>
                  <span className={styles.traceNode}>
                    {LABELS[e.node]}
                    {e.attempt > 1 && <span className={styles.attempt}>attempt {e.attempt}</span>}
                  </span>
                  <span className={styles.traceMs}>{e.ms} ms</span>
                </button>
                <div className={styles.traceSummary}>{e.summary}</div>
                {e.route && (
                  <div className={styles.route}>
                    route → <b>{LABELS[e.route]}</b>
                  </div>
                )}
              </li>
            ))}
            {running && active && (
              <li className={`${styles.traceItem} ${styles.tracePending}`}>
                <span className={styles.traceNode}>{LABELS[active]}…</span>
              </li>
            )}
          </ol>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{selected ? LABELS[selected] : 'Node inspector'}</h2>
          {selected ? (
            <Inspector id={selected} view={nodes[selected]} final={final} />
          ) : (
            <p className={styles.empty}>Run the workflow, then click any node to see its state update.</p>
          )}
        </section>
      </div>

      {final?.result && <FinalAnswer state={final} />}
    </>
  );
}

function statusText(v: NodeView): string {
  if (v.status === 'running') return 'running…';
  if (v.status === 'done') return `done · ${v.ms} ms`;
  if (v.status === 'error') return 'error';
  if (v.status === 'skipped') return 'skipped';
  return 'waiting';
}

function Inspector({ id, view, final }: { id: AgentNodeId; view: NodeView; final: AgentFinalState | null }) {
  if (view.status === 'pending' || view.status === 'running') {
    return <p className={styles.empty}>{view.status === 'running' ? 'Running…' : 'Not reached yet.'}</p>;
  }
  if (view.status === 'skipped') {
    const why: Partial<Record<AgentNodeId, string>> = {
      classify: 'Skipped: conflict analysis found no conflict, so the graph routed straight to evidence verification.',
      fallback: 'Skipped: evidence verification passed, so no fallback was needed.',
    };
    return <p className={styles.empty}>{why[id] ?? 'Skipped on this run.'}</p>;
  }
  if (view.status === 'error') return <p className={styles.errorText}>{view.summary}</p>;

  const d = view.detail as Record<string, unknown> | undefined;
  return (
    <div className={styles.inspector}>
      <p className={styles.summary}>{view.summary}</p>
      {id === 'understand' && d && (
        <dl className={styles.kv}>
          <dt>Intent</dt>
          <dd>{String(d.intent)}</dd>
          <dt>Target</dt>
          <dd>{String(d.target)}</dd>
          <dt>Entities</dt>
          <dd>{(d.entities as string[]).join(', ') || '—'}</dd>
          <dt>Search query</dt>
          <dd className={styles.mono}>{String(d.search_query)}</dd>
        </dl>
      )}
      {id === 'retrieve' && (
        <>
          <dl className={styles.kv}>
            <dt>Query</dt>
            <dd className={styles.mono}>{String(d?.query)}</dd>
            <dt>Top k</dt>
            <dd>{String(d?.k)}</dd>
          </dl>
          <ul className={styles.docs}>
            {(final?.retrieval?.chunks ?? []).map((c) => (
              <li key={c.id}>
                <span className={styles.docId}>{c.id}</span>
                <span className={styles.docTitle}>{c.title}</span>
                <span className={styles.docDate}>{c.date}</span>
                <span className={styles.docScore}>{c.score.toFixed(2)}</span>
              </li>
            ))}
            {!final &&
              ((d?.ids as string[]) ?? []).map((docId, i) => (
                <li key={docId}>
                  <span className={styles.docId}>{docId}</span>
                  <span className={styles.docScore}>{((d?.scores as number[])[i] ?? 0).toFixed(2)}</span>
                </li>
              ))}
          </ul>
        </>
      )}
      {id === 'analyze' && d && (
        <>
          <Claims claims={d.claims as AgentClaim[]} highlight={d.conflicting_ids as string[]} />
          <p className={styles.reasoning}>{String(d.reasoning)}</p>
        </>
      )}
      {id === 'classify' && d && (
        <dl className={styles.kv}>
          <dt>Label</dt>
          <dd>
            <span className={styles.kind}>{String(d.type)}</span>
          </dd>
          <dt>Trust</dt>
          <dd>{d.authoritative_id ? String(d.authoritative_id) : '—'}</dd>
          <dt>Rationale</dt>
          <dd>{String(d.rationale)}</dd>
        </dl>
      )}
      {id === 'verify' && d && <Checks checks={d.checks as VerificationCheck[]} />}
      {id === 'fallback' && d && <p className={styles.reasoning}>{String(d.reason)}</p>}
      {id === 'generate' && d && <p className={styles.answer}>{String(d.answer)}</p>}
    </div>
  );
}

function Claims({ claims, highlight }: { claims: AgentClaim[]; highlight: string[] }) {
  if (!claims.length) return <p className={styles.empty}>No document states the target.</p>;
  return (
    <ul className={styles.claims}>
      {claims.map((c) => (
        <li key={c.doc_id + c.value} className={highlight.includes(c.doc_id) ? styles.claimHot : ''}>
          <span className={styles.docId}>{c.doc_id}</span>
          <mark className={styles.value}>{c.value}</mark>
          <span className={styles.statement}>{c.statement}</span>
        </li>
      ))}
    </ul>
  );
}

function Checks({ checks }: { checks: VerificationCheck[] }) {
  return (
    <ul className={styles.checks}>
      {checks.map((c, i) => (
        <li key={i}>
          <span className={c.passed ? styles.ok : styles.bad} aria-label={c.passed ? 'passed' : 'failed'}>
            {c.passed ? '✓' : '✕'}
          </span>
          <span>
            <b>{c.name}</b>
            <span className={styles.checkDetail}>{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function FinalAnswer({ state }: { state: AgentFinalState }) {
  const r = state.result!;
  return (
    <section className={styles.final}>
      <div className={styles.finalHead}>
        <h2 className={styles.cardTitle}>Final answer</h2>
        <span className={r.confidence === 'verified' ? styles.verified : styles.lowConf}>
          {r.confidence === 'verified' ? 'Evidence verified' : 'Low confidence · fallback used'}
        </span>
        <span className={styles.caption}>
          {sec(state.totalMs)} total · cites {r.cites.join(', ') || 'none'}
        </span>
      </div>
      {r.conflict ? (
        <>
          <ConflictBanner aware={r} variant="solid" />
          {r.pair.length === 2 && (
            <div className={styles.pair}>
              <SourceCard source={r.pair[0]} badge={r.authoritativeId === r.pair[0].id ? 'trusted' : undefined} />
              <div className={styles.notEqual}>≠</div>
              <SourceCard source={r.pair[1]} badge={r.authoritativeId === r.pair[1].id ? 'trusted' : undefined} />
            </div>
          )}
        </>
      ) : (
        <div className={styles.noConflict}>
          <span className={styles.dot} />
          {state.analysis?.conflict && state.classification?.type === 'none'
            ? 'Suspected conflict dismissed on classification'
            : state.fallback?.used
              ? 'A suspected conflict could not be verified'
              : 'No conflict across retrieved sources'}
        </div>
      )}
      <p className={styles.answer}>{r.answer}</p>
      {state.fallback?.used && <p className={styles.reasoning}>{state.fallback.reason}</p>}
    </section>
  );
}
