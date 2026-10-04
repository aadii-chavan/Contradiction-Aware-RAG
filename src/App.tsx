import { useEffect, useRef, useState } from 'react';
import { PRESETS, type PresetKey } from './data/presets';
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

const RUN_DURATION_MS = 900;

export default function App({
  defaultPreset = 'direct',
  bannerStyle = 'solid',
  showScoreBars = true,
}: AppProps) {
  const [presetKey, setPresetKey] = useState<PresetKey>(defaultPreset);
  // null means "show the preset's own query"; editing the input overrides it.
  const [query, setQuery] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const preset = PRESETS[presetKey];

  const selectPreset = (key: PresetKey) => {
    setPresetKey(key);
    setQuery(null);
  };

  const run = () => {
    setRunning(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRunning(false), RUN_DURATION_MS);
  };

  return (
    <div className={styles.page}>
      <Header />
      <QueryBar
        query={query ?? preset.query}
        onQueryChange={setQuery}
        onRun={run}
        running={running}
        activePreset={presetKey}
        onSelectPreset={selectPreset}
      />
      <AnswerPanels preset={preset} bannerStyle={bannerStyle} dimmed={running} />
      <RetrievedContext preset={preset} showScoreBars={showScoreBars} />
      <Evaluation />
    </div>
  );
}
