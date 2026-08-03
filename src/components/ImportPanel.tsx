import { useMemo, useState } from 'react';
import { fieldLabel, statFieldsFor } from '../import/columns';
import { applyImport } from '../import/applyImport';
import type { ImportMode } from '../import/applyImport';
import { parseStatTable } from '../import/parseStatTable';
import type { ParseResult } from '../import/parseStatTable';
import { formatInnings } from '../domain/innings';
import { currentSeasonMonth } from '../domain/season';
import { monthLabel, seasonMonthKeys } from '../domain/types';
import type { LeagueSnapshot, MonthKey, PlayerRole, StatField } from '../domain/types';

interface Props {
  snapshot: LeagueSnapshot;
  update: (mutate: (current: LeagueSnapshot) => LeagueSnapshot) => void;
}

/**
 * 필요한 항목이 한 화면에 다 없다. 어느 페이지에서 무엇을 가져오는지 안내한다.
 * KBO 기록실은 타자 기본기록1/2로 나뉘어 있다.
 */
const SOURCES: Record<PlayerRole, Array<{ title: string; url: string; gives: string }>> = {
  hitter: [
    {
      title: '타자 기본기록 1',
      url: 'https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx',
      gives: 'R, H, HR, RBI, SB',
    },
    {
      title: '타자 기본기록 2',
      url: 'https://www.koreabaseball.com/Record/Player/HitterBasic/Basic2.aspx',
      gives: 'BB, SO, GDP',
    },
  ],
  pitcher: [
    {
      title: '투수 기본기록 1',
      url: 'https://www.koreabaseball.com/Record/Player/PitcherBasic/Basic1.aspx',
      gives: 'W, L, SV, HLD, IP, H, BB, SO',
    },
  ],
};

