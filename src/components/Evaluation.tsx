import { METRICS } from '../data/presets';
import styles from './Evaluation.module.css';

export default function Evaluation() {
  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.heading}>Evaluation</h2>
        <span className={styles.caption}>
          30 queries · 20 seeded conflicts, 10 clean controls · Conflict-Aware vs Baseline
        </span>
      </div>
      <div className={styles.grid}>
        {METRICS.map((metric) => (
          <div key={metric.label} className={styles.card}>
            <div className={styles.label}>{metric.label}</div>
            <div className={styles.values}>
              <span className={styles.value}>{metric.value}</span>
              <span className={styles.base}>baseline {metric.base}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
