import { PRESETS, PRESET_KEYS, type PresetKey } from '../data/presets';
import styles from './QueryBar.module.css';

interface QueryBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onRun: () => void;
  running: boolean;
  activePreset: PresetKey;
  onSelectPreset: (key: PresetKey) => void;
}

export default function QueryBar({
  query,
  onQueryChange,
  onRun,
  running,
  activePreset,
  onSelectPreset,
}: QueryBarProps) {
  return (
    <section className={styles.section}>
      <form
        className={styles.row}
        onSubmit={(e) => {
          e.preventDefault();
          onRun();
        }}
      >
        <label className={styles.field}>
          <span className={styles.fieldTag}>Q</span>
          <input
            className={styles.input}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Ask a question about the corpus"
          />
        </label>
        <button type="submit" className={styles.run}>
          {running ? 'Running…' : 'Run both ▸'}
        </button>
      </form>
      <div className={styles.presets}>
        <div className={styles.presetsLabel}>Presets</div>
        {PRESET_KEYS.map((key) => {
          const preset = PRESETS[key];
          const active = key === activePreset;
          return (
            <button
              key={key}
              type="button"
              className={`${styles.chip} ${active ? styles.chipActive : ''}`}
              aria-pressed={active}
              onClick={() => onSelectPreset(key)}
            >
              <span className={`${styles.chipDot} ${preset.conflict ? styles.chipDotConflict : ''}`} />
              {preset.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
