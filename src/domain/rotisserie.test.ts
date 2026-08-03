import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from './categories';
import type { Category } from './categories';
import { aggregateRoster, computeStandings, scoreCategory } from './rotisserie';
import { EMPTY_HITTING, EMPTY_PITCHING, emptySnapshot } from './types';
import type { HittingLine, LeagueSnapshot, PitchingLine } from './types';

const categoryByKey = (key: string): Category => {
  const found = DEFAULT_CATEGORIES.find((c) => c.key === key);
  if (!found) throw new Error(`unknown category: ${key}`);
  return found;
};

describe('scoreCategory', () => {
  const hr = categoryByKey('hr');

  it('1위에게 N점, 최하위에게 1점을 준다', () => {
    const result = scoreCategory(
      [
        { managerId: 'a', value: 10 },
        { managerId: 'b', value: 8 },
        { managerId: 'c', value: 5 },
        { managerId: 'd', value: 2 },
      ],
      hr,
    );

    expect(result.a).toMatchObject({ points: 4, rank: 1 });
    expect(result.b).toMatchObject({ points: 3, rank: 2 });
    expect(result.c).toMatchObject({ points: 2, rank: 3 });
    expect(result.d).toMatchObject({ points: 1, rank: 4 });
  });

  it('동점자는 차지한 점수 구간을 균등 배분한다', () => {
    const result = scoreCategory(
      [
        { managerId: 'a', value: 10 },
        { managerId: 'b', value: 10 },
        { managerId: 'c', value: 5 },
        { managerId: 'd', value: 2 },
      ],
      hr,
    );

    // 1~2위 구간의 4점과 3점을 나눠 3.5점씩
    expect(result.a).toMatchObject({ points: 3.5, rank: 1 });
    expect(result.b).toMatchObject({ points: 3.5, rank: 1 });
    expect(result.c).toMatchObject({ points: 2, rank: 3 });
    expect(result.d).toMatchObject({ points: 1, rank: 4 });
  });

  it('전원 동점이면 모두 같은 점수를 받는다', () => {
    const result = scoreCategory(
      [
        { managerId: 'a', value: 7 },
        { managerId: 'b', value: 7 },
        { managerId: 'c', value: 7 },
      ],
      hr,
    );
    // (3 + 2 + 1) / 3 = 2
    for (const id of ['a', 'b', 'c']) {
      expect(result[id]).toMatchObject({ points: 2, rank: 1 });
    }
  });

  it('부문 점수 총합은 항상 N(N+1)/2 로 보존된다', () => {
    const entries = [
      { managerId: 'a', value: 10 },
      { managerId: 'b', value: 10 },
      { managerId: 'c', value: 10 },
      { managerId: 'd', value: 4 },
      { managerId: 'e', value: null },
    ];
    const result = scoreCategory(entries, hr);
    const sum = Object.values(result).reduce((s, cell) => s + cell.points, 0);
    expect(sum).toBeCloseTo((5 * 6) / 2, 10);
  });

  it('ERA처럼 낮을수록 좋은 부문은 순서를 뒤집는다', () => {
    const era = categoryByKey('era');
    const result = scoreCategory(
      [
        { managerId: 'a', value: 2.5 },
        { managerId: 'b', value: 4.8 },
        { managerId: 'c', value: 3.1 },
      ],
      era,
    );

    expect(result.a.rank).toBe(1);
    expect(result.c.rank).toBe(2);
    expect(result.b.rank).toBe(3);
  });

  it('산정 불가(null)는 최하위이고 서로는 동점이다', () => {
    const result = scoreCategory(
      [
        { managerId: 'a', value: 3 },
        { managerId: 'b', value: null },
        { managerId: 'c', value: null },
      ],
      hr,
    );

    expect(result.a).toMatchObject({ points: 3, rank: 1 });
    // 2~3위 구간의 2점과 1점을 나눠 1.5점씩
    expect(result.b).toMatchObject({ points: 1.5, rank: 2 });
    expect(result.c).toMatchObject({ points: 1.5, rank: 2 });
  });

  it('표시값이 같으면 동점으로 본다', () => {
    const avg = categoryByKey('avg');
    // .2999996 과 .3000004 는 둘 다 .300 으로 표시된다
    const result = scoreCategory(
      [
        { managerId: 'a', value: 0.3000004 },
        { managerId: 'b', value: 0.2999996 },
        { managerId: 'c', value: 0.25 },
      ],
      avg,
    );

    expect(result.a.points).toBe(result.b.points);
    expect(result.a.rank).toBe(1);
    expect(result.b.rank).toBe(1);
  });
});

// --- 스냅샷 조립 헬퍼 ---

