import { useState } from 'react';
import { runEvaluation } from '../api';
import type { EvalResult } from '../types';
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

export default function Evaluation() {
  const [result, setResult] = useState<EvalResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setResult(await runEvaluation());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section id="evaluation" className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.heading}>Evaluation</h2>
        <span className={styles.caption}>
          {result
            ? `${result.conflictQueries + result.cleanQueries} queries · ${result.conflictQueries} seeded conflicts, ${result.cleanQueries} clean controls · Conflict-Aware vs Baseline`
            : 'Runs the labelled query set in server/evalSet.ts against both prompts'}
        </span>
        <button type="button" className={styles.run} onClick={run} disabled={running}>
          {running ? 'Running…' : result ? 'Re-run evaluation' : 'Run evaluation'}
        </button>
      </div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.grid}>
        {toMetrics(result).map((metric, i) => (
          <div key={metric.label} className={`${styles.card} ${i === 0 ? styles.cardLime : ''}`}>
            <div className={styles.label}>{metric.label}</div>
            <div className={styles.values}>
              <span className={styles.value}>{metric.value}</span>
              <span className={styles.base}>baseline {metric.base}</span>
            </div>
            <Meter value={metric.fill} />
          </div>
        ))}
      </div>
    </section>
  );
}
