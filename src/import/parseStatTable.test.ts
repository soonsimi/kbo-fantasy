import { describe, expect, it } from 'vitest';
import { parseNumber, parseStatTable } from './parseStatTable';

const THIRD = 1 / 3;

/** KBO 기록실 타자 표를 복사했을 때의 형태 (탭 구분) */
const HITTER_TSV = [
  '순위\t선수명\t팀명\tAVG\tG\tPA\tAB\tR\tH\t2B\t3B\tHR\tTB\tRBI\tSB',
  '1\t김도영\tKIA\t0.347\t141\t625\t544\t143\t189\t29\t10\t38\t363\t109\t40',
  '2\t레이예스\t롯데\t0.352\t144\t622\t574\t89\t202\t34\t2\t15\t285\t111\t3',
  '3\t구자욱\t삼성\t0.343\t129\t558\t484\t92\t166\t39\t1\t33\t306\t115\t13',
].join('\n');

/** KBO 기록실 투수 표. 이닝이 '159 2/3' 형태로 들어온다. */
const PITCHER_TSV = [
  '순위\t선수명\t팀명\tERA\tG\tW\tL\tSV\tHLD\tWPCT\tIP\tH\tHR\tBB\tHBP\tSO\tR\tER\tWHIP',
  '1\t원태인\t삼성\t3.66\t28\t15\t6\t0\t0\t0.714\t159 2/3\t160\t13\t43\t5\t119\t72\t65\t1.27',
  '2\t네일\tKIA\t2.53\t26\t12\t5\t0\t0\t0.706\t149 1/3\t128\t7\t35\t9\t122\t46\t42\t1.09',
].join('\n');

describe('parseNumber', () => {
  it('일반적인 표기를 읽는다', () => {
    expect(parseNumber('40')).toBe(40);
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber('3.66')).toBe(3.66);
  });

  it('앞의 0을 생략한 타율 표기를 읽는다', () => {
    expect(parseNumber('.347')).toBeCloseTo(0.347, 10);
  });

  it('빈칸과 대시는 null이다', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('  ')).toBeNull();
    expect(parseNumber('-')).toBeNull();
  });
});

describe('parseStatTable — 타자', () => {
  it('필요한 열만 골라 읽고 나머지는 무시한다', () => {
    const result = parseStatTable(HITTER_TSV, 'hitter');

    expect(result.missingFields).toEqual([]);
    expect(result.rows).toHaveLength(3);

    const kim = result.rows[0];
    expect(kim.name).toBe('김도영');
    expect(kim.kboTeam).toBe('KIA');
    expect(kim.hitting).toEqual({ ab: 544, h: 189, hr: 38, rbi: 109, r: 143, sb: 40 });
    expect(kim.pitching).toBeNull();

    // AVG·G·PA·2B·3B·TB 는 쓰지 않는 열
    expect(result.unmappedHeaders).toContain('AVG');
    expect(result.unmappedHeaders).toContain('2B');
  });

  it('필수 열이 빠지면 알려준다', () => {
    const tsv = ['선수명\t팀명\tHR\tRBI', '김도영\tKIA\t38\t109'].join('\n');
    const result = parseStatTable(tsv, 'hitter');
    expect(result.missingFields).toContain('ab');
    expect(result.missingFields).toContain('sb');
    expect(result.missingFields).not.toContain('hr');
  });
});

describe('parseStatTable — 투수', () => {
  it('이닝 분수 표기를 소수로 정규화한다', () => {
    const result = parseStatTable(PITCHER_TSV, 'pitcher');

    expect(result.missingFields).toEqual([]);
    expect(result.rows).toHaveLength(2);

    const won = result.rows[0];
    expect(won.name).toBe('원태인');
    expect(won.pitching!.ip).toBeCloseTo(159 + 2 * THIRD, 10);
    expect(won.pitching!.er).toBe(65);
    expect(won.pitching!.hitsAllowed).toBe(160);
    expect(won.pitching!.bb).toBe(43);
    expect(won.pitching!.so).toBe(119);
    expect(won.pitching!.w).toBe(15);
    expect(won.hitting).toBeNull();
  });

  it('투수표의 H는 피안타로, R은 무시로 처리한다', () => {
    const result = parseStatTable(PITCHER_TSV, 'pitcher');
    // H(160)를 안타로 오해하지 않고 피안타에 넣었는지
    expect(result.rows[0].pitching!.hitsAllowed).toBe(160);
    // R(실점 72)은 어떤 필드에도 들어가지 않아야 한다 — 자책점은 ER(65)
    expect(result.rows[0].pitching!.er).toBe(65);
    expect(result.unmappedHeaders).toContain('R');
  });
});

describe('parseStatTable — 입력 형태 대응', () => {
  it('CSV도 읽는다', () => {
    const csv = ['선수명,팀명,AB,H,HR,RBI,R,SB', '김도영,KIA,544,189,38,109,143,40'].join('\n');
    const result = parseStatTable(csv, 'hitter');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].hitting!.hr).toBe(38);
  });

  it('표 앞에 붙은 제목 줄을 건너뛰고 머리글을 찾는다', () => {
    const tsv = ['2026 KBO 정규시즌 타자 기록', '기준일: 2026-08-01', HITTER_TSV].join('\n');
    const result = parseStatTable(tsv, 'hitter');
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].name).toBe('김도영');
  });

  it('합계 행은 데이터에서 제외한다', () => {
    const tsv = [HITTER_TSV, '\t합계\t\t0.300\t\t\t1602\t324\t557\t\t\t86\t\t335\t56'].join('\n');
    const result = parseStatTable(tsv, 'hitter');
    expect(result.rows.map((r) => r.name)).not.toContain('합계');
    expect(result.rows).toHaveLength(3);
  });

  it('영어 머리글도 인식한다', () => {
    const tsv = ['Player\tTeam\tAB\tH\tHR\tRBI\tR\tSB', 'Kim Do-young\tKIA\t544\t189\t38\t109\t143\t40'].join(
      '\n',
    );
    const result = parseStatTable(tsv, 'hitter');
    expect(result.missingFields).toEqual([]);
    expect(result.rows[0].name).toBe('Kim Do-young');
  });

  it('동명이인이 서로 다른 팀으로 나오면 경고한다', () => {
    const tsv = [
      '선수명\t팀명\tAB\tH\tHR\tRBI\tR\tSB',
      '김민\tLG\t100\t30\t3\t15\t12\t2',
      '김민\t한화\t80\t20\t1\t9\t8\t1',
    ].join('\n');
    const result = parseStatTable(tsv, 'hitter');
    expect(result.warnings.join(' ')).toMatch(/동명이인/);
  });

  it('빈 입력은 예외 없이 경고로 처리한다', () => {
    const result = parseStatTable('   ', 'hitter');
    expect(result.rows).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
