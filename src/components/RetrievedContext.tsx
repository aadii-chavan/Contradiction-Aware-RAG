import type { QueryResult } from '../types';
import Meter from './Meter';
import styles from './RetrievedContext.module.css';

interface RetrievedContextProps {
  result: QueryResult | null;
  showScoreBars: boolean;
}

export default function RetrievedContext({ result, showScoreBars }: RetrievedContextProps) {
  const chunks = result?.chunks ?? [];
  const pairIds = new Set(result?.aware.pair.map((p) => p.id));
  const pairScores = chunks.filter((c) => pairIds.has(c.id)).map((c) => c.score);
  const pairDelta = pairScores.length === 2 ? Math.abs(pairScores[0] - pairScores[1]).toFixed(2) : null;

  return (
    <section id="context" className={styles.section}>
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <h2 className={styles.heading}>Retrieved context</h2>
          <span className={styles.caption}>top-{chunks.length || 4} chunks by cosine similarity, shared by both conditions</span>
        </div>
        {pairDelta && (
          <div className={styles.note}>
            Conflicting pair separated by <span className={styles.delta}>Δ {pairDelta}</span> — retrieval alone
            can't tell them apart
          </div>
        )}
      </div>
      <div className={styles.grid}>
        {chunks.map((chunk) => (
          <div key={chunk.id} className={`${styles.chunk} ${pairIds.has(chunk.id) ? styles.chunkPair : ''}`}>
            <div className={styles.chunkHead}>
              <span className={styles.chunkId}>{chunk.id}</span>
              <span className={styles.score}>{chunk.score.toFixed(2)}</span>
            </div>
            {showScoreBars && <Meter value={chunk.score} segments={10} size="sm" />}
            <div className={styles.chunkText}>
              {chunk.title} — {chunk.text}
            </div>
            <a className={styles.edit} href={`#/documents/${chunk.id}`}>
              Edit document
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
