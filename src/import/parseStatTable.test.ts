import { describe, expect, it } from 'vitest';
import { parseNumber, parseStatTable } from './parseStatTable';

const THIRD = 1 / 3;

/** KBO 기록실 타자 기본기록1 — R, H, HR, RBI, SB 를 준다 (BB·SO·GDP는 없다) */
const HITTER_BASIC1 = [
  '순위\t선수명\t팀명\tAVG\tG\tPA\tAB\tR\tH\t2B\t3B\tHR\tTB\tRBI\tSB',
  '1\t김도영\tKIA\t0.347\t141\t625\t544\t143\t189\t29\t10\t38\t363\t109\t40',
  '2\t레이예스\t롯데\t0.352\t144\t622\t574\t89\t202\t34\t2\t15\t285\t111\t3',
].join('\n');

/** KBO 기록실 타자 기본기록2 — BB, SO, GDP 를 준다 */
const HITTER_BASIC2 = [
  '순위\t선수명\t팀명\tAVG\tBB\tIBB\tHBP\tSO\tGDP\tSLG\tOBP\tOPS',
  '1\t김도영\tKIA\t0.347\t66\t2\t9\t97\t7\t0.647\t0.420\t1.067',
  '2\t레이예스\t롯데\t0.352\t39\t1\t5\t76\t18\t0.496\t0.394\t0.890',
].join('\n');

/** KBO 기록실 투수 표 — 이닝이 '159 2/3' 형태로 들어온다 */
const PITCHER_TSV = [
  '순위\t선수명\t팀명\tERA\tG\tW\tL\tSV\tHLD\tWPCT\tIP\tH\tHR\tBB\tHBP\tSO\tR\tER\tWHIP',
  '1\t원태인\t삼성\t3.66\t28\t15\t6\t0\t0\t0.714\t159 2/3\t160\t13\t43\t5\t119\t72\t65\t1.27',
  '2\t정해영\tKIA\t2.49\t54\t2\t4\t31\t0\t0.333\t50 2/3\t45\t3\t18\t2\t42\t16\t14\t1.24',
].join('\n');

describe('parseNumber', () => {
  it('일반적인 표기를 읽는다', () => {
    expect(parseNumber('40')).toBe(40);
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber('3.66')).toBe(3.66);
  });

  it('빈칸과 대시는 null이다', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('-')).toBeNull();
  });
});

describe('parseStatTable — 타자', () => {
  it('기본기록1에서 R·H·HR·RBI·SB를 읽고 나머지는 없다고 보고한다', () => {
    const result = parseStatTable(HITTER_BASIC1, 'hitter');

    expect(result.fatal).toBeNull();
    expect(result.rows).toHaveLength(2);
    expect(result.providedFields.sort()).toEqual(['h', 'hr', 'r', 'rbi', 'sb'].sort());
    expect(result.absentFields.sort()).toEqual(['bb', 'gdp', 'so'].sort());

    expect(result.rows[0].name).toBe('김도영');
    expect(result.rows[0].stats).toEqual({ r: 143, h: 189, hr: 38, rbi: 109, sb: 40 });
  });

  it('기본기록2에서 BB·SO·GDP를 읽는다', () => {
    const result = parseStatTable(HITTER_BASIC2, 'hitter');

    expect(result.fatal).toBeNull();
    expect(result.providedFields.sort()).toEqual(['bb', 'gdp', 'so'].sort());
    expect(result.rows[0].stats).toEqual({ bb: 66, so: 97, gdp: 7 });
  });

  it('부문에 쓰지 않는 열은 무시한다', () => {
    const result = parseStatTable(HITTER_BASIC1, 'hitter');
    // AB는 이제 어떤 부문에도 쓰이지 않는다
    expect(result.unmappedHeaders).toContain('AB');
    expect(result.unmappedHeaders).toContain('AVG');
    expect(result.unmappedHeaders).toContain('2B');
  });

  it('IBB를 볼넷으로 오인하지 않는다', () => {
    const result = parseStatTable(HITTER_BASIC2, 'hitter');
    expect(result.rows[0].stats.bb).toBe(66); // IBB 2 가 아니다
    expect(result.unmappedHeaders).toContain('IBB');
  });
});

