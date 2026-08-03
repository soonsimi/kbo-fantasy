/**
 * 통합 테스트: 월별 표 붙여넣기 → 드래프트 결과 입력 → 월별/시즌 순위.
 *
 * 화면 없이 실제 파이프라인을 그대로 통과시켜, 항목이 여러 페이지에 나뉘어 있고
 * 기록이 달마다 따로 들어와도 순위 계산까지 올바르게 연결되는지 확인한다.
 */

import { describe, expect, it } from 'vitest';
import { computeMonth, computeSeason } from './domain/season';
import { emptySnapshot, monthKey } from './domain/types';
import type { LeagueSnapshot, MonthKey, PlayerRole } from './domain/types';
import { applyImport } from './import/applyImport';
import type { ImportMode } from './import/applyImport';
import { parseDraft } from './import/parseDraft';
import { parseStatTable } from './import/parseStatTable';

const NOW = '2026-08-01T00:00:00.000Z';
const SEASON = 2026;
const APRIL = monthKey(SEASON, 4);
const MAY = monthKey(SEASON, 5);

/** 4월 타자 기본기록1 */
const APRIL_HITTERS_1 = [
  '순위\t선수명\t팀명\tAB\tR\tH\tHR\tRBI\tSB',
  '1\t김도영\tKIA\t95\t25\t34\t9\t22\t8',
  '2\t구자욱\t삼성\t92\t18\t30\t6\t20\t3',
  '3\t레이예스\t롯데\t98\t14\t33\t2\t18\t1',
  '4\t오스틴\tLG\t96\t17\t29\t5\t23\t2',
].join('\n');

/** 4월 타자 기본기록2 */
const APRIL_HITTERS_2 = [
  '순위\t선수명\t팀명\tBB\tIBB\tSO\tGDP',
  '1\t김도영\tKIA\t12\t0\t17\t1',
  '2\t구자욱\t삼성\t10\t1\t12\t2',
  '3\t레이예스\t롯데\t7\t0\t13\t4',
  '4\t오스틴\tLG\t9\t1\t19\t3',
].join('\n');

/** 4월 투수 */
const APRIL_PITCHERS = [
  '순위\t선수명\t팀명\tW\tL\tSV\tHLD\tIP\tH\tBB\tSO',
  '1\t원태인\t삼성\t3\t1\t0\t0\t30 1/3\t28\t8\t25',
  '2\t네일\tKIA\t2\t2\t0\t0\t28 2/3\t25\t6\t27',
].join('\n');

/** 5월 타자 (4월과 순서를 뒤집어 월별 순위가 달라지게) */
const MAY_HITTERS_1 = [
  '순위\t선수명\t팀명\tR\tH\tHR\tRBI\tSB',
  '1\t레이예스\t롯데\t28\t40\t8\t30\t2',
  '2\t오스틴\tLG\t26\t38\t7\t28\t4',
  '3\t구자욱\t삼성\t15\t26\t3\t16\t1',
  '4\t김도영\tKIA\t12\t22\t2\t14\t3',
].join('\n');

const MAY_HITTERS_2 = [
  '순위\t선수명\t팀명\tBB\tSO\tGDP',
  '1\t레이예스\t롯데\t14\t10\t1',
  '2\t오스틴\tLG\t12\t14\t2',
  '3\t구자욱\t삼성\t8\t16\t4',
  '4\t김도영\tKIA\t6\t21\t5',
].join('\n');

function importTable(
  snapshot: LeagueSnapshot,
  text: string,
  role: PlayerRole,
  month: MonthKey,
  mode: ImportMode = 'monthly',
): LeagueSnapshot {
  const parsed = parseStatTable(text, role);
  expect(parsed.fatal).toBeNull();
  const outcome = applyImport(snapshot, parsed, { month, mode, now: NOW });
  expect(outcome.warnings).toEqual([]);
  return outcome.snapshot;
}

function leagueWithTwoManagers(): LeagueSnapshot {
  const snapshot = emptySnapshot(SEASON);
  snapshot.managers = [
    { id: 'm1', name: '홍길동' },
    { id: 'm2', name: '이몽룡' },
  ];
  return snapshot;
}

