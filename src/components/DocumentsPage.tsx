import { useEffect, useMemo, useState } from 'react';
import { createDoc, deleteDoc, generateQuestions, listDocs, updateDoc } from '../api';
import type { Doc, DocInput } from '../types';
import styles from './DocumentsPage.module.css';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY: DocInput = { title: '', date: today(), text: '', prompt: '' };

const toDraft = (d: Doc): DocInput => ({ title: d.title, date: d.date, text: d.text, prompt: d.prompt ?? '' });

/** `null` selection means the editor is creating a new document. */
export default function DocumentsPage({ onChanged }: { onChanged: () => void }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<DocInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    listDocs()
      .then((all) => {
        setDocs(all);
        // Deep link from the search tab: #/documents/DOC-04
        const target = all.find((d) => d.id === decodeURIComponent(window.location.hash.split('/')[2] ?? ''));
        if (target) {
          setSelected(target.id);
          setDraft(toDraft(target));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const current = docs.find((d) => d.id === selected) ?? null;
  const dirty = current
    ? JSON.stringify(draft) !== JSON.stringify(toDraft(current))
    : draft.title !== '' || draft.text !== '' || draft.prompt !== '';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => `${d.id} ${d.title} ${d.text}`.toLowerCase().includes(q));
  }, [docs, search]);

  const confirmDiscard = () => !dirty || window.confirm('Discard unsaved changes?');

  const select = (doc: Doc) => {
    if (doc.id === selected || !confirmDiscard()) return;
    setSelected(doc.id);
    setDraft(toDraft(doc));
    setError(null);
    setNotice(null);
  };

  const startNew = () => {
    if (!confirmDiscard()) return;
    setSelected(null);
    setDraft({ ...EMPTY, date: today() });
    setError(null);
    setNotice(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (current) {
        const saved = await updateDoc(current.id, draft);
        setDocs((all) => all.map((d) => (d.id === saved.id ? saved : d)));
        setDraft(toDraft(saved));
        setNotice(`Saved ${saved.id}.`);
      } else {
        const created = await createDoc(draft);
        setDocs((all) => [...all, created]);
        setSelected(created.id);
        setDraft(toDraft(created));
        setNotice(`Created ${created.id}.`);
      }
      onChanged();
    });

  const remove = () =>
    run(async () => {
      if (!current || !window.confirm(`Delete ${current.id} "${current.title}"? This cannot be undone.`)) return;
      await deleteDoc(current.id);
      setDocs((all) => all.filter((d) => d.id !== current.id));
      setSelected(null);
      setDraft({ ...EMPTY, date: today() });
      setNotice(`Deleted ${current.id}.`);
      onChanged();
    });

  const generate = () =>
    run(async () => {
      const { generated } = await generateQuestions();
      setDocs(await listDocs());
      setNotice(generated ? `Generated ${generated} questions.` : 'Every document already has a question.');
      onChanged();
    });

  const field = (key: keyof DocInput) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Documents</h1>
          <div className={styles.subtitle}>
            The corpus the retriever searches. Edits are saved to <code>data/corpus.json</code> and apply to the next
            query immediately.
          </div>
        </div>
        <div className={styles.headActions}>
          <button type="button" className={styles.secondary} onClick={generate} disabled={busy}>
            {busy ? 'Working…' : 'Generate missing questions'}
          </button>
          <button type="button" className={styles.primary} onClick={startNew}>
            + New document
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        <section className={styles.list}>
          <div className={styles.listHead}>
            <input
              className={styles.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents"
              aria-label="Search documents"
            />
            <span className={styles.count}>
              {filtered.length === docs.length ? `${docs.length} documents` : `${filtered.length} of ${docs.length}`}
            </span>
          </div>
          <div className={styles.items}>
            {loading && <div className={styles.empty}>Loading…</div>}
            {!loading && filtered.length === 0 && <div className={styles.empty}>No documents match.</div>}
            {filtered.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`${styles.item} ${d.id === selected ? styles.itemActive : ''}`}
                onClick={() => select(d)}
              >
                <div className={styles.itemHead}>
                  <span className={styles.id}>{d.id}</span>
                  <span className={styles.date}>{d.date}</span>
                </div>
                <div className={styles.itemTitle}>{d.title}</div>
                <div className={styles.snippet}>{d.text}</div>
                {d.prompt && <div className={styles.question}>Q: {d.prompt}</div>}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.editor}>
          <div className={styles.editorHead}>
            <h2 className={styles.editorTitle}>{current ? `Edit ${current.id}` : 'New document'}</h2>
            {dirty && <span className={styles.dirty}>Unsaved changes</span>}
          </div>
          <label className={styles.label}>
            Title
            <input className={styles.input} value={draft.title} onChange={field('title')} />
          </label>
          <label className={styles.label}>
            Date
            <input className={styles.input} type="date" value={draft.date} onChange={field('date')} />
          </label>
          <label className={styles.label}>
            Text
            <textarea className={styles.textarea} rows={10} value={draft.text} onChange={field('text')} />
          </label>
          <label className={styles.label}>
            Sample question
            <input
              className={styles.input}
              value={draft.prompt ?? ''}
              onChange={field('prompt')}
              placeholder="A question this document answers"
            />
          </label>
          {error && <div className={styles.error} role="alert">{error}</div>}
          {notice && <div className={styles.ok} role="status">{notice}</div>}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={save} disabled={busy || !dirty}>
              {busy ? 'Saving…' : current ? 'Save changes' : 'Create document'}
            </button>
            {current && (
              <button type="button" className={styles.danger} onClick={remove} disabled={busy}>
                Delete
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
