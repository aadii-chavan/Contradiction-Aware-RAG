import { useEffect, useRef, useState } from 'react';
import { PRESETS, type PresetKey } from './data/presets';
import { fetchInfo, runQuery } from './api';
import type { QueryResult, ServerInfo } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import QueryBar from './components/QueryBar';
import AnswerPanels, { type BannerStyle } from './components/AnswerPanels';
import RetrievedContext from './components/RetrievedContext';
import Evaluation from './components/Evaluation';
import styles from './App.module.css';

interface AppProps {
  defaultPreset?: PresetKey;
  bannerStyle?: BannerStyle;
  showScoreBars?: boolean;
}

export default function App({
  defaultPreset = 'direct',
  bannerStyle = 'solid',
  showScoreBars = true,
}: AppProps) {
  const [presetKey, setPresetKey] = useState<PresetKey>(defaultPreset);
  const [query, setQuery] = useState(PRESETS[defaultPreset].query);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  // Guards against an older in-flight request overwriting a newer one.
  const requestId = useRef(0);

  useEffect(() => {
    fetchInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  const selectPreset = (key: PresetKey) => {
    setPresetKey(key);
    setQuery(PRESETS[key].query);
  };

  const run = async () => {
    if (!query.trim()) return;
    const id = ++requestId.current;
    setRunning(true);
    setError(null);
    try {
      const next = await runQuery(query);
      if (id === requestId.current) setResult(next);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (id === requestId.current) setRunning(false);
    }
  };

  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.page}>
      <Header info={info} />
      <QueryBar
        query={query}
        onQueryChange={setQuery}
        onRun={run}
        running={running}
        activePreset={presetKey}
        onSelectPreset={selectPreset}
      />
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
      </main>
    </div>
  );
}
