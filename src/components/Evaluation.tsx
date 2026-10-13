import { useState } from 'react';
import { runEvaluation } from '../api';
import type { EvalProgress, EvalResult, EvalRow } from '../types';
import Meter from './Meter';
import styles from './Evaluation.module.css';

interface Metric {
  label: string;
  value: string;
  base: string;
  fill: number;
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
const sec = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

function toMetrics(r: EvalResult | null): Metric[] {
  if (!r) {
    return ['Conflicts Detected', 'False Alarms', 'Attribution Accuracy', 'Avg Latency'].map((label) => ({
      label,
      value: '—',
      base: '—',
      fill: 0,
    }));
  }
  const c = r.conflictQueries;
  const k = r.cleanQueries;
  return [
    { label: 'Conflicts Detected', value: `${r.aware.detected} / ${c}`, base: `${r.baseline.detected} / ${c}`, fill: r.aware.detected / (c || 1) },
    { label: 'False Alarms', value: `${r.aware.falseAlarms} / ${k}`, base: `${r.baseline.falseAlarms} / ${k}`, fill: r.aware.falseAlarms / (k || 1) },
    { label: 'Attribution Accuracy', value: pct(r.aware.attributed, c), base: pct(r.baseline.attributed, c), fill: r.aware.attributed / (c || 1) },
    { label: 'Avg Latency', value: sec(r.aware.avgLatencyMs), base: sec(r.baseline.avgLatencyMs), fill: r.aware.avgLatencyMs / (Math.max(r.aware.avgLatencyMs, r.baseline.avgLatencyMs) || 1) },
  ];
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

/** Conflict-aware pass: flags exactly when a conflict is seeded, and names the right pair. */
const awarePassed = (r: EvalRow) => r.awareFlagged === r.expectConflict && (!r.expectConflict || r.awareAttributed);

function ResultsTable({ rows, running }: { rows: EvalRow[]; running: boolean }) {
  const [failuresOnly, setFailuresOnly] = useState(false);
  const failures = rows.filter((r) => !awarePassed(r)).length;
  const shown = rows.map((r, i) => ({ r, i })).filter(({ r }) => !failuresOnly || !awarePassed(r));

  return (
    <div className={styles.tableCard}>
      <div className={styles.tableHead}>
        <h3 className={styles.tableTitle}>Per-query results</h3>
        <span className={styles.caption}>
          {rows.length} {rows.length === 1 ? 'query' : 'queries'} · conflict-aware failures: {failures}
        </span>
        <label className={styles.filter}>
          <input type="checkbox" checked={failuresOnly} onChange={(e) => setFailuresOnly(e.target.checked)} />
          Failures only
        </label>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Query</th>
              <th>Expected</th>
              <th>Baseline</th>
              <th>Conflict-aware</th>
              <th className={styles.num}>Latency (A / B)</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ r, i }) => {
              const pass = awarePassed(r);
              return (
                <tr key={r.query} className={running && i === rows.length - 1 ? styles.fresh : undefined}>
                  <td className={styles.idx}>{i + 1}</td>
                  <td className={styles.queryCell}>{r.query}</td>
                  <td>
                    {r.expectConflict ? (
                      <span className={styles.ids}>{r.expectedIds.join(' ↔ ')}</span>
                    ) : (
                      <span className={styles.muted}>clean</span>
                    )}
                  </td>
                  <td>
                    <span className={r.baselineFlagged ? styles.tagOn : styles.tag}>
                      {r.baselineFlagged ? 'Flagged' : 'Not flagged'}
                    </span>
                    {r.expectConflict && (
                      <span className={styles.sub}>{r.baselineAttributed ? 'names both' : 'misses a source'}</span>
                    )}
                  </td>
                  <td>
                    <span className={r.awareFlagged ? styles.tagOn : styles.tag}>
                      {r.awareFlagged ? 'Flagged' : 'Not flagged'}
                    </span>
                    {r.expectConflict && (
                      <span className={styles.sub}>{r.awareAttributed ? 'right pair' : 'wrong pair'}</span>
                    )}
                  </td>
                  <td className={styles.num}>
                    {seconds(r.baselineMs)} / {seconds(r.awareMs)}
                  </td>
                  <td>
                    <span className={pass ? styles.pass : styles.fail}>{pass ? 'Pass' : 'Fail'}</span>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.emptyRow}>
                  No failures.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Evaluation() {
  const [result, setResult] = useState<EvalResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; query: string } | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setProgress({ done: 0, total: 0, query: '' });
    try {
      const final = await runEvaluation((event) => {
        if (event.type !== 'progress') return;
        const p: EvalProgress = event;
        setProgress({ done: p.done, total: p.total, query: p.query });
        setResult(p.result);
      });
      setResult(final);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <section id="evaluation" className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.heading}>Evaluation</h2>
        <span className={styles.caption}>
          {result
            ? `${progress?.total || result.conflictQueries + result.cleanQueries} queries · ${result.conflictQueries} seeded conflicts, ${result.cleanQueries} clean controls · Conflict-Aware vs Baseline`
            : 'Runs the labelled query set in server/evalSet.ts against both prompts'}
        </span>
        <button type="button" className={styles.run} onClick={run} disabled={running}>
          {running ? 'Running…' : result ? 'Re-run evaluation' : 'Run evaluation'}
        </button>
      </div>
      {running && progress && (
        <div className={styles.progress} role="status" aria-live="polite">
          <div className={styles.progressTop}>
            <span className={styles.progressCount}>
              {progress.total ? `${progress.done} / ${progress.total}` : 'Starting…'}
            </span>
            <span className={styles.progressQuery} key={progress.query}>
              {progress.done === 0 ? 'Retrieving and querying the model…' : `Done: ${progress.query}`}
            </span>
          </div>
          <Meter value={progress.total ? progress.done / progress.total : 0} segments={progress.total || 30} size="sm" active />
        </div>
      )}
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.grid}>
        {toMetrics(result).map((metric, i) => (
          <div key={metric.label} className={`${styles.card} ${i === 0 ? styles.cardLime : ''} ${running ? styles.cardRunning : ''}`}>
            <div className={styles.label}>{metric.label}</div>
            <div className={styles.values}>
              <span className={styles.value}>{metric.value}</span>
              <span className={styles.base}>baseline {metric.base}</span>
            </div>
            <Meter value={metric.fill} active={running} />
          </div>
        ))}
      </div>
      {result && result.rows.length > 0 && <ResultsTable rows={result.rows} running={running} />}
    </section>
  );
}