export function ImportPanel({ snapshot, update }: Props) {
  const months = seasonMonthKeys(snapshot.season);
  const [month, setMonth] = useState<MonthKey>(() => currentSeasonMonth(snapshot, new Date()));
  const [mode, setMode] = useState<ImportMode>('monthly');
  const [role, setRole] = useState<PlayerRole>('hitter');
  const [text, setText] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const [applyWarnings, setApplyWarnings] = useState<string[]>([]);

  const result: ParseResult | null = useMemo(
    () => (text.trim() === '' ? null : parseStatTable(text, role)),
    [text, role],
  );

  const canApply = result !== null && result.fatal === null && result.rows.length > 0;

  const handleFile = async (file: File) => {
    setText(await file.text());
    setApplied(null);
  };

  const apply = () => {
    if (!result || !canApply) return;

    let warnings: string[] = [];
    update((current) => {
      const outcome = applyImport(current, result, { month, mode, replaceExisting });
      warnings = outcome.warnings;
      return outcome.snapshot;
    });

    const filled = result.providedFields.map((f) => fieldLabel(f, role)).join(', ');
    setApplied(
      `${monthLabel(month)} ${role === 'hitter' ? '타자' : '투수'} 기록 ${result.rows.length}명에 ${filled} 을(를) 반영했습니다.`,
    );
    setApplyWarnings(warnings);
    setText('');
  };

  const needed = statFieldsFor(role);
  const monthStats = snapshot.months[month];
  const filledSoFar = new Set<StatField>(
    role === 'hitter'
      ? (monthStats?.importedFields.hitting ?? [])
      : (monthStats?.importedFields.pitching ?? []),
  );
  const stillMissing = needed.filter((f) => !filledSoFar.has(f));

  return (
    <div className="import">
      <section className="card">
        <h2>스탯 불러오기</h2>
        <p className="hint">
          KBO 공식 사이트와 스탯티즈는 robots.txt에서 봇 접근을 전면 차단하고 있어 자동 수집을
          하지 않습니다. 브라우저에서 표를 직접 선택·복사해 아래에 붙여넣으세요.
        </p>

        <div className="field">
          <span className="field-label">어느 달의 기록인가요?</span>
          <div className="month-picker">
            {months.map((m) => {
              const filled =
                (snapshot.months[m]?.importedFields.hitting.length ?? 0) > 0 ||
                (snapshot.months[m]?.importedFields.pitching.length ?? 0) > 0;
              return (
                <button
                  type="button"
                  key={m}
                  className={m === month ? 'active' : ''}
                  title={filled ? `${monthLabel(m)} 기록 있음` : `${monthLabel(m)} 기록 없음`}
                  onClick={() => {
                    setMonth(m);
                    setApplied(null);
                  }}
                >
                  {monthLabel(m)}
                  {/* 장식용 표식이라 접근성 이름에 섞이지 않게 숨긴다 */}
                  {filled && <span className="filled-dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <span className="field-label">붙여넣을 표가 어떤 기록인가요?</span>
          <div className="row role-select">
            <label>
              <input
                type="radio"
                checked={mode === 'monthly'}
                onChange={() => {
                  setMode('monthly');
                  setApplied(null);
                }}
              />
              {monthLabel(month)} 한 달치 기록
            </label>
            <label>
              <input
                type="radio"
                checked={mode === 'cumulative'}
                onChange={() => {
                  setMode('cumulative');
                  setApplied(null);
                }}
              />
              {monthLabel(month)}까지의 시즌 누적
            </label>
          </div>
          <p className="hint">
            {mode === 'monthly'
              ? '표의 값을 그대로 이 달 기록으로 저장합니다.'
              : `이전 달들의 합을 빼서 ${monthLabel(month)} 기록을 계산합니다. 누적 표만 구할 수 있을 때 쓰세요. 이전 달 기록이 먼저 들어와 있어야 정확합니다.`}
          </p>
        </div>

        <div className="field">
          <span className="field-label">타자 / 투수</span>
          <div className="row role-select">
            <label>
              <input
                type="radio"
                checked={role === 'hitter'}
                onChange={() => {
                  setRole('hitter');
                  setApplied(null);
                }}
              />
              타자 표
            </label>
            <label>
              <input
                type="radio"
                checked={role === 'pitcher'}
                onChange={() => {
                  setRole('pitcher');
                  setApplied(null);
                }}
              />
              투수 표
            </label>
          </div>
        </div>

        <div className="sources">
          <p className="hint">
            {role === 'hitter'
              ? '타자 항목은 한 페이지에 다 없습니다. 두 표를 차례로 붙여넣으면 열이 하나씩 채워집니다.'
              : '투수 항목은 기본기록 1에 다 있습니다.'}
          </p>
          <ul>
            {SOURCES[role].map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer noopener">
                  {source.title}
                </a>
                <span className="gives">{source.gives}</span>
              </li>
            ))}
          </ul>
        </div>

        <textarea
          value={text}
          rows={10}
          placeholder="표 전체(머리글 포함)를 복사해 붙여넣으세요. 탭 구분 또는 CSV 모두 됩니다."
          onChange={(e) => {
            setText(e.target.value);
            setApplied(null);
          }}
        />

        <div className="row">
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
            />
            {monthLabel(month)}의 기존 {role === 'hitter' ? '타자' : '투수'} 기록을 지우고 시작
          </label>
        </div>
      </section>

      {applied && <p className="ok">{applied}</p>}

      {applyWarnings.length > 0 && (
        <div className="alert warn">
          <ul>
            {applyWarnings.slice(0, 10).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {applyWarnings.length > 10 && <p>… 외 {applyWarnings.length - 10}건</p>}
        </div>
      )}

      {result?.fatal && <p className="alert error">{result.fatal}</p>}

      {result && !result.fatal && (
        <section className="card">
          <h3>미리보기</h3>

          <p className="hint">
            인식한 선수 {result.rows.length}명
            <br />
            이 표에서 채울 항목:{' '}
            <strong>{result.providedFields.map((f) => fieldLabel(f, role)).join(', ')}</strong>
            {result.absentFields.length > 0 && (
              <>
                <br />
                이 표에 없는 항목: {result.absentFields.map((f) => fieldLabel(f, role)).join(', ')}
                {' '}— 다른 표에서 따로 넣으세요
              </>
            )}
            {result.unmappedHeaders.length > 0 && (
              <>
                <br />
                무시한 열: {result.unmappedHeaders.join(', ')}
              </>
            )}
          </p>

          {result.warnings.length > 0 && (
            <div className="alert warn">
              <ul>
                {result.warnings.slice(0, 10).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              {result.warnings.length > 10 && <p>… 외 {result.warnings.length - 10}건</p>}
            </div>
          )}

          {result.rows.length > 0 && (
            <div className="table-scroll">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>선수</th>
                    <th>팀</th>
                    {result.providedFields.map((f) => (
                      <th key={f}>{fieldLabel(f, role)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 8).map((row, i) => (
                    <tr key={`${row.name}-${i}`}>
                      <td>{row.name}</td>
                      <td>{row.kboTeam ?? '-'}</td>
                      {result.providedFields.map((f) => {
                        const value = row.stats[f];
                        return (
                          <td key={f}>
                            {value === undefined
                              ? '–'
                              : f === 'ip'
                                ? formatInnings(value)
                                : value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > 8 && (
                <p className="hint">앞 8명만 표시했습니다 (전체 {result.rows.length}명).</p>
              )}
            </div>
          )}

          <button type="button" onClick={apply} disabled={!canApply}>
            {monthLabel(month)}에 {result.rows.length}명 반영하기
          </button>
        </section>
      )}

      <section className="card">
        <h3>{monthLabel(month)} 현황</h3>
        <p className="hint">
          타자 {Object.keys(monthStats?.hitting ?? {}).length}명 / 투수{' '}
          {Object.keys(monthStats?.pitching ?? {}).length}명
          {monthStats?.updatedAt && (
            <>
              <br />
              마지막 갱신: {new Date(monthStats.updatedAt).toLocaleString('ko-KR')}
            </>
          )}
        </p>
        {stillMissing.length > 0 ? (
          <p className="alert warn">
            {monthLabel(month)} {role === 'hitter' ? '타자' : '투수'} 부문 중 아직 안 넣은 항목:{' '}
            <strong>{stillMissing.map((f) => fieldLabel(f, role)).join(', ')}</strong>
            <br />
            해당 부문은 전원 0으로 계산되어 이 달 순위가 왜곡됩니다.
          </p>
        ) : (
          <p className="ok">
            {monthLabel(month)} {role === 'hitter' ? '타자' : '투수'} 부문 항목이 모두 채워졌습니다.
          </p>
        )}
      </section>
    </div>
  );
}
