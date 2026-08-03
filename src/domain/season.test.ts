import { describe, expect, it } from 'vitest';
import { computeMonth, computeSeason, currentSeasonMonth, hasData, scoredMonthKeys } from './season';
import { EMPTY_HITTING, emptyMonth, emptySnapshot, monthKey } from './types';
import type { HittingLine, LeagueSnapshot, MonthKey } from './types';

const SEASON = 2026;
const APRIL = monthKey(SEASON, 4);
const MAY = monthKey(SEASON, 5);
const JUNE = monthKey(SEASON, 6);

/**
 * 참가자마다 선수 하나씩 두고 그 달 타자 기록을 지정한다.
 * 지정하지 않은 항목은 0이라 전원 동점이 되고, 동점 부문은 균등 배분되어
 * 순위에 영향을 주지 않는다.
 */
function withMonth(
  snapshot: LeagueSnapshot,
  month: MonthKey,
  lines: Record<string, Partial<HittingLine>>,
): LeagueSnapshot {
  const stats = emptyMonth();
  for (const [managerId, line] of Object.entries(lines)) {
    stats.hitting[`${managerId}-p`] = { ...EMPTY_HITTING, ...line };
  }
  stats.importedFields = {
    hitting: ['r', 'h', 'hr', 'rbi', 'sb', 'bb', 'so', 'gdp'],
    pitching: [],
  };
  stats.updatedAt = '2026-08-01T00:00:00.000Z';

  return { ...snapshot, months: { ...snapshot.months, [month]: stats } };
}

/** 홈런만 다르게 주는 축약 헬퍼 */
function withHomers(
  snapshot: LeagueSnapshot,
  month: MonthKey,
  homers: Record<string, number>,
): LeagueSnapshot {
  return withMonth(
    snapshot,
    month,
    Object.fromEntries(Object.entries(homers).map(([id, hr]) => [id, { hr }])),
  );
}

function baseLeague(managerIds: string[]): LeagueSnapshot {
  const snapshot = emptySnapshot(SEASON);
  for (const id of managerIds) {
    snapshot.managers.push({ id, name: id.toUpperCase() });
    snapshot.rosters.push({ managerId: id, playerIds: [`${id}-p`] });
    snapshot.players[`${id}-p`] = {
      id: `${id}-p`,
      name: `${id} 선수`,
      kboTeam: 'LG',
      role: 'hitter',
    };
  }
  return snapshot;
}

describe('hasData / scoredMonthKeys', () => {
  it('임포트한 항목이 없는 달은 기록 없음으로 본다', () => {
    expect(hasData(undefined)).toBe(false);
    expect(hasData(emptyMonth())).toBe(false);
  });

  it('기록이 들어온 달만 산정 대상이고 시간 순으로 정렬된다', () => {
    let snapshot = baseLeague(['a', 'b']);
    snapshot = withHomers(snapshot, MAY, { a: 10, b: 5 });
    snapshot = withHomers(snapshot, APRIL, { a: 3, b: 8 });

    expect(scoredMonthKeys(snapshot)).toEqual([APRIL, MAY]);
  });

  it('선수 스탯이 있어도 importedFields가 비면 기록 없음이다', () => {
    // 값 0과 미입력을 구별하기 위한 규칙
    const stats = emptyMonth();
    stats.hitting['a-p'] = { ...EMPTY_HITTING, hr: 5 };
    expect(hasData(stats)).toBe(false);
  });
});

describe('computeMonth', () => {
  it('그 달 기록만으로 순위를 낸다', () => {
    let snapshot = baseLeague(['a', 'b', 'c']);
    snapshot = withHomers(snapshot, APRIL, { a: 10, b: 5, c: 1 });
    snapshot = withHomers(snapshot, MAY, { a: 1, b: 5, c: 10 });

    expect(computeMonth(snapshot, APRIL).rows.map((r) => r.managerId)).toEqual(['a', 'b', 'c']);
    expect(computeMonth(snapshot, MAY).rows.map((r) => r.managerId)).toEqual(['c', 'b', 'a']);
  });

  it('기록이 없는 달은 전원 동점이 된다', () => {
    const snapshot = baseLeague(['a', 'b']);
    const june = computeMonth(snapshot, JUNE);
    expect(june.rows[0].rank).toBe(1);
    expect(june.rows[1].rank).toBe(1);
  });
});