describe('parseStatTable — 투수', () => {
  it('W·L·SV·HLD·IP·H·BB·SO를 모두 읽는다', () => {
    const result = parseStatTable(PITCHER_TSV, 'pitcher');

    expect(result.fatal).toBeNull();
    expect(result.absentFields).toEqual([]);

    const won = result.rows[0];
    expect(won.name).toBe('원태인');
    expect(won.stats.ip).toBeCloseTo(159 + 2 * THIRD, 10);
    expect(won.stats.w).toBe(15);
    expect(won.stats.l).toBe(6);
    expect(won.stats.sv).toBe(0);
    expect(won.stats.hld).toBe(0);
    expect(won.stats.hitsAllowed).toBe(160);
    expect(won.stats.bb).toBe(43);
    expect(won.stats.so).toBe(119);
  });

  it('세이브와 홀드를 별도로 보관한다 (부문에서 합산)', () => {
    const result = parseStatTable(PITCHER_TSV, 'pitcher');
    const closer = result.rows[1];
    expect(closer.name).toBe('정해영');
    expect(closer.stats.sv).toBe(31);
    expect(closer.stats.hld).toBe(0);
  });

  it('투수표의 H는 피안타로 넣고 R(실점)·ER은 쓰지 않는다', () => {
    const result = parseStatTable(PITCHER_TSV, 'pitcher');
    expect(result.rows[0].stats.hitsAllowed).toBe(160);
    expect(result.unmappedHeaders).toContain('R');
    expect(result.unmappedHeaders).toContain('ER');
    expect(result.unmappedHeaders).toContain('ERA');
  });

  it('HLD 대신 홀드라는 한글 머리글도 인식한다', () => {
    const tsv = [
      '선수명\t팀\t승\t패\t세이브\t홀드\t이닝\t피안타\t볼넷\t탈삼진',
      '정해영\tKIA\t2\t4\t31\t0\t50 2/3\t45\t18\t42',
    ].join('\n');
    const result = parseStatTable(tsv, 'pitcher');
    expect(result.absentFields).toEqual([]);
    expect(result.rows[0].stats.sv).toBe(31);
    expect(result.rows[0].stats.hld).toBe(0);
  });
});

describe('parseStatTable — 입력 형태 대응', () => {
  it('CSV도 읽는다', () => {
    const csv = ['선수명,팀명,R,H,HR,RBI,SB', '김도영,KIA,143,189,38,109,40'].join('\n');
    const result = parseStatTable(csv, 'hitter');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].stats.hr).toBe(38);
  });

  it('표 앞에 붙은 제목 줄을 건너뛰고 머리글을 찾는다', () => {
    const tsv = ['2026 KBO 정규시즌 타자 기록', '기준일: 2026-08-01', HITTER_BASIC1].join('\n');
    const result = parseStatTable(tsv, 'hitter');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe('김도영');
  });

  it('합계 행은 데이터에서 제외한다', () => {
    const tsv = [HITTER_BASIC1, '\t합계\t\t0.300\t\t\t1602\t232\t391\t\t\t53\t\t220\t43'].join('\n');
    const result = parseStatTable(tsv, 'hitter');
    expect(result.rows.map((r) => r.name)).not.toContain('합계');
    expect(result.rows).toHaveLength(2);
  });

  it('빈 칸은 0으로 덮어쓰지 않고 건드리지 않는다', () => {
    const tsv = ['선수명\tR\tH\tHR\tRBI\tSB', '김도영\t143\t\t38\t109\t40'].join('\n');
    const result = parseStatTable(tsv, 'hitter');
    expect(result.rows[0].stats.r).toBe(143);
    expect(result.rows[0].stats).not.toHaveProperty('h');
  });

  it('선수명 열이 없으면 반영 불가로 알린다', () => {
    const tsv = ['R\tH\tHR\tRBI\tSB', '143\t189\t38\t109\t40'].join('\n');
    const result = parseStatTable(tsv, 'hitter');
    expect(result.fatal).toMatch(/선수명/);
    expect(result.rows).toEqual([]);
  });

  it('쓸 수 있는 스탯 열이 하나도 없으면 반영 불가로 알린다', () => {
    const tsv = ['선수명\t팀명\tAVG\tOPS', '김도영\tKIA\t0.347\t1.067'].join('\n');
    const result = parseStatTable(tsv, 'hitter');
    expect(result.fatal).toMatch(/스탯 열이 하나도 없습니다/);
  });

  it('동명이인이 서로 다른 팀으로 나오면 경고한다', () => {
    const tsv = [
      '선수명\t팀명\tR\tH\tHR\tRBI\tSB',
      '김민\tLG\t12\t30\t3\t15\t2',
      '김민\t한화\t8\t20\t1\t9\t1',
    ].join('\n');
    const result = parseStatTable(tsv, 'hitter');
    expect(result.warnings.join(' ')).toMatch(/동명이인/);
  });

  it('빈 입력은 예외 없이 반영 불가로 처리한다', () => {
    const result = parseStatTable('   ', 'hitter');
    expect(result.rows).toEqual([]);
    expect(result.fatal).toBeTruthy();
  });
});
