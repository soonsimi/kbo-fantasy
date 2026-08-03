import { DEFAULT_CATEGORIES } from '../domain/categories';
import type { Standings } from '../domain/rotisserie';
import { formatPoints } from './format';

interface Props {
  standings: Standings;
}

/** 한 달의 부문별 순위표 */
export function MonthlyTable({ standings }: Props) {
  const hittingCats = DEFAULT_CATEGORIES.filter((c) => c.group === 'hitting');
  const pitchingCats = DEFAULT_CATEGORIES.filter((c) => c.group === 'pitching');
  const orderedCats = [...hittingCats, ...pitchingCats];
  const maxTotal = DEFAULT_CATEGORIES.length * standings.maxPointsPerCategory;

  return (
    <>
      <p className="hint">
        부문마다 1위 {standings.maxPointsPerCategory}점 ~ 최하위 1점. 동점은 균등 배분. 이 달 만점은{' '}
        {maxTotal}점입니다.
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
              <th colSpan={hittingCats.length} className="group-head">
                타자
              </th>
              <th colSpan={pitchingCats.length} className="group-head">
                투수
              </th>
            </tr>
            <tr>
              {orderedCats.map((c) => (
                <th key={c.key} title={c.description} className="col-cat">
                  {c.label}
                  {c.lowerIsBetter && <span className="lower-mark">−</span>}
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
                {orderedCats.map((c) => {
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
        각 칸의 위쪽은 부문 성적, 아래쪽은 그 부문에서 받은 점수입니다. − 는 적을수록 상위인 부문.
      </p>
    </>
  );
}
