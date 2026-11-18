import { RETRIEVER_LABELS, type RetrieverMode } from '../types';
import styles from './RetrieverToggle.module.css';

interface RetrieverToggleProps {
  value: RetrieverMode;
  onChange: (mode: RetrieverMode) => void;
  /** Vector and hybrid need the Python backend. */
  pythonReady: boolean;
  disabled?: boolean;
}

const MODES: RetrieverMode[] = ['tfidf', 'vector', 'hybrid'];

/** Segmented control for picking the retriever used by the prompt comparison and the evaluation. */
export default function RetrieverToggle({ value, onChange, pythonReady, disabled }: RetrieverToggleProps) {
  return (
    <div className={styles.group} role="radiogroup" aria-label="Retriever">
      <span className={styles.label}>Retriever</span>
      {MODES.map((mode) => {
        const unavailable = mode !== 'tfidf' && !pythonReady;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={value === mode}
            className={`${styles.option} ${value === mode ? styles.active : ''}`}
            onClick={() => onChange(mode)}
            disabled={disabled || unavailable}
            title={unavailable ? 'Start the Python backend (npm run backend) to use this retriever' : undefined}
          >
            {RETRIEVER_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
