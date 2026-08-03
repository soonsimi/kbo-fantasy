/**
 * 통합 테스트: 여러 표 붙여넣기 → 로스터 구성 → 로토서리 순위표.
 *
 * 화면 없이 실제 파이프라인을 그대로 통과시켜, 항목이 여러 페이지에 나뉘어 있어도
 * 순위 계산까지 올바르게 연결되는지 확인한다.
 */

import { describe, expect, it } from 'vitest';
import { computeStandings } from './domain/rotisserie';
import { emptySnapshot } from './domain/types';
import type { LeagueSnapshot, PlayerRole } from './domain/types';
import { applyImport } from './import/applyImport';
import { parseStatTable } from './import/parseStatTable';

const NOW = '2026-08-01T00:00:00.000Z';

const HITTER_BASIC1 = [
  '순위\t선수명\t팀명\tG\tAB\tR\tH\tHR\tRBI\tSB',
  '1\t김도영\tKIA\t141\t544\t143\t189\t38\t109\t40',
  '2\t구자욱\t삼성\t129\t484\t92\t166\t33\t115\t13',
  '3\t레이예스\t롯데\t144\t574\t89\t202\t15\t111\t3',
  '4\t오스틴\tLG\t140\t546\t99\t174\t32\t132\t15',
].join('\n');

const HITTER_BASIC2 = [
  '순위\t선수명\t팀명\tBB\tIBB\tSO\tGDP',
  '1\t김도영\tKIA\t66\t2\t97\t7',
  '2\t구자욱\t삼성\t58\t3\t70\t11',
  '3\t레이예스\t롯데\t39\t1\t76\t18',
  '4\t오스틴\tLG\t53\t4\t102\t14',
].join('\n');

const PITCHERS = [
  '순위\t선수명\t팀명\tG\tW\tL\tSV\tHLD\tIP\tH\tBB\tSO',
  '1\t원태인\t삼성\t28\t15\t6\t0\t0\t159 2/3\t160\t43\t119',
  '2\t네일\tKIA\t26\t12\t5\t0\t0\t149 1/3\t128\t35\t122',
].join('\n');

function importTable(snapshot: LeagueSnapshot, text: string, role: PlayerRole): LeagueSnapshot {
  const result = parseStatTable(text, role);
  expect(result.fatal).toBeNull();
  return applyImport(snapshot, result, { now: NOW });
}

describe('부분 임포트 → 순위표 통합', () => {
  it('두 페이지를 이어 넣으면 타자 8부문이 모두 채워진다', () => {
    let snapshot = emptySnapshot(2026);

    snapshot = importTable(snapshot, HITTER_BASIC1, 'hitter');
    expect(snapshot.importedFields.hitting.sort()).toEqual(['h', 'hr', 'r', 'rbi', 'sb'].sort());
    // 아직 BB·SO·GDP는 0
    expect(snapshot.hitting['김도영'].bb).toBe(0);
    expect(snapshot.hitting['김도영'].hr).toBe(38);

    snapshot = importTable(snapshot, HITTER_BASIC2, 'hitter');
    expect(snapshot.importedFields.hitting.sort()).toEqual(
      ['bb', 'gdp', 'h', 'hr', 'r', 'rbi', 'sb', 'so'].sort(),
    );

    // 1번 표의 값이 2번 표 반영으로 지워지지 않았는지
    expect(snapshot.hitting['김도영']).toEqual({
      r: 143,
      h: 189,
      hr: 38,
      rbi: 109,
      sb: 40,
      bb: 66,
      so: 97,
      gdp: 7,
    });
  });

  it('붙여넣은 표로 로토서리 순위가 계산된다', () => {
    let snapshot = emptySnapshot(2026);
    snapshot = importTable(snapshot, HITTER_BASIC1, 'hitter');
    snapshot = importTable(snapshot, HITTER_BASIC2, 'hitter');
    snapshot = importTable(snapshot, PITCHERS, 'pitcher');

    expect(Object.keys(snapshot.players)).toHaveLength(6);

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

    const m1 = standings.rows.find((r) => r.managerId === 'm1')!;
    const m2 = standings.rows.find((r) => r.managerId === 'm2')!;

    // 홈런: m1 = 38 + 33 = 71, m2 = 15 + 32 = 47 → m1 승
    expect(m1.cells.b_hr.value).toBe(71);
    expect(m2.cells.b_hr.value).toBe(47);
    expect(m1.cells.b_hr.points).toBe(2);

    // 삼진(마이너스): m1 = 97 + 70 = 167, m2 = 76 + 102 = 178 → 적은 m1이 상위
    expect(m1.cells.b_so.value).toBe(167);
    expect(m2.cells.b_so.value).toBe(178);
    expect(m1.cells.b_so.points).toBe(2);
    expect(m2.cells.b_so.points).toBe(1);

    // 병살타(마이너스): m1 = 7 + 11 = 18, m2 = 18 + 14 = 32 → m1이 상위
    expect(m1.cells.b_gdp.value).toBe(18);
    expect(m1.cells.b_gdp.points).toBe(2);

    // 패전(마이너스): m1 원태인 6패, m2 네일 5패 → m2가 상위
    expect(m1.cells.p_l.value).toBe(6);
    expect(m2.cells.p_l.value).toBe(5);
    expect(m2.cells.p_l.points).toBe(2);

    // 투수 볼넷(마이너스): m1 43, m2 35 → m2가 상위
    expect(m2.cells.p_bb.points).toBe(2);

    // 투수 피안타(마이너스): m1 원태인 160, m2 네일 128 → 적은 m2가 상위
    expect(m1.cells.p_h.value).toBe(160);
    expect(m2.cells.p_h.value).toBe(128);
    expect(m2.cells.p_h.points).toBe(2);
    expect(m1.cells.p_h.points).toBe(1);

    // 이닝 합산 (분수 표기가 소수로 정규화되어 있어야 한다)
    expect(m1.cells.p_ip.value).toBeCloseTo(159 + 2 / 3, 8);

    // 리그 총점은 부문수 15 × N(N+1)/2 = 15 × 3 = 45
    expect(m1.totalPoints + m2.totalPoints).toBeCloseTo(45, 10);
  });

  it('같은 표를 다시 넣으면 스탯이 두 배가 되지 않고 갱신된다', () => {
    let snapshot = emptySnapshot(2026);
    snapshot = importTable(snapshot, HITTER_BASIC1, 'hitter');
    const before = snapshot.hitting['김도영'].hr;

    snapshot = importTable(snapshot, HITTER_BASIC1, 'hitter');
    expect(snapshot.hitting['김도영'].hr).toBe(before);
  });

  it('교체 옵션은 해당 역할의 스탯과 채운 항목 기록을 함께 초기화한다', () => {
    let snapshot = emptySnapshot(2026);
    snapshot = importTable(snapshot, HITTER_BASIC1, 'hitter');
    snapshot = importTable(snapshot, HITTER_BASIC2, 'hitter');
    snapshot = importTable(snapshot, PITCHERS, 'pitcher');

    const result = parseStatTable(HITTER_BASIC1, 'hitter');
    snapshot = applyImport(snapshot, result, { replaceExisting: true, now: NOW });

    // 타자는 1번 표 항목만 남는다
    expect(snapshot.importedFields.hitting.sort()).toEqual(['h', 'hr', 'r', 'rbi', 'sb'].sort());
    expect(snapshot.hitting['김도영'].bb).toBe(0);
    // 투수 쪽은 영향 없다
    expect(snapshot.importedFields.pitching.length).toBe(8);
    expect(snapshot.pitching['원태인'].w).toBe(15);
  });
});
