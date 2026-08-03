import { useMemo } from 'react';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import { computeStandings } from '../domain/rotisserie';
import type { LeagueSnapshot } from '../domain/types';

function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

interface Props {
  snapshot: LeagueSnapshot;
}

export function StandingsTable({ snapshot }: Props) {
  const standings = useMemo(() => computeStandings(snapshot), [snapshot]);

  if (standings.rows.length === 0) {
    return (
      <p className="empty">
        참가자가 없습니다. <strong>참가자 · 로스터</strong> 탭에서 먼저 참가자를 등록하세요.
      </p>
    );
  }

  const hittingCats = DEFAULT_CATEGORIES.filter((c) => c.group === 'hitting');
  const pitchingCats = DEFAULT_CATEGORIES.filter((c) => c.group === 'pitching');
  const maxTotal = DEFAULT_CATEGORIES.length * standings.maxPointsPerCategory;

  return (
    <div className="standings">
      <p className="hint">
        부문마다 1위 {standings.maxPointsPerCategory}점 ~ 최하위 1점. 동점은 균등 배분.
        만점은 {maxTotal}점입니다.
      </p>

      <div className="table-scroll">
        <table className="standings-table">
          <thead>
            <tr>
              <th rowSpan={2} className="col-rank">
                순위
              </th>
              <th rowSpan={2} className="col-manager">
                참가자
              </th>
              <th rowSpan={2} className="col-total">
                총점
              </th>
              <th colSpan={hittingCats.length} className="group-head hitting">
                타격
              </th>
              <th colSpan={pitchingCats.length} className="group-head pitching">
                투구
              </th>
            </tr>
            <tr>
              {[...hittingCats, ...pitchingCats].map((c) => (
                <th key={c.key} title={c.description} className="col-cat">
                  {c.label}
                  {c.lowerIsBetter && <span className="lower-mark">↓</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.rows.map((row) => (
              <tr key={row.managerId}>
                <td className="col-rank">{row.rank}</td>
                <td className="col-manager">{row.managerName}</td>
                <td className="col-total">{formatPoints(row.totalPoints)}</td>
                {[...hittingCats, ...pitchingCats].map((c) => {
                  const cell = row.cells[c.key];
                  const isTop = cell && cell.rank === 1;
                  return (
                    <td key={c.key} className={`col-cat${isTop ? ' top' : ''}`}>
                      <span className="cat-value">
                        {cell?.value === null || cell === undefined ? '–' : c.format(cell.value)}
                      </span>
                      <span className="cat-points">{cell ? formatPoints(cell.points) : '–'}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="legend">
        각 칸의 위쪽은 부문 성적, 아래쪽은 그 부문에서 받은 점수입니다. ↓ 는 낮을수록 좋은 부문.
      </p>
    </div>
  );
}