describe('computeSeason — 월별 순위의 합산', () => {
  it('월 순위를 더해 종합 순위를 정한다 (합이 작을수록 상위)', () => {
    let snapshot = baseLeague(['a', 'b', 'c']);
    // 4월: a 1위, b 2위, c 3위
    snapshot = withHomers(snapshot, APRIL, { a: 30, b: 20, c: 10 });
    // 5월: c 1위, a 2위, b 3위
    snapshot = withHomers(snapshot, MAY, { c: 30, a: 20, b: 10 });

    const season = computeSeason(snapshot);
    expect(season.scoredMonths).toEqual([APRIL, MAY]);

    const byId = Object.fromEntries(season.rows.map((r) => [r.managerId, r]));

    // a: 1 + 2 = 3, c: 3 + 1 = 4, b: 2 + 3 = 5
    expect(byId.a.rankSum).toBe(3);
    expect(byId.c.rankSum).toBe(4);
    expect(byId.b.rankSum).toBe(5);

    expect(season.rows.map((r) => r.managerId)).toEqual(['a', 'c', 'b']);
    expect(byId.a.rank).toBe(1);
    expect(byId.c.rank).toBe(2);
    expect(byId.b.rank).toBe(3);
  });

  it('월별 순위와 총점을 달마다 기록한다', () => {
    let snapshot = baseLeague(['a', 'b']);
    snapshot = withHomers(snapshot, APRIL, { a: 30, b: 10 });
    snapshot = withHomers(snapshot, MAY, { a: 10, b: 30 });

    const season = computeSeason(snapshot);
    const a = season.rows.find((r) => r.managerId === 'a')!;

    expect(a.monthlyRanks[APRIL]).toBe(1);
    expect(a.monthlyRanks[MAY]).toBe(2);
    expect(a.monthlyPoints[APRIL]).toBeGreaterThan(a.monthlyPoints[MAY]);
    expect(a.rankSum).toBe(3);
    expect(a.pointsSum).toBeCloseTo(a.monthlyPoints[APRIL] + a.monthlyPoints[MAY], 10);
  });

  it('기록 없는 달은 합산에서 빠진다', () => {
    let snapshot = baseLeague(['a', 'b']);
    snapshot = withHomers(snapshot, APRIL, { a: 30, b: 10 });

    const season = computeSeason(snapshot);
    expect(season.scoredMonths).toEqual([APRIL]);

    const a = season.rows.find((r) => r.managerId === 'a')!;
    expect(a.rankSum).toBe(1);
    expect(a.monthlyRanks[MAY]).toBeUndefined();
  });

  it('꾸준한 2위가 기복 심한 참가자를 이길 수 있다', () => {
    let snapshot = baseLeague(['steady', 'spiky', 'filler']);
    // steady: 2위, 2위, 2위 → 합 6
    // spiky:  1위, 3위, 3위 → 합 7
    snapshot = withHomers(snapshot, APRIL, { spiky: 30, steady: 20, filler: 10 });
    snapshot = withHomers(snapshot, MAY, { filler: 30, steady: 20, spiky: 10 });
    snapshot = withHomers(snapshot, JUNE, { filler: 30, steady: 20, spiky: 10 });

    const season = computeSeason(snapshot);
    const byId = Object.fromEntries(season.rows.map((r) => [r.managerId, r]));

    expect(byId.steady.rankSum).toBe(6);
    expect(byId.spiky.rankSum).toBe(7);
    expect(byId.steady.rank).toBeLessThan(byId.spiky.rank);
  });

  it('기록이 하나도 없으면 빈 결과를 낸다', () => {
    const snapshot = baseLeague(['a', 'b']);
    const season = computeSeason(snapshot);
    expect(season.scoredMonths).toEqual([]);
    expect(season.rows.every((r) => r.rankSum === 0)).toBe(true);
  });
});

