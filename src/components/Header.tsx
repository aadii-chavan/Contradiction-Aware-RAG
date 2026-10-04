import styles from './Header.module.css';

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.titleBlock}>
        <div className={styles.titleRow}>
          <div className={styles.logo} />
          <h1 className={styles.title}>Contradiction-Aware RAG</h1>
        </div>
        <div className={styles.subtitle}>Prompt strategy comparison over a seeded corpus</div>
      </div>
      <div className={styles.meta}>
        <div className={styles.config}>embed: bge-base-en · k=4</div>
        <div className={styles.status}>
          <div className={styles.statusDot} />
          12 documents indexed
        </div>
      </div>
    </header>
  );
}
