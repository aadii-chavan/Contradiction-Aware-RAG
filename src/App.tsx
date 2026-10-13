import { useEffect, useRef, useState } from 'react';
import { fetchDefaultPrompts, fetchInfo, runQuery } from './api';
import type { PromptSet, QueryResult, ServerInfo } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import PromptsPanel from './components/PromptsPanel';
import QueryBar from './components/QueryBar';
import AnswerPanels, { type BannerStyle } from './components/AnswerPanels';
import RetrievedContext from './components/RetrievedContext';
import DocumentsPage from './components/DocumentsPage';
import Evaluation from './components/Evaluation';
import styles from './App.module.css';

interface AppProps {
  bannerStyle?: BannerStyle;
  showScoreBars?: boolean;
}

const PROMPTS_KEY = 'rag.prompts';

function loadSavedPrompts(defaults: PromptSet): PromptSet {
  try {
    const saved = JSON.parse(localStorage.getItem(PROMPTS_KEY) ?? 'null') as Partial<PromptSet> | null;
    return { baseline: saved?.baseline || defaults.baseline, aware: saved?.aware || defaults.aware };
  } catch {
    return defaults;
  }
}

const pageFromHash = () => (window.location.hash.startsWith('#/documents') ? 'documents' : 'dashboard');

export default function App({
  bannerStyle = 'solid',
  showScoreBars = true,
}: AppProps) {
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [defaults, setDefaults] = useState<PromptSet | null>(null);
  const [prompts, setPrompts] = useState<PromptSet | null>(null);
  const [page, setPage] = useState<'dashboard' | 'documents'>(pageFromHash);
  // Guards against an older in-flight request overwriting a newer one.
  const requestId = useRef(0);

  const refreshInfo = () => fetchInfo().then(setInfo).catch(() => setInfo(null));

  useEffect(() => {
    refreshInfo();
    fetchDefaultPrompts()
      .then((d) => {
        setDefaults(d);
        setPrompts(loadSavedPrompts(d));
      })
      .catch(() => undefined);
  }, []);

  const changePrompts = (next: PromptSet) => {
    setPrompts(next);
    try {
      localStorage.setItem(PROMPTS_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable; edits still apply for this session.
    }
  };

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Anchors for dashboard sections only exist once that page is mounted, so scroll after switching.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (page === 'dashboard' && id && !id.startsWith('/')) document.getElementById(id)?.scrollIntoView();
  }, [page]);

  const run = async () => {
    if (!query.trim()) return;
    const id = ++requestId.current;
    setRunning(true);
    setError(null);
    try {
      const next = await runQuery(query, prompts ?? undefined);
      if (id === requestId.current) setResult(next);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (id === requestId.current) setRunning(false);
    }
  };

  return (
    <div className={styles.shell}>
      <Sidebar page={page} />
      <main className={styles.page}>
      {page === 'documents' ? (
        <DocumentsPage onChanged={refreshInfo} />
      ) : (
        <>
      <Header info={info} />
      <QueryBar
        query={query}
        onQueryChange={setQuery}
        onRun={run}
        running={running}
      />
      <PromptsPanel defaults={defaults} prompts={prompts} onChange={changePrompts} onPickQuestion={setQuery} />
      {info && !info.llmConfigured && (
        <div className={styles.notice}>
          LLM not configured. Set GEMINI_API_KEY in <code>.env</code>, then
          restart <code>npm run dev</code>.
        </div>
      )}
      {error && <div className={styles.error} role="alert">{error}</div>}
      <AnswerPanels result={result} bannerStyle={bannerStyle} loading={running} />
      <RetrievedContext result={result} showScoreBars={showScoreBars} />
      <Evaluation />
        </>
      )}
      </main>
    </div>
  );
}