describe('월별 부분 임포트', () => {
  it('두 페이지를 이어 넣으면 그 달 타자 8항목이 채워진다', () => {
    let snapshot = leagueWithTwoManagers();

    snapshot = importTable(snapshot, APRIL_HITTERS_1, 'hitter', APRIL);
    expect(snapshot.months[APRIL].importedFields.hitting.sort()).toEqual(
      ['h', 'hr', 'r', 'rbi', 'sb'].sort(),
    );
    expect(snapshot.months[APRIL].hitting['김도영'].bb).toBe(0);

    snapshot = importTable(snapshot, APRIL_HITTERS_2, 'hitter', APRIL);
    expect(snapshot.months[APRIL].importedFields.hitting.sort()).toEqual(
      ['bb', 'gdp', 'h', 'hr', 'r', 'rbi', 'sb', 'so'].sort(),
    );

    // 1번 표 값이 2번 표 반영으로 지워지지 않았는지
    expect(snapshot.months[APRIL].hitting['김도영']).toEqual({
      r: 25,
      h: 34,
      hr: 9,
      rbi: 22,
      sb: 8,
      bb: 12,
      so: 17,
      gdp: 1,
    });
  });

  it('달마다 기록이 독립적으로 저장된다', () => {
    let snapshot = leagueWithTwoManagers();
    snapshot = importTable(snapshot, APRIL_HITTERS_1, 'hitter', APRIL);
    snapshot = importTable(snapshot, MAY_HITTERS_1, 'hitter', MAY);

    expect(snapshot.months[APRIL].hitting['김도영'].hr).toBe(9);
    expect(snapshot.months[MAY].hitting['김도영'].hr).toBe(2);
    expect(Object.keys(snapshot.months).sort()).toEqual([APRIL, MAY]);
  });

  it('누적 모드는 이전 달 합을 빼서 그 달 값을 만든다', () => {
    let snapshot = leagueWithTwoManagers();
    // 4월: 김도영 9홈런
    snapshot = importTable(snapshot, APRIL_HITTERS_1, 'hitter', APRIL);

    // 5월까지 누적 11홈런을 넣으면 5월은 2홈런이 되어야 한다
    const cumulative = [
      '순위\t선수명\t팀명\tR\tH\tHR\tRBI\tSB',
      '1\t김도영\tKIA\t37\t56\t11\t36\t11',
    ].join('\n');

    snapshot = importTable(snapshot, cumulative, 'hitter', MAY, 'cumulative');

    expect(snapshot.months[MAY].hitting['김도영'].hr).toBe(11 - 9);
    expect(snapshot.months[MAY].hitting['김도영'].r).toBe(37 - 25);
    expect(snapshot.months[MAY].hitting['김도영'].h).toBe(56 - 34);
    // 4월은 그대로
    expect(snapshot.months[APRIL].hitting['김도영'].hr).toBe(9);
  });

  it('누적값이 이전 달 합보다 작으면 0으로 처리하고 경고한다', () => {
    let snapshot = leagueWithTwoManagers();
    snapshot = importTable(snapshot, APRIL_HITTERS_1, 'hitter', APRIL);

    // 4월에 이미 9홈런인데 누적 5홈런이 들어오면 모순이다
    const bad = ['선수명\tR\tH\tHR\tRBI\tSB', '김도영\t30\t40\t5\t30\t9'].join('\n');
    const parsed = parseStatTable(bad, 'hitter');
    const outcome = applyImport(snapshot, parsed, { month: MAY, mode: 'cumulative', now: NOW });

    expect(outcome.warnings.join(' ')).toMatch(/누적값이 이전 달 합보다 작습니다/);
    expect(outcome.snapshot.months[MAY].hitting['김도영'].hr).toBe(0);
  });

  it('교체 옵션은 그 달, 그 역할만 초기화한다', () => {
    let snapshot = leagueWithTwoManagers();
    snapshot = importTable(snapshot, APRIL_HITTERS_1, 'hitter', APRIL);
    snapshot = importTable(snapshot, APRIL_HITTERS_2, 'hitter', APRIL);
    snapshot = importTable(snapshot, APRIL_PITCHERS, 'pitcher', APRIL);
    snapshot = importTable(snapshot, MAY_HITTERS_1, 'hitter', MAY);

    const parsed = parseStatTable(APRIL_HITTERS_1, 'hitter');
    snapshot = applyImport(snapshot, parsed, {
      month: APRIL,
      replaceExisting: true,
      now: NOW,
    }).snapshot;

    // 4월 타자는 1번 표 항목만 남는다
    expect(snapshot.months[APRIL].importedFields.hitting.sort()).toEqual(
      ['h', 'hr', 'r', 'rbi', 'sb'].sort(),
    );
    expect(snapshot.months[APRIL].hitting['김도영'].bb).toBe(0);
    // 4월 투수는 그대로
    expect(snapshot.months[APRIL].pitching['원태인'].w).toBe(3);
    // 5월 타자는 그대로
    expect(snapshot.months[MAY].hitting['김도영'].hr).toBe(2);
  });
});

