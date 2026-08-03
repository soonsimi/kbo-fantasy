/**
 * 이닝 표기 파싱.
 *
 * 야구 이닝은 표기가 여러 가지라 여기서 한 번에 흡수한다.
 *  - KBO 기록실: "150 1/3", "150 2/3", "150"
 *  - 일부 사이트/엑셀: "150.1", "150.2"  ← 소수점 1자리의 1과 2는 1/3, 2/3를 뜻한다
 *  - 진짜 소수: "150.33"
 *
 * ".1 = 1/3" 관례를 모르고 150.1을 그대로 쓰면 평균자책점·WHIP의 분모가 틀어진다.
 * 소수점 1자리이고 끝자리가 1 또는 2일 때만 3분의 1 표기로 해석하고,
 * 2자리 이상이면 사용자가 의도한 실수로 본다.
 */

const THIRD = 1 / 3;

/** 이닝 문자열을 소수 이닝으로 변환한다. 해석 불가면 null. */
export function parseInnings(raw: string): number | null {
  const s = raw.trim().replace(/,/g, '');
  if (s === '') return null;

  // "150 1/3", "150 2/3", "1/3" 형태
  const fraction = s.match(/^(\d+)?\s*(\d)\s*\/\s*(\d)$/);
  if (fraction) {
    const whole = fraction[1] ? Number(fraction[1]) : 0;
    const numerator = Number(fraction[2]);
    const denominator = Number(fraction[3]);
    if (denominator === 0) return null;
    return whole + numerator / denominator;
  }

  // 유니코드 분수 "150⅓"
  const unicode = s.match(/^(\d+)?\s*([⅓⅔])$/);
  if (unicode) {
    const whole = unicode[1] ? Number(unicode[1]) : 0;
    return whole + (unicode[2] === '⅓' ? THIRD : 2 * THIRD);
  }

  const decimal = s.match(/^(\d+)(?:\.(\d+))?$/);
  if (!decimal) return null;

  const whole = Number(decimal[1]);
  const frac = decimal[2];
  if (frac === undefined) return whole;

  // 소수점 1자리의 .1 / .2 는 야구 관례상 1/3 / 2/3
  if (frac.length === 1) {
    if (frac === '0') return whole;
    if (frac === '1') return whole + THIRD;
    if (frac === '2') return whole + 2 * THIRD;
    // .3~.9 는 관례에 없는 값이므로 실수로 취급
    return whole + Number(`0.${frac}`);
  }

  return whole + Number(`0.${frac}`);
}

/** 소수 이닝을 "150 1/3" 형태로 표시한다. */
export function formatInnings(ip: number): string {
  if (!Number.isFinite(ip) || ip < 0) return '-';
  const whole = Math.floor(ip + 1e-9);
  const remainder = ip - whole;

  if (remainder < 1e-6) return String(whole);
  if (Math.abs(remainder - THIRD) < 0.02) return `${whole} 1/3`;
  if (Math.abs(remainder - 2 * THIRD) < 0.02) return `${whole} 2/3`;
  return ip.toFixed(2);
}
