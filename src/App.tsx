import { useState } from 'react';
import { ImportPanel } from './components/ImportPanel';
import { ManagersPanel } from './components/ManagersPanel';
import { StandingsTable } from './components/StandingsTable';
import { useLeague } from './useLeague';
import './App.css';

const SEASON = 2026;

type Tab = 'standings' | 'managers' | 'import';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'standings', label: '순위표' },
  { key: 'managers', label: '참가자 · 로스터' },
  { key: 'import', label: '스탯 불러오기' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('standings');
  const { snapshot, storageLabel, loading, saving, error, update } = useLeague(SEASON);

  return (
    <div className="app">
      <header>
        <div>
          <h1>KBO 판타지 리그</h1>
          <p className="subtitle">
            {SEASON} 시즌 · 로토서리 누적 점수제 · 참가자 {snapshot.managers.length}명
          </p>
        </div>
        <div className="status">
          <span className="storage">{storageLabel}</span>
          {saving && <span className="saving">저장 중…</span>}
        </div>
      </header>

      {error && <p className="alert error">{error}</p>}

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {loading ? (
          <p className="empty">불러오는 중…</p>
        ) : tab === 'standings' ? (
          <StandingsTable snapshot={snapshot} />
        ) : tab === 'managers' ? (
          <ManagersPanel snapshot={snapshot} update={update} />
        ) : (
          <ImportPanel snapshot={snapshot} update={update} />
        )}
      </main>
    </div>
  );
}
