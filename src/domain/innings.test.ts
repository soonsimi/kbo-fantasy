import { describe, expect, it } from 'vitest';
import { formatInnings, parseInnings } from './innings';

const THIRD = 1 / 3;

describe('parseInnings', () => {
  it('KBO 기록실의 분수 표기를 읽는다', () => {
    expect(parseInnings('150')).toBe(150);
    expect(parseInnings('150 1/3')).toBeCloseTo(150 + THIRD, 10);
    expect(parseInnings('150 2/3')).toBeCloseTo(150 + 2 * THIRD, 10);
    expect(parseInnings('1/3')).toBeCloseTo(THIRD, 10);
  });

  it('소수점 1자리의 .1 / .2 는 야구 관례대로 3분의 1로 해석한다', () => {
    expect(parseInnings('150.1')).toBeCloseTo(150 + THIRD, 10);
    expect(parseInnings('150.2')).toBeCloseTo(150 + 2 * THIRD, 10);
    expect(parseInnings('150.0')).toBe(150);
  });

  it('소수점 2자리 이상은 실수 그대로 본다', () => {
    expect(parseInnings('150.33')).toBeCloseTo(150.33, 10);
    expect(parseInnings('150.67')).toBeCloseTo(150.67, 10);
  });

  it('유니코드 분수와 쉼표를 처리한다', () => {
    expect(parseInnings('150⅓')).toBeCloseTo(150 + THIRD, 10);
    expect(parseInnings('1,150')).toBe(1150);
  });

  it('해석할 수 없으면 null을 돌려준다', () => {
    expect(parseInnings('')).toBeNull();
    expect(parseInnings('-')).toBeNull();
    expect(parseInnings('abc')).toBeNull();
    expect(parseInnings('150 1/0')).toBeNull();
  });
});

describe('formatInnings', () => {
  it('소수 이닝을 분수 표기로 되돌린다', () => {
    expect(formatInnings(150)).toBe('150');
    expect(formatInnings(150 + THIRD)).toBe('150 1/3');
    expect(formatInnings(150 + 2 * THIRD)).toBe('150 2/3');
  });

  it('합산으로 생긴 누적 오차를 흡수한다', () => {
    // 1/3 이닝을 세 번 더하면 1이 되어야 한다
    expect(formatInnings(THIRD * 3)).toBe('1');
    // 1/3 이닝 4번 = 1과 1/3
    expect(formatInnings(THIRD * 4)).toBe('1 1/3');
  });
});
