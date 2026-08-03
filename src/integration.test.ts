/**
 * 통합 테스트: 표 붙여넣기 → 로스터 구성 → 로토서리 순위표.
 *
 * 화면 없이 실제 파이프라인을 그대로 통과시켜, 임포트 결과가
 * 순위 계산에 올바르게 연결되는지 확인한다.
 */

import { describe, expect, it } from 'vitest';
import { computeStandings } from './domain/rotisserie';
import { emptySnapshot } from './domain/types';
import type { LeagueSnapshot, PlayerRole } from './domain/types';
import { parseStatTable, playerKey } from './import/parseStatTable';

const HITTERS = [
  '순위\t선수명\t팀명\tAVG\tG\tPA\tAB\tR\tH\t2B\t3B\tHR\tTB\tRBI\tSB',
  '1\t김도영\tKIA\t0.347\t141\t625\t544\t143\t189\t29\t10\t38\t363\t109\t40',
  '2\t레이예스\t롯데\t0.352\t144\t622\t574\t89\t202\t34\t2\t15\t285\t111\t3',
  '3\t구자욱\t삼성\t0.343\t129\t558\t484\t92\t166\t39\t1\t33\t306\t115\t13',
  '4\t오스틴\tLG\t0.319\t140\t612\t546\t99\t174\t31\t0\t32\t301\t132\t15',
].join('\n');

const PITCHERS = [
  '순위\t선수명\t팀명\tERA\tG\tW\tL\tSV\tHLD\tWPCT\tIP\tH\tHR\tBB\tHBP\tSO\tR\tER\tWHIP',
  '1\t원태인\t삼성\t3.66\t28\t15\t6\t0\t0\t0.714\t159 2/3\t160\t13\t43\t5\t119\t72\t65\t1.27',
  '2\t네일\tKIA\t2.53\t26\t12\t5\t0\t0\t0.706\t149 1/3\t128\t7\t35\t9\t122\t46\t42\t1.09',
].join('\n');

/** ImportPanel 의 반영 로직과 같은 동작 */
function applyImport(snapshot: LeagueSnapshot, text: string, role: PlayerRole): LeagueSnapshot {
  const result = parseStatTable(text, role);
  expect(result.missingFields).toEqual([]);

  const next = structuredClone(snapshot);
  for (const row of result.rows) {
    const id = playerKey(row.name);
    next.players[id] = {
      id,
      name: row.name,
      kboTeam: row.kboTeam ?? '',
      role,
    };
    if (row.hitting) next.hitting[id] = row.hitting;
    if (row.pitching) next.pitching[id] = row.pitching;
  }
  next.statsUpdatedAt = '2026-08-01T00:00:00.000Z';
  return next;
}

describe('임포트 → 순위표 통합', () => {
  it('붙여넣은 표로 로토서리 순위가 계산된다', () => {
    let snapshot = emptySnapshot(2026);
    snapshot = applyImport(snapshot, HITTERS, 'hitter');
    snapshot = applyImport(snapshot, PITCHERS, 'pitcher');

    expect(Object.keys(snapshot.players)).toHaveLength(6);
    expect(Object.keys(snapshot.hitting)).toHaveLength(4);
    expect(Object.keys(snapshot.pitching)).toHaveLength(2);

    // 2인 리그를 구성한다
    snapshot.managers = [
      { id: 'm1', name: '참가자1' },
      { id: 'm2', name: '참가자2' },
    ];
    snapshot.rosters = [
      { managerId: 'm1', playerIds: ['김도영', '구자욱', '원태인'] },
      { managerId: 'm2', playerIds: ['레이예스', '오스틴', '네일'] },
    ];

    const standings = computeStandings(snapshot);
    expect(standings.maxPointsPerCategory).toBe(2);
    expect(standings.rows).toHaveLength(2);

    const m1 = standings.rows.find((r) => r.managerId === 'm1')!;
    const m2 = standings.rows.find((r) => r.managerId === 'm2')!;

    // 홈런: m1 = 38 + 33 = 71, m2 = 15 + 32 = 47 → m1 승
    expect(m1.cells.hr.value).toBe(71);
    expect(m2.cells.hr.value).toBe(47);
    expect(m1.cells.hr.points).toBe(2);
    expect(m2.cells.hr.points).toBe(1);

    // 팀 타율: m1 = (189 + 166) / (544 + 484) = 355/1028
    expect(m1.cells.avg.value).toBeCloseTo(355 / 1028, 10);
    // m2 = (202 + 174) / (574 + 546) = 376/1120
    expect(m2.cells.avg.value).toBeCloseTo(376 / 1120, 10);

    // 팀 ERA: m1은 원태인 단독 (65 * 9) / (159 + 2/3)
    expect(m1.cells.era.value).toBeCloseTo((65 * 9) / (159 + 2 / 3), 8);
    // m2는 네일 단독 (42 * 9) / (149 + 1/3) → 더 낮으므로 m2가 상위
    expect(m2.cells.era.value).toBeCloseTo((42 * 9) / (149 + 1 / 3), 8);
    expect(m2.cells.era.points).toBe(2);
    expect(m1.cells.era.points).toBe(1);

    // 리그 총점은 부문수 × N(N+1)/2 = 10 × 3 = 30
    expect(m1.totalPoints + m2.totalPoints).toBeCloseTo(30, 10);
  });

  it('여러 페이지를 이어 붙여넣어도 선수가 누적된다', () => {
    let snapshot = emptySnapshot(2026);
    const page1 = HITTERS.split('\n').slice(0, 3).join('\n');
    const page2 = [HITTERS.split('\n')[0], ...HITTERS.split('\n').slice(3)].join('\n');

    snapshot = applyImport(snapshot, page1, 'hitter');
    expect(Object.keys(snapshot.hitting)).toHaveLength(2);

    snapshot = applyImport(snapshot, page2, 'hitter');
    expect(Object.keys(snapshot.hitting)).toHaveLength(4);
  });

  it('같은 표를 다시 넣으면 스탯이 두 배가 되지 않고 갱신된다', () => {
    let snapshot = emptySnapshot(2026);
    snapshot = applyImport(snapshot, HITTERS, 'hitter');
    const before = snapshot.hitting['김도영'].hr;

    snapshot = applyImport(snapshot, HITTERS, 'hitter');
    expect(snapshot.hitting['김도영'].hr).toBe(before);
  });
});
