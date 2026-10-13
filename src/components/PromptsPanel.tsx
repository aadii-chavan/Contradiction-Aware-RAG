import { useEffect, useMemo, useState } from 'react';
import { listDocs } from '../api';
import type { Doc, PromptSet } from '../types';
import styles from './PromptsPanel.module.css';

type Tab = 'baseline' | 'aware' | 'questions';

interface PromptsPanelProps {
  defaults: PromptSet | null;
  prompts: PromptSet | null;
  onChange: (prompts: PromptSet) => void;
  /** Loads a document's sample question into the query bar. */
  onPickQuestion: (question: string) => void;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'questions', label: 'Document questions' },
  { key: 'baseline', label: 'Baseline prompt' },
  { key: 'aware', label: 'Conflict-aware prompt' },
];

export default function PromptsPanel({ defaults, prompts, onChange, onPickQuestion }: PromptsPanelProps) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('questions');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open && tab === 'questions') listDocs().then(setDocs).catch(() => setDocs([]));
  }, [open, tab]);

  const customised = Boolean(defaults && prompts && (prompts.baseline !== defaults.baseline || prompts.aware !== defaults.aware));

  const withQuestion = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => d.prompt && (!q || `${d.id} ${d.title} ${d.prompt}`.toLowerCase().includes(q)));
  }, [docs, search]);
  const missing = docs.filter((d) => !d.prompt).length;

  return (
    <section className={styles.section}>
      <button type="button" className={styles.toggle} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={styles.toggleTitle}>Prompts &amp; documents</span>
        {customised && <span className={styles.badge}>customised</span>}
        <span className={styles.chevron}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <div className={styles.tabs} role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab !== 'questions' && defaults && prompts && (
            <>
              <textarea
                className={styles.textarea}
                rows={tab === 'aware' ? 16 : 6}
                value={prompts[tab]}
                onChange={(e) => onChange({ ...prompts, [tab]: e.target.value })}
                aria-label={tab === 'aware' ? 'Conflict-aware system prompt' : 'Baseline system prompt'}
                spellCheck={false}
              />
              <div className={styles.row}>
                <span className={styles.hint}>
                  {tab === 'aware'
                    ? 'Keep the JSON response format (conflict, conflict_type, conflicting, answer) or the conflict cards will not render.'
                    : 'System prompt sent with the retrieved context. Applies to the next run.'}
                </span>
                <button
                  type="button"
                  className={styles.reset}
                  disabled={prompts[tab] === defaults[tab]}
                  onClick={() => onChange({ ...prompts, [tab]: defaults[tab] })}
                >
                  Reset to default
                </button>
              </div>
            </>
          )}

          {tab === 'questions' && (
            <>
              <div className={styles.row}>
                <input
                  className={styles.search}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search questions"
                  aria-label="Search questions"
                />
                <span className={styles.hint}>{withQuestion.length} questions</span>
              </div>
              {missing > 0 && (
                <div className={styles.hint}>
                  {missing} documents have no question yet. Generate them from the <a href="#/documents">Documents page</a>.
                </div>
              )}
              <div className={styles.list}>
                {withQuestion.map((d) => (
                  <button key={d.id} type="button" className={styles.q} onClick={() => onPickQuestion(d.prompt!)}>
                    <span className={styles.id}>{d.id}</span>
                    <span className={styles.qText}>{d.prompt}</span>
                  </button>
                ))}
                {docs.length > 0 && withQuestion.length === 0 && <div className={styles.hint}>No questions match.</div>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
