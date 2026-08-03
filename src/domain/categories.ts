/**
 * 로토서리 부문 정의 (클래식 5x5).
 *
 * 부문을 데이터로 선언해두면 산정 엔진은 부문의 의미를 몰라도 된다.
 * 나중에 OPS·홀드·QS 등을 추가하려면 이 배열에만 항목을 넣으면 된다.
 */

import type { HittingLine, PitchingLine } from './types';

export interface TeamTotals {
  hitting: HittingLine;
  pitching: PitchingLine;
}

export interface Category {
  key: string;
  /** 표에 표시할 짧은 이름 */
  label: string;
  /** 부문 설명 (툴팁용) */
  description: string;
  group: 'hitting' | 'pitching';
  /** 평균자책점·WHIP처럼 값이 낮을수록 좋은 부문 */
  lowerIsBetter: boolean;
  /** 팀 합계에서 부문 값을 계산한다. 산정 불가(분모 0)면 null. */
  compute: (totals: TeamTotals) => number | null;
  /** 화면 표시용 서식 */
  format: (value: number) => string;
}

const rate = (digits: number) => (v: number) => v.toFixed(digits);
const whole = (v: number) => String(Math.round(v));

/** 타율 등 .000 형태 (앞의 0을 떼는 야구 관례) */
const battingAverage = (v: number) => v.toFixed(3).replace(/^0\./, '.');

export const DEFAULT_CATEGORIES: Category[] = [
  {
    key: 'hr',
    label: 'HR',
    description: '홈런',
    group: 'hitting',
    lowerIsBetter: false,
    compute: (t) => t.hitting.hr,
    format: whole,
  },
  {
    key: 'rbi',
    label: 'RBI',
    description: '타점',
    group: 'hitting',
    lowerIsBetter: false,
    compute: (t) => t.hitting.rbi,
    format: whole,
  },
  {
    key: 'r',
    label: 'R',
    description: '득점',
    group: 'hitting',
    lowerIsBetter: false,
    compute: (t) => t.hitting.r,
    format: whole,
  },
  {
    key: 'sb',
    label: 'SB',
    description: '도루',
    group: 'hitting',
    lowerIsBetter: false,
    compute: (t) => t.hitting.sb,
    format: whole,
  },
  {
    key: 'avg',
    label: 'AVG',
    description: '팀 타율 = 팀 안타 ÷ 팀 타수',
    group: 'hitting',
    lowerIsBetter: false,
    compute: (t) => (t.hitting.ab > 0 ? t.hitting.h / t.hitting.ab : null),
    format: battingAverage,
  },
  {
    key: 'w',
    label: 'W',
    description: '승',
    group: 'pitching',
    lowerIsBetter: false,
    compute: (t) => t.pitching.w,
    format: whole,
  },
  {
    key: 'sv',
    label: 'SV',
    description: '세이브',
    group: 'pitching',
    lowerIsBetter: false,
    compute: (t) => t.pitching.sv,
    format: whole,
  },
  {
    key: 'so',
    label: 'SO',
    description: '탈삼진',
    group: 'pitching',
    lowerIsBetter: false,
    compute: (t) => t.pitching.so,
    format: whole,
  },
  {
    key: 'era',
    label: 'ERA',
    description: '팀 평균자책점 = 자책점 × 9 ÷ 이닝 (낮을수록 좋음)',
    group: 'pitching',
    lowerIsBetter: true,
    compute: (t) => (t.pitching.ip > 0 ? (t.pitching.er * 9) / t.pitching.ip : null),
    format: rate(2),
  },
  {
    key: 'whip',
    label: 'WHIP',
    description: '팀 WHIP = (피안타 + 볼넷) ÷ 이닝 (낮을수록 좋음)',
    group: 'pitching',
    lowerIsBetter: true,
    compute: (t) =>
      t.pitching.ip > 0 ? (t.pitching.hitsAllowed + t.pitching.bb) / t.pitching.ip : null,
    format: rate(2),
  },
];
