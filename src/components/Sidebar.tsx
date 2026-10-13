import type { ReactNode } from 'react';
import styles from './Sidebar.module.css';

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const ITEMS = [
  { href: '#query', label: 'Query', svg: icon(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>) },
  { href: '#answers', label: 'Answers', svg: icon(<><rect x="4" y="5" width="7" height="14" rx="2" /><rect x="13" y="5" width="7" height="14" rx="2" /></>) },
  { href: '#context', label: 'Retrieved context', svg: icon(<><path d="M5 6h14M5 12h14M5 18h9" /></>) },
  { href: '#evaluation', label: 'Evaluation', svg: icon(<><path d="M5 20V10M12 20V4M19 20v-7" /></>) },
];

export default function Sidebar() {
  return (
    <aside className={styles.rail}>
      <div className={styles.logo} aria-hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M12 2.5c.7 4.8 4.7 8.8 9.5 9.5-4.8.7-8.8 4.7-9.5 9.5-.7-4.8-4.7-8.8-9.5-9.5 4.8-.7 8.8-4.7 9.5-9.5Z" />
        </svg>
      </div>
      <nav className={styles.nav}>
        {ITEMS.map((item) => (
          <a key={item.href} href={item.href} className={styles.item} title={item.label} aria-label={item.label}>
            {item.svg}
          </a>
        ))}
      </nav>
    </aside>
  );
}
