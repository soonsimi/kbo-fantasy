import { useMemo, useState } from 'react';
import { computeMonth, computeSeason, hasData } from '../domain/season';
import { monthLabel, seasonMonthKeys } from '../domain/types';
import type { LeagueSnapshot, MonthKey } from '../domain/types';
import { MonthlyTable } from './MonthlyTable';
import { formatPoints } from './format';

interface Props {
  snapshot: LeagueSnapshot;
}

type View = 'season' | MonthKey;

export function StandingsPanel({ snapshot }: Props) {
  const season = useMemo(() => computeSeason(snapshot), [snapshot]);
  const [view, setView] = useState<View>('season');

  const allMonths = seasonMonthKeys(snapshot.season);

  if (snapshot.managers.length === 0) {
    return (
      <p className="empty">
        참가자가 없습니다. <strong>리그 설정</strong> 탭에서 참여 인원을 먼저 등록하세요.
      </p>
    );
  }

  const monthStandings = view === 'season' ? null : computeMonth(snapshot, view);

  return (
    <div className="standings">
      <div className="view-switch">
        <button
          type="button"
          className={view === 'season' ? 'active' : ''}
          onClick={() => setView('season')}
        >
          시즌 종합
        </button>
        {allMonths.map((month) => {
          const filled = hasData(snapshot.months[month]);
          return (
            <button
              type="button"
              key={month}
              className={view === month ? 'active' : ''}
              onClick={() => setView(month)}
              title={filled ? `${monthLabel(month)} 순위` : `${monthLabel(month)} 기록 없음`}
            >
              {monthLabel(month)}
              {/* 장식용 표식이라 접근성 이름에 섞이지 않게 숨긴다 */}
              {!filled && <span className="no-data" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {view === 'season' ? (
        season.scoredMonths.length === 0 ? (
          <p className="empty">
            아직 기록이 없습니다. <strong>스탯 불러오기</strong> 탭에서 월별 기록을 넣으세요.
          </p>
        ) : (
          <>
            <p className="hint">
              시즌 종합 순위는 <strong>월별 순위의 합산</strong>입니다. 합이 작을수록 상위.
              <br />
              산정에 포함된 달: {season.scoredMonths.map(monthLabel).join(', ')} (
              {season.scoredMonths.length}개월)
            </p>

            <div className="table-scroll">
              <table className="standings-table">
                <thead>
                  <tr>
                    <th className="col-rank">순위</th>
                    <th className="col-manager">참가자</th>
                    <th className="col-total">순위 합</th>
                    {season.scoredMonths.map((month) => (
                      <th key={month} className="col-cat">
                        {monthLabel(month)}
                      </th>
                    ))}
                    <th className="col-cat">총점 합</th>
                  </tr>
                </thead>
                <tbody>
                  {season.rows.map((row) => (
                    <tr key={row.managerId}>
                      <td className="col-rank">{row.rank}</td>
                      <td className="col-manager">{row.managerName}</td>
                      <td className="col-total">{row.rankSum}</td>
                      {season.scoredMonths.map((month) => {
                        const rank = row.monthlyRanks[month];
                        return (
                          <td key={month} className={`col-cat${rank === 1 ? ' top' : ''}`}>
                            <span className="cat-value">{rank ?? '–'}위</span>
                            <span className="cat-points">
                              {row.monthlyPoints[month] !== undefined
                                ? `${formatPoints(row.monthlyPoints[month])}점`
                                : '–'}
                            </span>
                          </td>
                        );
                      })}
                      <td className="col-cat">
                        <span className="cat-value">{formatPoints(row.pointsSum)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="legend">
              각 월 칸의 위쪽은 그 달 순위, 아래쪽은 그 달 로토서리 총점입니다. 종합 순위는 위쪽
              값들의 합으로만 정합니다. 총점 합은 참고용입니다.
            </p>
          </>
        )
      ) : !hasData(snapshot.months[view]) ? (
        <p className="empty">
          {monthLabel(view)} 기록이 없습니다. <strong>스탯 불러오기</strong> 탭에서{' '}
          {monthLabel(view)}을 선택해 넣으세요.
        </p>
      ) : (
        <>
          <h3 className="month-title">
            {monthLabel(view)} 순위
            {snapshot.months[view]?.updatedAt && (
              <span className="updated">
                갱신 {new Date(snapshot.months[view].updatedAt!).toLocaleString('ko-KR')}
              </span>
            )}
          </h3>
          <MonthlyTable standings={monthStandings!} />
        </>
      )}
    </div>
  );
}
