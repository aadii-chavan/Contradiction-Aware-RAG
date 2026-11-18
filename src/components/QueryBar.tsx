import type { ReactNode } from 'react';
import styles from './QueryBar.module.css';

interface QueryBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onRun: () => void;
  running: boolean;
  runLabel?: string;
  /** Extra controls shown under the input (e.g. the retriever toggle). */
  children?: ReactNode;
  id?: string;
}

export default function QueryBar({
  query,
  onQueryChange,
  onRun,
  running,
  runLabel = 'Run both ▸',
  children,
  id = 'query',
}: QueryBarProps) {
  return (
    <section id={id} className={styles.section}>
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
        <button type="submit" className={styles.run} disabled={running || !query.trim()}>
          {running ? 'Running…' : runLabel}
        </button>
      </form>
      {children && <div className={styles.controls}>{children}</div>}
    </section>
  );
}
