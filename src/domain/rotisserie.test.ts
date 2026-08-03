import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, neededFields } from './categories';
import type { Category } from './categories';
import { aggregateRoster, computeStandings, scoreCategory } from './rotisserie';
import { EMPTY_HITTING, EMPTY_PITCHING, emptySnapshot } from './types';
import type { HittingLine, LeagueSnapshot, PitchingLine } from './types';

const categoryByKey = (key: string): Category => {
  const found = DEFAULT_CATEGORIES.find((c) => c.key === key);
  if (!found) throw new Error(`unknown category: ${key}`);
  return found;
};

describe('부문 구성', () => {
  it('타자 8부문 / 투수 7부문으로 총 15부문이다', () => {
    expect(DEFAULT_CATEGORIES.filter((c) => c.group === 'hitting')).toHaveLength(8);
    expect(DEFAULT_CATEGORIES.filter((c) => c.group === 'pitching')).toHaveLength(7);
    expect(DEFAULT_CATEGORIES).toHaveLength(15);
  });

  it('마이너스 부문은 타자 SO·GDP, 투수 L·BB 다', () => {
    const inverted = DEFAULT_CATEGORIES.filter((c) => c.lowerIsBetter).map((c) => c.key);
    expect(inverted.sort()).toEqual(['b_gdp', 'b_so', 'p_bb', 'p_l']);
  });

  it('부문 정의에서 임포트에 필요한 열이 도출된다', () => {
    expect(neededFields('hitting').sort()).toEqual(
      ['bb', 'gdp', 'h', 'hr', 'r', 'rbi', 'sb', 'so'].sort(),
    );
    expect(neededFields('pitching').sort()).toEqual(
      ['bb', 'hitsAllowed', 'hld', 'ip', 'l', 'so', 'sv', 'w'].sort(),
    );
  });

  it('SV+HLD는 세이브와 홀드의 합이다', () => {
    const category = categoryByKey('p_svhld');
    const totals = {
      hitting: { ...EMPTY_HITTING },
      pitching: { ...EMPTY_PITCHING, sv: 12, hld: 20 },
    };
    expect(category.compute(totals)).toBe(32);
  });
});

