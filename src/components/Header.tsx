import type { ServerInfo } from '../types';
import styles from './Header.module.css';

export default function Header({ info }: { info: ServerInfo | null }) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}>
          Contradiction-Aware
          <span className={styles.pill} aria-hidden>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.5c.7 4.8 4.7 8.8 9.5 9.5-4.8.7-8.8 4.7-9.5 9.5-.7-4.8-4.7-8.8-9.5-9.5 4.8-.7 8.8-4.7 9.5-9.5Z" />
            </svg>
          </span>
          RAG
        </h1>
        <div className={styles.subtitle}>Prompt strategy comparison over a seeded corpus</div>
      </div>
      <div className={styles.meta}>
        <div className={styles.config}>
          {info ? `retriever: ${info.retriever} · k=${info.k} · llm: ${info.model}` : 'server unavailable'}
        </div>
        <div className={styles.status}>
          <div className={styles.statusDot} />
          {info ? `${info.documents} documents indexed` : 'offline'}
        </div>
      </div>
    </header>
  );
}