function buildSnapshot(
  teams: Record<string, { hitting?: Partial<HittingLine>; pitching?: Partial<PitchingLine> }>,
): LeagueSnapshot {
  const snapshot = emptySnapshot(2026);
  for (const [managerId, lines] of Object.entries(teams)) {
    const playerId = `${managerId}-p`;
    snapshot.managers.push({ id: managerId, name: managerId.toUpperCase() });
    snapshot.rosters.push({ managerId, playerIds: [playerId] });
    snapshot.players[playerId] = {
      id: playerId,
      name: `${managerId} 선수`,
      kboTeam: 'LG',
      role: lines.pitching ? 'pitcher' : 'hitter',
    };
    if (lines.hitting) snapshot.hitting[playerId] = { ...EMPTY_HITTING, ...lines.hitting };
    if (lines.pitching) snapshot.pitching[playerId] = { ...EMPTY_PITCHING, ...lines.pitching };
  }
  return snapshot;
}

describe('aggregateRoster', () => {
  it('타율은 선수별 타율의 평균이 아니라 팀 안타 ÷ 팀 타수다', () => {
    const snapshot = emptySnapshot(2026);
    // 10타수 4안타(.400) 선수와 500타수 125안타(.250) 선수
    snapshot.hitting.small = { ...EMPTY_HITTING, ab: 10, h: 4 };
    snapshot.hitting.big = { ...EMPTY_HITTING, ab: 500, h: 125 };

    const totals = aggregateRoster(snapshot, ['small', 'big']);
    const avg = categoryByKey('avg').compute(totals)!;

    // 129 / 510 = .2529... 단순 평균 .325 와 명확히 다르다
    expect(avg).toBeCloseTo(129 / 510, 10);
    expect(avg).not.toBeCloseTo(0.325, 3);
  });

  it('평균자책점도 팀 자책점과 팀 이닝으로 계산한다', () => {
    const snapshot = emptySnapshot(2026);
    snapshot.pitching.ace = { ...EMPTY_PITCHING, ip: 180, er: 40 };
    snapshot.pitching.reliever = { ...EMPTY_PITCHING, ip: 20, er: 20 };

    const totals = aggregateRoster(snapshot, ['ace', 'reliever']);
    const era = categoryByKey('era').compute(totals)!;

    // (60 * 9) / 200 = 2.70
    expect(era).toBeCloseTo(2.7, 10);
  });

  it('명단에 없는 선수 id는 조용히 건너뛴다', () => {
    const snapshot = emptySnapshot(2026);
    snapshot.hitting.real = { ...EMPTY_HITTING, ab: 100, h: 30, hr: 5 };
    const totals = aggregateRoster(snapshot, ['real', 'ghost']);
    expect(totals.hitting.hr).toBe(5);
    expect(totals.hitting.ab).toBe(100);
  });
});

describe('computeStandings', () => {
  it('부문 점수를 합산해 종합 순위를 매긴다', () => {
    const snapshot = buildSnapshot({
      a: { hitting: { ab: 500, h: 150, hr: 30, rbi: 100, r: 90, sb: 20 } },
      b: { hitting: { ab: 500, h: 140, hr: 25, rbi: 95, r: 85, sb: 15 } },
      c: { hitting: { ab: 500, h: 130, hr: 20, rbi: 90, r: 80, sb: 10 } },
    });

    const standings = computeStandings(snapshot);

    expect(standings.maxPointsPerCategory).toBe(3);
    expect(standings.rows.map((r) => r.managerId)).toEqual(['a', 'b', 'c']);
    expect(standings.rows[0].rank).toBe(1);

    // a는 타격 5부문 전부 1위(3점) = 15점.
    // 투수 스탯이 없어 투수 5부문은 3인 전원 null 동점 → 각 2점씩 = 10점.
    expect(standings.rows[0].totalPoints).toBeCloseTo(15 + 10, 10);
  });

  it('총점이 같으면 종합 순위를 공유한다', () => {
    const snapshot = buildSnapshot({
      a: { hitting: { ab: 100, h: 30, hr: 10 } },
      b: { hitting: { ab: 100, h: 30, hr: 10 } },
    });

    const standings = computeStandings(snapshot);
    expect(standings.rows[0].rank).toBe(1);
    expect(standings.rows[1].rank).toBe(1);
    expect(standings.rows[0].totalPoints).toBe(standings.rows[1].totalPoints);
  });

  it('리그 전체 총점은 부문수 × N(N+1)/2 이다', () => {
    const snapshot = buildSnapshot({
      a: { hitting: { ab: 400, h: 120, hr: 20 }, pitching: { ip: 100, er: 30, so: 90 } },
      b: { hitting: { ab: 400, h: 100, hr: 15 }, pitching: { ip: 120, er: 50, so: 80 } },
      c: { hitting: { ab: 400, h: 110, hr: 25 }, pitching: { ip: 90, er: 40, so: 100 } },
      d: { hitting: { ab: 400, h: 90, hr: 10 }, pitching: { ip: 150, er: 45, so: 130 } },
    });

    const standings = computeStandings(snapshot);
    const total = standings.rows.reduce((s, r) => s + r.totalPoints, 0);
    expect(total).toBeCloseTo(DEFAULT_CATEGORIES.length * ((4 * 5) / 2), 10);
  });

  it('참가자가 없어도 예외 없이 빈 순위표를 만든다', () => {
    const standings = computeStandings(emptySnapshot(2026));
    expect(standings.rows).toEqual([]);
    expect(standings.maxPointsPerCategory).toBe(0);
  });
});
