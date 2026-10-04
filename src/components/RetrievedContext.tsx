import { SCORES, type Preset } from '../data/presets';
import styles from './RetrievedContext.module.css';

interface RetrievedContextProps {
  preset: Preset;
  showScoreBars: boolean;
}

export default function RetrievedContext({ preset, showScoreBars }: RetrievedContextProps) {
  const pairDelta = (SCORES[0] - SCORES[1]).toFixed(2);

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <h2 className={styles.heading}>Retrieved context</h2>
          <span className={styles.caption}>top-4 chunks by cosine similarity, shared by both conditions</span>
        </div>
        {preset.conflict && (
          <div className={styles.note}>
            Conflicting pair separated by <span className={styles.delta}>Δ {pairDelta}</span> — retrieval alone
            can't tell them apart
          </div>
        )}
      </div>
      <div className={styles.grid}>
        {preset.conflict && (
          <>
            <div className={styles.bracket}>
              <div className={styles.bracketLabel}>CONFLICTING PAIR</div>
            </div>
            <div className={styles.bracketSpacer} />
          </>
        )}
        {preset.chunks.map((chunk, i) => {
          // The conflicting pair is always the two top-ranked chunks.
          const inPair = preset.conflict && i < 2;
          return (
            <div key={chunk.id} className={`${styles.chunk} ${inPair ? styles.chunkPair : ''}`}>
              <div className={styles.chunkHead}>
                <span className={styles.chunkId}>{chunk.id}</span>
                <span className={styles.score}>{SCORES[i].toFixed(2)}</span>
              </div>
              {showScoreBars && (
                <div className={styles.bar}>
                  <div className={styles.barFill} style={{ width: `${SCORES[i] * 100}%` }} />
                </div>
              )}
              <div className={styles.chunkText}>{chunk.text}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
