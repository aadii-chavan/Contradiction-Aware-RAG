import type { AwareResult, ConflictSource, QueryResult } from '../types';
import Meter from './Meter';
import styles from './AnswerPanels.module.css';

export type BannerStyle = 'solid' | 'tint';

interface AnswerPanelsProps {
  result: QueryResult | null;
  bannerStyle: BannerStyle;
  loading: boolean;
}

const seconds = (ms: number) => (ms / 1000).toFixed(2);

export default function AnswerPanels({ result, bannerStyle, loading }: AnswerPanelsProps) {
  const aware = result?.aware;
  const slowest = result ? Math.max(result.baseline.latencyMs, result.aware.latencyMs) : 1;

  return (
    <section id="answers" className={`${styles.grid} ${loading ? styles.dimmed : ''}`}>
      <div className={`${styles.panel} ${styles.panelBase}`}>
        <PanelHeader
          title="Baseline Prompt"
          tag="A"
          latencyMs={result?.baseline.latencyMs}
          fill={result ? result.baseline.latencyMs / slowest : 0}
        />
        <div className={styles.body}>
          <div className={styles.answerLabel}>Answer</div>
          {result ? (
            <>
              <p className={styles.answer}>{result.baseline.answer}</p>
              <div className={styles.cites}>cites: {result.baseline.cites.join(', ') || 'none'}</div>
            </>
          ) : (
            <p className={styles.empty}>Run a query to see the baseline answer.</p>
          )}
        </div>
      </div>

      <div className={`${styles.panel} ${styles.panelAware}`}>
        <PanelHeader
          title="Conflict-Aware Prompt"
          tag="B"
          latencyMs={aware?.latencyMs}
          fill={result ? result.aware.latencyMs / slowest : 0}
        />
        <div className={styles.body}>
          {aware ? (
            <>
              {aware.conflict ? (
                <>
                  <ConflictBanner aware={aware} variant={bannerStyle} />
                  {aware.pair.length === 2 && (
                    <div className={styles.pair}>
                      <SourceCard source={aware.pair[0]} />
                      <div className={styles.notEqual}>≠</div>
                      <SourceCard source={aware.pair[1]} />
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.noConflict}>
                  <div className={styles.noConflictDot} />
                  No conflict detected across retrieved sources
                </div>
              )}
              <p className={styles.answer}>{aware.answer}</p>
            </>
          ) : (
            <p className={styles.empty}>Run a query to see the conflict-aware answer.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function PanelHeader({ tag, title, latencyMs, fill }: { tag: string; title: string; latencyMs?: number; fill: number }) {
  return (
    <div className={styles.panelHeader}>
      <div className={styles.panelTitle}>
        <span className={styles.panelTag}>{tag}</span>
        <span className={styles.panelName}>{title}</span>
      </div>
      <div className={styles.bigRow}>
        <span className={styles.big}>{latencyMs === undefined ? '—' : seconds(latencyMs)}</span>
        <span className={styles.bigUnit}>sec latency</span>
      </div>
      <Meter value={fill} />
    </div>
  );
}

function ConflictBanner({ aware, variant }: { aware: AwareResult; variant: BannerStyle }) {
  return (
    <div className={`${styles.banner} ${variant === 'solid' ? styles.bannerSolid : styles.bannerTint}`} role="alert">
      <div className={styles.bannerIcon}>!</div>
      <div className={styles.bannerText}>
        <div className={styles.bannerTitle}>Sources disagree</div>
        <div className={styles.bannerType}>{aware.conflictType}</div>
      </div>
      <div className={styles.bannerPair}>{aware.pair.map((p) => p.id).join(' ↔ ')}</div>
    </div>
  );
}

function SourceCard({ source }: { source: ConflictSource }) {
  return (
    <div className={styles.source}>
      <div className={styles.sourceHead}>
        <span className={styles.sourceId}>{source.id}</span>
        <span className={styles.sourceDate}>{source.date}</span>
      </div>
      <div className={styles.sourceTitle}>{source.title}</div>
      <div className={styles.sourceExcerpt}>
        {source.pre}
        <mark className={styles.mark}>{source.val}</mark>
        {source.post}
      </div>
    </div>
  );
}
