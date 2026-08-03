/**
 * 로토서리 부문 정의.
 *
 * 타자 8부문: R, H, HR, RBI, SB, BB, SO(−), GDP(−)
 * 투수 7부문: W, L(−), SV+HLD, IP, H(−), BB(−), SO
 *
 * lowerIsBetter: true 인 부문은 값이 작을수록 상위 순위를 받는다.
 * (타자 삼진·병살타, 투수 패전·피안타·볼넷처럼 적어야 좋은 항목)
 *
 * 주의: H는 타자에게는 안타(플러스), 투수에게는 피안타(마이너스)다.
 * BB도 타자는 플러스, 투수는 마이너스다.
 *
 * 부문을 데이터로 선언해두면 산정 엔진은 부문의 의미를 몰라도 되고,
 * sourceFields 덕분에 "임포트에 필요한 열"도 이 배열에서 자동으로 도출된다.
 * 부문을 추가·삭제하려면 이 파일만 고치면 된다.
 */

import { formatInnings } from './innings';
import type { HittingLine, PitchingLine, StatField } from './types';

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
  /** 값이 낮을수록 좋은 부문 */
  lowerIsBetter: boolean;
  /** 이 부문을 계산하는 데 필요한 원시 스탯 필드 */
  sourceFields: readonly StatField[];
  /** 팀 합계에서 부문 값을 계산한다. 산정 불가(분모 0 등)면 null. */
  compute: (totals: TeamTotals) => number | null;
  /** 화면 표시용 서식 */
  format: (value: number) => string;
}

const whole = (v: number) => String(Math.round(v));

export const DEFAULT_CATEGORIES: Category[] = [
  // --- 타자 8부문 ---
  {
    key: 'b_r',
    label: 'R',
    description: '득점',
    group: 'hitting',
    lowerIsBetter: false,
    sourceFields: ['r'],
    compute: (t) => t.hitting.r,
    format: whole,
  },
  {
    key: 'b_h',
    label: 'H',
    description: '안타',
    group: 'hitting',
    lowerIsBetter: false,
    sourceFields: ['h'],
    compute: (t) => t.hitting.h,
    format: whole,
  },
  {
    key: 'b_hr',
    label: 'HR',
    description: '홈런',
    group: 'hitting',
    lowerIsBetter: false,
    sourceFields: ['hr'],
    compute: (t) => t.hitting.hr,
    format: whole,
  },
  {
    key: 'b_rbi',
    label: 'RBI',
    description: '타점',
    group: 'hitting',
    lowerIsBetter: false,
    sourceFields: ['rbi'],
    compute: (t) => t.hitting.rbi,
    format: whole,
  },
  {
    key: 'b_sb',
    label: 'SB',
    description: '도루',
    group: 'hitting',
    lowerIsBetter: false,
    sourceFields: ['sb'],
    compute: (t) => t.hitting.sb,
    format: whole,
  },
  {
    key: 'b_bb',
    label: 'BB',
    description: '볼넷',
    group: 'hitting',
    lowerIsBetter: false,
    sourceFields: ['bb'],
    compute: (t) => t.hitting.bb,
    format: whole,
  },
  {
    key: 'b_so',
    label: 'SO',
    description: '삼진 — 적을수록 상위',
    group: 'hitting',
    lowerIsBetter: true,
    sourceFields: ['so'],
    compute: (t) => t.hitting.so,
    format: whole,
  },
  {
    key: 'b_gdp',
    label: 'GDP',
    description: '병살타 — 적을수록 상위',
    group: 'hitting',
    lowerIsBetter: true,
    sourceFields: ['gdp'],
    compute: (t) => t.hitting.gdp,
    format: whole,
  },

  // --- 투수 7부문 ---
  {
    key: 'p_w',
    label: 'W',
    description: '승',
    group: 'pitching',
    lowerIsBetter: false,
    sourceFields: ['w'],
    compute: (t) => t.pitching.w,
    format: whole,
  },
  {
    key: 'p_l',
    label: 'L',
    description: '패 — 적을수록 상위',
    group: 'pitching',
    lowerIsBetter: true,
    sourceFields: ['l'],
    compute: (t) => t.pitching.l,
    format: whole,
  },
  {
    key: 'p_svhld',
    label: 'SV+HLD',
    description: '세이브 + 홀드',
    group: 'pitching',
    lowerIsBetter: false,
    sourceFields: ['sv', 'hld'],
    compute: (t) => t.pitching.sv + t.pitching.hld,
    format: whole,
  },
  {
    key: 'p_ip',
    label: 'IP',
    description: '이닝',
    group: 'pitching',
    lowerIsBetter: false,
    sourceFields: ['ip'],
    compute: (t) => t.pitching.ip,
    format: formatInnings,
  },
  {
    key: 'p_h',
    label: 'H',
    description: '피안타 — 적을수록 상위',
    group: 'pitching',
    lowerIsBetter: true,
    sourceFields: ['hitsAllowed'],
    compute: (t) => t.pitching.hitsAllowed,
    format: whole,
  },
  {
    key: 'p_bb',
    label: 'BB',
    description: '볼넷 — 적을수록 상위',
    group: 'pitching',
    lowerIsBetter: true,
    sourceFields: ['bb'],
    compute: (t) => t.pitching.bb,
    format: whole,
  },
  {
    key: 'p_so',
    label: 'SO',
    description: '탈삼진',
    group: 'pitching',
    lowerIsBetter: false,
    sourceFields: ['so'],
    compute: (t) => t.pitching.so,
    format: whole,
  },
];

/** 활성 부문이 필요로 하는 원시 스탯 필드 목록 (역할별) */
export function neededFields(
  group: 'hitting' | 'pitching',
  categories: Category[] = DEFAULT_CATEGORIES,
): StatField[] {
  const fields = new Set<StatField>();
  for (const category of categories) {
    if (category.group !== group) continue;
    for (const field of category.sourceFields) fields.add(field);
  }
  return [...fields];
}
