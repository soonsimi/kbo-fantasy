import { useState } from 'react';
import { DraftPanel } from './components/DraftPanel';
import { ImportPanel } from './components/ImportPanel';
import { LeagueSetupPanel } from './components/LeagueSetupPanel';
import { StandingsPanel } from './components/StandingsPanel';
import { scoredMonthKeys } from './domain/season';
import { useLeague } from './useLeague';
import './App.css';

const SEASON = 2026;

type Tab = 'standings' | 'setup' | 'draft' | 'import';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'standings', label: '순위표' },
  { key: 'setup', label: '리그 설정' },
  { key: 'draft', label: '드래프트 결과' },
  { key: 'import', label: '스탯 불러오기' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('standings');
  const { snapshot, storageLabel, loading, saving, error, update } = useLeague(SEASON);

  const scoredMonths = scoredMonthKeys(snapshot);

  return (
    <div className="app">
      <header>
        <div>
          <h1>KBO 판타지 리그</h1>
          <p className="subtitle">
            {SEASON} 시즌 · 월별 로토서리 · 참가자 {snapshot.managers.length}명 · 기록{' '}
            {scoredMonths.length}개월
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
          <StandingsPanel snapshot={snapshot} />
        ) : tab === 'setup' ? (
          <LeagueSetupPanel snapshot={snapshot} update={update} />
        ) : tab === 'draft' ? (
          <DraftPanel snapshot={snapshot} update={update} />
        ) : (
          <ImportPanel snapshot={snapshot} update={update} />
        )}
      </main>
    </div>
  );
}
