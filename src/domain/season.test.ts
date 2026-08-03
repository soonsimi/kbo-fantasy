import { describe, expect, it } from 'vitest';
import { computeMonth, computeSeason, currentSeasonMonth, hasData, scoredMonthKeys } from './season';
import { EMPTY_HITTING, emptyMonth, emptySnapshot, monthKey } from './types';
import type { HittingLine, LeagueSnapshot, MonthKey } from './types';

const SEASON = 2026;
const APRIL = monthKey(SEASON, 4);
const MAY = monthKey(SEASON, 5);
const JUNE = monthKey(SEASON, 6);

/**
 * 참가자마다 선수 하나씩, 홈런 수만 다르게 준다.
 * 홈런 순서가 그 달 순위를 결정하도록 다른 부문은 모두 0으로 둔다.
 * (모든 부문이 동점이면 균등 배분되어 순위에 영향을 주지 않는다.)
 */
function withMonth(
  snapshot: LeagueSnapshot,
  month: MonthKey,
  homers: Record<string, number>,
): LeagueSnapshot {
  const stats = emptyMonth();
  const hitting: Record<string, HittingLine> = {};
  for (const [managerId, hr] of Object.entries(homers)) {
    hitting[`${managerId}-p`] = { ...EMPTY_HITTING, hr };
  }
  stats.hitting = hitting;
  stats.importedFields = { hitting: ['hr'], pitching: [] };
  stats.updatedAt = '2026-08-01T00:00:00.000Z';

  return { ...snapshot, months: { ...snapshot.months, [month]: stats } };
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

  it('기록이 들어온 달만 산정 대상이다', () => {
    let snapshot = baseLeague(['a', 'b']);
    snapshot = withMonth(snapshot, MAY, { a: 10, b: 5 });
    snapshot = withMonth(snapshot, APRIL, { a: 3, b: 8 });

    // 시간 순으로 정렬되어야 한다
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
    snapshot = withMonth(snapshot, APRIL, { a: 10, b: 5, c: 1 });
    snapshot = withMonth(snapshot, MAY, { a: 1, b: 5, c: 10 });

    const april = computeMonth(snapshot, APRIL);
    expect(april.rows.map((r) => r.managerId)).toEqual(['a', 'b', 'c']);

    const may = computeMonth(snapshot, MAY);
    expect(may.rows.map((r) => r.managerId)).toEqual(['c', 'b', 'a']);
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
    snapshot = withMonth(snapshot, APRIL, { a: 30, b: 20, c: 10 });
    // 5월: c 1위, a 2위, b 3위
    snapshot = withMonth(snapshot, MAY, { c: 30, a: 20, b: 10 });

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
    snapshot = withMonth(snapshot, APRIL, { a: 30, b: 10 });
    snapshot = withMonth(snapshot, MAY, { a: 10, b: 30 });

    const season = computeSeason(snapshot);
    const a = season.rows.find((r) => r.managerId === 'a')!;

    expect(a.monthlyRanks[APRIL]).toBe(1);
    expect(a.monthlyRanks[MAY]).toBe(2);
    expect(a.monthlyPoints[APRIL]).toBeGreaterThan(a.monthlyPoints[MAY]);
    // 두 달 순위 합
    expect(a.rankSum).toBe(3);
  });

  it('순위 합이 같으면 종합 순위를 공유한다', () => {
    let snapshot = baseLeague(['a', 'b']);
    // 4월 a 1위 / 5월 b 1위 → 둘 다 합 3
    snapshot = withMonth(snapshot, APRIL, { a: 30, b: 10 });
    snapshot = withMonth(snapshot, MAY, { a: 10, b: 30 });

    const season = computeSeason(snapshot);
    expect(season.rows[0].rankSum).toBe(season.rows[1].rankSum);
    expect(season.rows[0].rank).toBe(1);
    expect(season.rows[1].rank).toBe(1);
  });

  it('기록 없는 달은 합산에서 빠진다', () => {
    let snapshot = baseLeague(['a', 'b']);
    snapshot = withMonth(snapshot, APRIL, { a: 30, b: 10 });
    // 5월은 넣지 않는다

    const season = computeSeason(snapshot);
    expect(season.scoredMonths).toEqual([APRIL]);

    const a = season.rows.find((r) => r.managerId === 'a')!;
    // 4월 1위만 반영 → 합 1
    expect(a.rankSum).toBe(1);
    expect(a.monthlyRanks[MAY]).toBeUndefined();
  });

  it('꾸준한 2위가 기복 심한 참가자를 이길 수 있다', () => {
    let snapshot = baseLeague(['steady', 'spiky', 'filler']);
    // steady: 매달 2위 → 합 6
    // spiky: 1위, 3위, 3위 → 합 7
    snapshot = withMonth(snapshot, APRIL, { spiky: 30, steady: 20, filler: 10 });
    snapshot = withMonth(snapshot, MAY, { filler: 30, steady: 20, spiky: 10 });
    snapshot = withMonth(snapshot, JUNE, { filler: 30, steady: 20, spiky: 10 });

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
    // 다른 해라면 마지막 달로 맞춘다
    expect(currentSeasonMonth(snapshot, new Date('2027-05-01T00:00:00Z'))).toBe(
      monthKey(SEASON, 10),
    );
  });
});
