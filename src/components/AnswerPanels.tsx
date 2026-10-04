import type { ConflictPreset, ConflictSource, Preset } from '../data/presets';
import styles from './AnswerPanels.module.css';

export type BannerStyle = 'solid' | 'tint';

interface AnswerPanelsProps {
  preset: Preset;
  bannerStyle: BannerStyle;
  dimmed: boolean;
}

export default function AnswerPanels({ preset, bannerStyle, dimmed }: AnswerPanelsProps) {
  return (
    <section className={`${styles.grid} ${dimmed ? styles.dimmed : ''}`}>
      <div className={styles.panel}>
        <PanelHeader tag="A" title="Baseline Prompt" latency={preset.latA} />
        <div className={styles.baselineBody}>
          <div className={styles.answerLabel}>Answer</div>
          <p className={styles.baselineAnswer}>{preset.baseline}</p>
          <div className={styles.cites}>cites: {preset.baseCite}</div>
        </div>
      </div>

      <div className={styles.panel}>
        <PanelHeader tag="B" title="Conflict-Aware Prompt" latency={preset.latB} />
        <div className={styles.awareBody}>
          {preset.conflict ? (
            <>
              <ConflictBanner preset={preset} variant={bannerStyle} />
              <div className={styles.pair}>
                <SourceCard source={preset.a} />
                <div className={styles.notEqual}>≠</div>
                <SourceCard source={preset.b} />
              </div>
            </>
          ) : (
            <div className={styles.noConflict}>
              <div className={styles.noConflictDot} />
              No conflict detected across retrieved sources
            </div>
          )}
          <p className={styles.awareAnswer}>{preset.aware}</p>
        </div>
      </div>
    </section>
  );
}

function PanelHeader({ tag, title, latency }: { tag: string; title: string; latency: string }) {
  return (
    <div className={styles.panelHeader}>
      <div className={styles.panelTitle}>
        <span className={styles.panelTag}>{tag}</span>
        <span className={styles.panelName}>{title}</span>
      </div>
      <div className={styles.latency}>{latency}</div>
    </div>
  );
}

function ConflictBanner({ preset, variant }: { preset: ConflictPreset; variant: BannerStyle }) {
  return (
    <div className={`${styles.banner} ${variant === 'solid' ? styles.bannerSolid : styles.bannerTint}`} role="alert">
      <div className={styles.bannerIcon}>!</div>
      <div className={styles.bannerText}>
        <div className={styles.bannerTitle}>Sources disagree</div>
        <div className={styles.bannerType}>{preset.conflictType}</div>
      </div>
      <div className={styles.bannerPair}>{preset.pairIds}</div>
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
