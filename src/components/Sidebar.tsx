import type { ReactNode } from 'react';
import styles from './Sidebar.module.css';

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const DASHBOARD_ITEMS = [
  { href: '#query', label: 'Query', svg: icon(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>) },
  { href: '#answers', label: 'Answers', svg: icon(<><rect x="4" y="5" width="7" height="14" rx="2" /><rect x="13" y="5" width="7" height="14" rx="2" /></>) },
  { href: '#context', label: 'Retrieved context', svg: icon(<><path d="M5 6h14M5 12h14M5 18h9" /></>) },
  { href: '#evaluation', label: 'Evaluation', svg: icon(<><path d="M5 20V10M12 20V4M19 20v-7" /></>) },
];

const RETRIEVAL_ICON = icon(<><path d="M4 6h5M4 12h5M4 18h5" /><path d="M13 6h7M13 12h4M13 18h6" /></>);
const AGENT_ICON = icon(<><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M8.2 6h7.6M7.2 7.9l3.7 8.2M16.8 7.9l-3.7 8.2" /></>);

export type Page = 'dashboard' | 'documents' | 'retrieval' | 'agent';

const PAGE_ITEMS: { page: Page; href: string; label: string; svg: ReactNode }[] = [
  { page: 'retrieval', href: '#/retrieval', label: 'Retrieval lab: TF-IDF vs vector vs hybrid', svg: RETRIEVAL_ICON },
  { page: 'agent', href: '#/agent', label: 'Agent workflow (LangGraph)', svg: AGENT_ICON },
];

const DOCS_ICON = icon(<><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" /><path d="M14 3.5V8h4M9.5 12.5h5M9.5 16h5" /></>);

export default function Sidebar({ page }: { page: Page }) {
  return (
    <aside className={styles.rail}>
      <div className={styles.logo} aria-hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M12 2.5c.7 4.8 4.7 8.8 9.5 9.5-4.8.7-8.8 4.7-9.5 9.5-.7-4.8-4.7-8.8-9.5-9.5 4.8-.7 8.8-4.7 9.5-9.5Z" />
        </svg>
      </div>
      <nav className={styles.nav}>
        {DASHBOARD_ITEMS.map((item) => (
          <a key={item.href} href={item.href} className={styles.item} title={item.label} aria-label={item.label}>
            {item.svg}
          </a>
        ))}
        {PAGE_ITEMS.map((item) => (
          <a
            key={item.page}
            href={item.href}
            className={`${styles.item} ${page === item.page ? styles.active : ''}`}
            title={item.label}
            aria-label={item.label}
            aria-current={page === item.page ? 'page' : undefined}
          >
            {item.svg}
          </a>
        ))}
        <a
          href="#/documents"
          className={`${styles.item} ${page === 'documents' ? styles.active : ''}`}
          title="Documents"
          aria-label="Documents"
          aria-current={page === 'documents' ? 'page' : undefined}
        >
          {DOCS_ICON}
        </a>
      </nav>
    </aside>
  );
}