describe('드래프트 결과 입력 → 월별/시즌 순위', () => {
  function fullLeague(): LeagueSnapshot {
    let snapshot = leagueWithTwoManagers();
    snapshot = importTable(snapshot, APRIL_HITTERS_1, 'hitter', APRIL);
    snapshot = importTable(snapshot, APRIL_HITTERS_2, 'hitter', APRIL);
    snapshot = importTable(snapshot, APRIL_PITCHERS, 'pitcher', APRIL);
    snapshot = importTable(snapshot, MAY_HITTERS_1, 'hitter', MAY);
    snapshot = importTable(snapshot, MAY_HITTERS_2, 'hitter', MAY);

    // 오프라인 드래프트 결과를 일괄 입력
    const draft = parseDraft(
      ['홍길동: 김도영, 구자욱, 원태인', '이몽룡: 레이예스, 오스틴, 네일'].join('\n'),
      snapshot.managers,
      snapshot.players,
    );
    expect(draft.conflicts).toEqual([]);
    expect(draft.unknownPlayers).toEqual([]);
    snapshot.rosters = draft.assignments.map((a) => ({
      managerId: a.managerId,
      playerIds: a.playerIds,
    }));

    return snapshot;
  }

  it('4월은 홍길동이 타격에서 앞선다', () => {
    const snapshot = fullLeague();
    const april = computeMonth(snapshot, APRIL);

    const hong = april.rows.find((r) => r.managerId === 'm1')!;
    const lee = april.rows.find((r) => r.managerId === 'm2')!;

    // 홈런: 홍길동 9+6=15, 이몽룡 2+5=7
    expect(hong.cells.b_hr.value).toBe(15);
    expect(lee.cells.b_hr.value).toBe(7);
    expect(hong.cells.b_hr.points).toBe(2);

    // 삼진(마이너스): 홍길동 17+12=29, 이몽룡 13+19=32 → 적은 홍길동이 상위
    expect(hong.cells.b_so.value).toBe(29);
    expect(lee.cells.b_so.value).toBe(32);
    expect(hong.cells.b_so.points).toBe(2);

    // 투수 피안타(마이너스): 원태인 28, 네일 25 → 적은 이몽룡이 상위
    expect(hong.cells.p_h.value).toBe(28);
    expect(lee.cells.p_h.value).toBe(25);
    expect(lee.cells.p_h.points).toBe(2);

    // 이닝 분수 표기가 소수로 정규화되어 합산되는지
    expect(hong.cells.p_ip.value).toBeCloseTo(30 + 1 / 3, 8);
  });

  it('5월은 이몽룡이 앞선다 (달마다 순위가 다르다)', () => {
    const snapshot = fullLeague();
    const may = computeMonth(snapshot, MAY);

    const hong = may.rows.find((r) => r.managerId === 'm1')!;
    const lee = may.rows.find((r) => r.managerId === 'm2')!;

    // 홈런: 홍길동 2+3=5, 이몽룡 8+7=15
    expect(lee.cells.b_hr.value).toBe(15);
    expect(lee.cells.b_hr.points).toBe(2);
    expect(lee.totalPoints).toBeGreaterThan(hong.totalPoints);
  });

  it('시즌 종합은 월별 순위의 합산이다', () => {
    const snapshot = fullLeague();
    const season = computeSeason(snapshot);

    expect(season.scoredMonths).toEqual([APRIL, MAY]);

    const hong = season.rows.find((r) => r.managerId === 'm1')!;
    const lee = season.rows.find((r) => r.managerId === 'm2')!;

    // 4월 1위 / 5월 2위 → 합 3. 반대쪽도 합 3.
    expect(hong.monthlyRanks[APRIL]).toBe(1);
    expect(hong.monthlyRanks[MAY]).toBe(2);
    expect(lee.monthlyRanks[APRIL]).toBe(2);
    expect(lee.monthlyRanks[MAY]).toBe(1);

    expect(hong.rankSum).toBe(3);
    expect(lee.rankSum).toBe(3);
    // 순위 합이 같으므로 공동 1위
    expect(hong.rank).toBe(1);
    expect(lee.rank).toBe(1);

    // 월별 총점 합계도 기록된다 (참고용)
    expect(hong.pointsSum).toBeCloseTo(
      hong.monthlyPoints[APRIL] + hong.monthlyPoints[MAY],
      10,
    );
  });

  it('한 달만 있으면 그 달 순위가 곧 종합 순위다', () => {
    let snapshot = leagueWithTwoManagers();
    snapshot = importTable(snapshot, APRIL_HITTERS_1, 'hitter', APRIL);
    snapshot = importTable(snapshot, APRIL_HITTERS_2, 'hitter', APRIL);
    snapshot.rosters = [
      { managerId: 'm1', playerIds: ['김도영', '구자욱'] },
      { managerId: 'm2', playerIds: ['레이예스', '오스틴'] },
    ];

    const april = computeMonth(snapshot, APRIL);
    const season = computeSeason(snapshot);

    expect(season.rows[0].managerId).toBe(april.rows[0].managerId);
    expect(season.rows[0].rankSum).toBe(1);
  });
});
