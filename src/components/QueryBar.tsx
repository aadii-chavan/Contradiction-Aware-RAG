import styles from './QueryBar.module.css';

interface QueryBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onRun: () => void;
  running: boolean;
}

export default function QueryBar({
  query,
  onQueryChange,
  onRun,
  running,
}: QueryBarProps) {
  return (
    <section id="query" className={styles.section}>
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
          {running ? 'Running…' : 'Run both ▸'}
        </button>
      </form>
    </section>
  );
}
