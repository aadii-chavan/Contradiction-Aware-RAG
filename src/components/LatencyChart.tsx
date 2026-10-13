import { useState } from 'react';
import type { EvalRow } from '../types';
import styles from './LatencyChart.module.css';

const W = 900;
const H = 260;
const M = { top: 12, right: 12, bottom: 30, left: 40 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const BAR_MAX = 14;
const RADIUS = 4;

const seconds = (ms: number) => (ms / 1000).toFixed(2);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Bar with only its top corners rounded, anchored to the baseline. */
function barPath(x: number, w: number, top: number, bottom: number) {
  const r = Math.min(RADIUS, w / 2, bottom - top);
  return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${bottom} Z`;
}

export default function LatencyChart({ rows }: { rows: EvalRow[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const peak = Math.max(...rows.flatMap((r) => [r.baselineMs, r.awareMs]), 1000);
  const step = peak > 4000 ? 1000 : 500;
  const yMax = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);

  const slot = PLOT_W / Math.max(rows.length, 8);
  const barW = Math.min(slot * 0.34, BAR_MAX);
  const y = (ms: number) => M.top + PLOT_H - (ms / yMax) * PLOT_H;
  const baseY = M.top + PLOT_H;

  const avgBase = mean(rows.map((r) => r.baselineMs));
  const avgAware = mean(rows.map((r) => r.awareMs));
  const hovered = hover === null ? null : rows[hover];

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <h3 className={styles.title}>Latency per query</h3>
        <ul className={styles.legend}>
          <li>
            <span className={`${styles.swatch} ${styles.baseline}`} /> Baseline <span className={styles.avg}>avg {seconds(avgBase)} s</span>
          </li>
          <li>
            <span className={`${styles.swatch} ${styles.aware}`} /> Conflict-aware <span className={styles.avg}>avg {seconds(avgAware)} s</span>
          </li>
        </ul>
      </div>

      <div className={styles.scroll}>
        <div className={styles.plot}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className={styles.svg}
            role="img"
            aria-label={`Grouped bar chart of per-query latency in seconds for ${rows.length} queries. Baseline averages ${seconds(avgBase)} s, conflict-aware ${seconds(avgAware)} s. The table below lists every value.`}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? styles.axis : styles.grid} />
                <text x={M.left - 8} y={y(t)} className={styles.tick} textAnchor="end" dominantBaseline="middle">
                  {t / 1000}s
                </text>
              </g>
            ))}

            {rows.map((r, i) => {
              const cx = M.left + slot * i + slot / 2;
              return (
                <g key={r.query} opacity={hover === null || hover === i ? 1 : 0.45}>
                  <path d={barPath(cx - barW - 1, barW, y(r.baselineMs), baseY)} className={styles.baselineBar} />
                  <path d={barPath(cx + 1, barW, y(r.awareMs), baseY)} className={styles.awareBar} />
                  {(rows.length <= 12 || (i + 1) % 5 === 0 || i === 0) && (
                    <text x={cx} y={H - 10} className={styles.tick} textAnchor="middle">
                      {i + 1}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Hit targets wider than the marks */}
            {rows.map((r, i) => (
              <rect
                key={`hit-${r.query}`}
                x={M.left + slot * i}
                y={M.top}
                width={slot}
                height={PLOT_H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </svg>

          {hovered && hover !== null && (
            <div
              className={styles.tooltip}
              style={{
                left: `${((M.left + slot * hover + slot / 2) / W) * 100}%`,
                transform: `translateX(${hover > rows.length / 2 ? '-105%' : '5%'})`,
              }}
              role="status"
            >
              <div className={styles.tipQuery}>
                #{hover + 1} · {hovered.query}
              </div>
              <div className={styles.tipRow}>
                <span className={`${styles.swatch} ${styles.baseline}`} /> Baseline <b>{seconds(hovered.baselineMs)} s</b>
              </div>
              <div className={styles.tipRow}>
                <span className={`${styles.swatch} ${styles.aware}`} /> Conflict-aware <b>{seconds(hovered.awareMs)} s</b>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.axisLabel}>Query # (see table below)</div>
    </div>
  );
}