describe('computeSeason — 동점 처리', () => {
  /**
   * 순위 합은 같은데 총점 합계가 다른 상황을 만든다.
   *
   * 4월: a가 타자 8부문을 전부 크게 이긴다 → 점수 차가 크게 벌어진다.
   * 5월: b가 홈런 한 부문만 앞선다 → 점수 차가 1점밖에 안 난다.
   *
   * 둘 다 1위 한 번, 2위 한 번이라 순위 합은 3으로 같지만,
   * 크게 이긴 달이 있는 a의 총점 합계가 더 높다.
   */
  function tiedRankSumLeague(): LeagueSnapshot {
    let snapshot = baseLeague(['a', 'b', 'c']);

    snapshot = withMonth(snapshot, APRIL, {
      a: { r: 30, h: 30, hr: 30, rbi: 30, sb: 30, bb: 30, so: 1, gdp: 1 },
      b: { r: 20, h: 20, hr: 20, rbi: 20, sb: 20, bb: 20, so: 2, gdp: 2 },
      c: { r: 10, h: 10, hr: 10, rbi: 10, sb: 10, bb: 10, so: 3, gdp: 3 },
    });

    // 홈런만 갈리고 나머지는 전원 0 → 동점
    snapshot = withMonth(snapshot, MAY, {
      a: { hr: 20 },
      b: { hr: 30 },
      c: { hr: 10 },
    });

    return snapshot;
  }

  it('순위 합이 같으면 총점 합계가 높은 쪽이 상위다', () => {
    const season = computeSeason(tiedRankSumLeague());
    const byId = Object.fromEntries(season.rows.map((r) => [r.managerId, r]));

    // 4월 a 1위 / 5월 a 2위, 4월 b 2위 / 5월 b 1위 → 둘 다 순위 합 3
    expect(byId.a.rankSum).toBe(3);
    expect(byId.b.rankSum).toBe(3);

    // 4월에 크게 이긴 a의 총점 합계가 더 높다
    expect(byId.a.pointsSum).toBeGreaterThan(byId.b.pointsSum);

    // 공동 1위가 아니라 a가 단독 1위
    expect(byId.a.rank).toBe(1);
    expect(byId.b.rank).toBe(2);
    expect(byId.c.rank).toBe(3);
    expect(season.rows.map((r) => r.managerId)).toEqual(['a', 'b', 'c']);
  });

  it('순위 합과 총점 합계가 모두 같으면 공동 순위다', () => {
    let snapshot = baseLeague(['a', 'b', 'c']);
    // 완전히 대칭인 두 달 → 순위 합도 총점도 같다
    snapshot = withHomers(snapshot, APRIL, { a: 30, b: 20, c: 10 });
    snapshot = withHomers(snapshot, MAY, { b: 30, a: 20, c: 10 });

    const season = computeSeason(snapshot);
    const byId = Object.fromEntries(season.rows.map((r) => [r.managerId, r]));

    expect(byId.a.rankSum).toBe(byId.b.rankSum);
    expect(byId.a.pointsSum).toBeCloseTo(byId.b.pointsSum, 10);
    expect(byId.a.rank).toBe(1);
    expect(byId.b.rank).toBe(1);
    expect(byId.c.rank).toBe(3);
  });

  it('총점 합계가 높아도 순위 합이 크면 하위다', () => {
    let snapshot = baseLeague(['a', 'b', 'c']);
    // a는 4·5월 모두 근소하게 1위 → 순위 합 2, 총점은 크지 않다
    snapshot = withHomers(snapshot, APRIL, { a: 11, b: 10, c: 1 });
    snapshot = withHomers(snapshot, MAY, { a: 11, b: 10, c: 1 });

    const season = computeSeason(snapshot);
    const byId = Object.fromEntries(season.rows.map((r) => [r.managerId, r]));

    expect(byId.a.rankSum).toBe(2);
    expect(byId.b.rankSum).toBe(4);
    // 순위 합이 우선이므로 a가 1위
    expect(byId.a.rank).toBe(1);
    expect(byId.b.rank).toBe(2);
  });
});

describe('currentSeasonMonth', () => {
  const snapshot = emptySnapshot(SEASON);

  it('시즌 중이면 그 달을 고른다', () => {
    expect(currentSeasonMonth(snapshot, new Date('2026-08-04T00:00:00Z'))).toBe(
      monthKey(SEASON, 8),
    );
  });

  it('시즌 개막 전이면 첫 달을 고른다', () => {
    expect(currentSeasonMonth(snapshot, new Date('2026-01-15T00:00:00Z'))).toBe(
      monthKey(SEASON, 3),
    );
  });

  it('시즌 종료 후면 마지막 달을 고른다', () => {
    expect(currentSeasonMonth(snapshot, new Date('2026-12-01T00:00:00Z'))).toBe(
      monthKey(SEASON, 10),
    );
    expect(currentSeasonMonth(snapshot, new Date('2027-05-01T00:00:00Z'))).toBe(
      monthKey(SEASON, 10),
    );
  });
});