describe('scoreCategory', () => {
  const hr = categoryByKey('b_hr');

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

    expect(result.a).toMatchObject({ points: 3.5, rank: 1 });
    expect(result.b).toMatchObject({ points: 3.5, rank: 1 });
    expect(result.c).toMatchObject({ points: 2, rank: 3 });
    expect(result.d).toMatchObject({ points: 1, rank: 4 });
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

  it('타자 삼진은 적은 쪽이 상위다', () => {
    const so = categoryByKey('b_so');
    expect(so.lowerIsBetter).toBe(true);

    const result = scoreCategory(
      [
        { managerId: 'few', value: 60 },
        { managerId: 'many', value: 150 },
        { managerId: 'mid', value: 100 },
      ],
      so,
    );

    expect(result.few.rank).toBe(1);
    expect(result.few.points).toBe(3);
    expect(result.mid.rank).toBe(2);
    expect(result.many.rank).toBe(3);
    expect(result.many.points).toBe(1);
  });

  it('타자 병살타도 적은 쪽이 상위다', () => {
    const gdp = categoryByKey('b_gdp');
    const result = scoreCategory(
      [
        { managerId: 'a', value: 5 },
        { managerId: 'b', value: 20 },
      ],
      gdp,
    );
    expect(result.a.points).toBe(2);
    expect(result.b.points).toBe(1);
  });

  it('투수 패전과 볼넷은 적은 쪽이 상위다', () => {
    for (const key of ['p_l', 'p_bb']) {
      const category = categoryByKey(key);
      expect(category.lowerIsBetter).toBe(true);
      const result = scoreCategory(
        [
          { managerId: 'low', value: 3 },
          { managerId: 'high', value: 15 },
        ],
        category,
      );
      expect(result.low.points).toBe(2);
      expect(result.high.points).toBe(1);
    }
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
    expect(result.b).toMatchObject({ points: 1.5, rank: 2 });
    expect(result.c).toMatchObject({ points: 1.5, rank: 2 });
  });

  it('표시값이 같으면 동점으로 본다', () => {
    const ip = categoryByKey('p_ip');
    // 소수 오차로 미세하게 다르지만 둘 다 '100' 으로 표시된다
    const result = scoreCategory(
      [
        { managerId: 'a', value: 100.0000001 },
        { managerId: 'b', value: 99.9999999 },
        { managerId: 'c', value: 80 },
      ],
      ip,
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
  it('보유 선수의 모든 항목을 합산한다', () => {
    const snapshot = emptySnapshot(2026);
    snapshot.hitting.a = { ...EMPTY_HITTING, r: 90, h: 150, hr: 30, rbi: 100, sb: 20, bb: 60, so: 110, gdp: 12 };
    snapshot.hitting.b = { ...EMPTY_HITTING, r: 50, h: 100, hr: 10, rbi: 55, sb: 5, bb: 40, so: 70, gdp: 8 };

    const totals = aggregateRoster(snapshot, ['a', 'b']);
    expect(totals.hitting).toEqual({
      r: 140,
      h: 250,
      hr: 40,
      rbi: 155,
      sb: 25,
      bb: 100,
      so: 180,
      gdp: 20,
    });
  });

  it('투수 이닝은 소수 합으로 누적된다', () => {
    const snapshot = emptySnapshot(2026);
    snapshot.pitching.a = { ...EMPTY_PITCHING, ip: 100 + 1 / 3, w: 8, so: 90 };
    snapshot.pitching.b = { ...EMPTY_PITCHING, ip: 50 + 2 / 3, w: 4, so: 45 };

    const totals = aggregateRoster(snapshot, ['a', 'b']);
    expect(totals.pitching.ip).toBeCloseTo(151, 10);
    expect(totals.pitching.w).toBe(12);
    expect(totals.pitching.so).toBe(135);
  });

  it('명단에 없는 선수 id는 조용히 건너뛴다', () => {
    const snapshot = emptySnapshot(2026);
    snapshot.hitting.real = { ...EMPTY_HITTING, hr: 5, h: 30 };
    const totals = aggregateRoster(snapshot, ['real', 'ghost']);
    expect(totals.hitting.hr).toBe(5);
    expect(totals.hitting.h).toBe(30);
  });
});

describe('computeStandings', () => {
  it('부문 점수를 합산해 종합 순위를 매긴다', () => {
    const snapshot = buildSnapshot({
      // 마이너스 부문(SO·GDP)은 a가 가장 적다 → a가 전 부문 1위
      a: { hitting: { r: 90, h: 150, hr: 30, rbi: 100, sb: 20, bb: 60, so: 70, gdp: 5 } },
      b: { hitting: { r: 85, h: 140, hr: 25, rbi: 95, sb: 15, bb: 55, so: 100, gdp: 10 } },
      c: { hitting: { r: 80, h: 130, hr: 20, rbi: 90, sb: 10, bb: 50, so: 130, gdp: 15 } },
    });

    const standings = computeStandings(snapshot);

    expect(standings.maxPointsPerCategory).toBe(3);
    expect(standings.rows.map((r) => r.managerId)).toEqual(['a', 'b', 'c']);
    expect(standings.rows[0].rank).toBe(1);

    // a는 타자 8부문 전부 1위(3점) = 24점.
    // 투수 스탯이 없어 투수 7부문은 3인 전원 동점 → 각 2점씩 = 14점.
    expect(standings.rows[0].totalPoints).toBeCloseTo(24 + 14, 10);
  });

  it('마이너스 부문에서 값이 큰 팀이 손해를 본다', () => {
    const snapshot = buildSnapshot({
      slugger: { hitting: { hr: 40, so: 180, gdp: 20 } },
      contact: { hitting: { hr: 10, so: 60, gdp: 4 } },
    });

    const standings = computeStandings(snapshot);
    const slugger = standings.rows.find((r) => r.managerId === 'slugger')!;
    const contact = standings.rows.find((r) => r.managerId === 'contact')!;

    // 홈런은 slugger 1위
    expect(slugger.cells.b_hr.points).toBe(2);
    // 삼진·병살타는 contact 1위
    expect(contact.cells.b_so.points).toBe(2);
    expect(contact.cells.b_gdp.points).toBe(2);
    expect(slugger.cells.b_so.points).toBe(1);
  });

  it('총점이 같으면 종합 순위를 공유한다', () => {
    const snapshot = buildSnapshot({
      a: { hitting: { hr: 10, h: 30 } },
      b: { hitting: { hr: 10, h: 30 } },
    });

    const standings = computeStandings(snapshot);
    expect(standings.rows[0].rank).toBe(1);
    expect(standings.rows[1].rank).toBe(1);
  });

  it('리그 전체 총점은 부문수 × N(N+1)/2 이다', () => {
    const snapshot = buildSnapshot({
      a: { hitting: { r: 80, h: 120, hr: 20, so: 90, gdp: 10 }, pitching: { ip: 100, w: 9, l: 5, so: 90, bb: 30 } },
      b: { hitting: { r: 70, h: 100, hr: 15, so: 110, gdp: 14 }, pitching: { ip: 120, w: 11, l: 8, so: 80, bb: 45 } },
      c: { hitting: { r: 75, h: 110, hr: 25, so: 100, gdp: 8 }, pitching: { ip: 90, w: 7, l: 3, so: 100, bb: 25 } },
      d: { hitting: { r: 60, h: 90, hr: 10, so: 130, gdp: 18 }, pitching: { ip: 150, w: 13, l: 10, so: 130, bb: 50 } },
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
