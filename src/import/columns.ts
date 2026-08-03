/**
 * 스탯 표의 열 이름 → 도메인 필드 매핑.
 *
 * 같은 약어가 타자표와 투수표에서 다른 뜻을 갖는다:
 *   H → 타자는 안타,   투수는 피안타
 *   R → 타자는 득점,   투수는 실점(자책점이 아님)
 * 그래서 매핑은 반드시 타자/투수 역할별로 분리한다.
 * 역할을 섞어 자동 판별하려 하면 실점을 득점으로 읽는 사고가 난다.
 */

import type { PlayerRole } from '../domain/types';

export type HittingField = 'ab' | 'h' | 'hr' | 'rbi' | 'r' | 'sb';
export type PitchingField = 'ip' | 'er' | 'hitsAllowed' | 'bb' | 'w' | 'sv' | 'so';
export type StatField = HittingField | PitchingField;
export type MetaField = 'name' | 'kboTeam';
export type MappedField = StatField | MetaField;

/** 열 이름 비교용 정규화: 공백·기호 제거 + 대문자화 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/[\s_./\\()[\]-]/g, '')
    .replace(/％/g, '%')
    .toUpperCase();
}

const META_ALIASES: Record<MetaField, string[]> = {
  name: ['선수명', '선수', '이름', '성명', 'NAME', 'PLAYER', 'PLAYERNAME'],
  kboTeam: ['팀명', '팀', '소속', '소속팀', 'TEAM', 'TM'],
};

const HITTING_ALIASES: Record<HittingField, string[]> = {
  ab: ['AB', '타수'],
  h: ['H', '안타', 'HIT', 'HITS'],
  hr: ['HR', '홈런', '홈런수'],
  rbi: ['RBI', '타점'],
  r: ['R', '득점', 'RUN', 'RUNS'],
  sb: ['SB', '도루', '도루성공'],
};

const PITCHING_ALIASES: Record<PitchingField, string[]> = {
  ip: ['IP', '이닝', '투구이닝'],
  er: ['ER', '자책', '자책점'],
  hitsAllowed: ['H', '피안타', 'HIT', 'HITS'],
  bb: ['BB', '볼넷', '사사구'],
  w: ['W', '승', '승리'],
  sv: ['SV', '세', '세이브', 'SAVE'],
  so: ['SO', 'K', 'KK', '삼진', '탈삼진'],
};

/** 역할에 맞는 (정규화된 별칭 → 필드) 사전을 만든다. */
export function aliasTable(role: PlayerRole): Map<string, MappedField> {
  const table = new Map<string, MappedField>();
  const add = (field: MappedField, aliases: string[]) => {
    for (const alias of aliases) table.set(normalizeHeader(alias), field);
  };

  for (const [field, aliases] of Object.entries(META_ALIASES)) {
    add(field as MetaField, aliases);
  }
  const statAliases = role === 'hitter' ? HITTING_ALIASES : PITCHING_ALIASES;
  for (const [field, aliases] of Object.entries(statAliases)) {
    add(field as StatField, aliases);
  }

  return table;
}

/** 해당 역할에서 반드시 있어야 하는 필드 */
export function requiredFields(role: PlayerRole): MappedField[] {
  return role === 'hitter'
    ? ['name', 'ab', 'h', 'hr', 'rbi', 'r', 'sb']
    : ['name', 'ip', 'er', 'hitsAllowed', 'bb', 'w', 'sv', 'so'];
}

/** 화면 안내용 라벨 */
export const FIELD_LABELS: Record<MappedField, string> = {
  name: '선수명',
  kboTeam: '팀',
  ab: '타수(AB)',
  h: '안타(H)',
  hr: '홈런(HR)',
  rbi: '타점(RBI)',
  r: '득점(R)',
  sb: '도루(SB)',
  ip: '이닝(IP)',
  er: '자책점(ER)',
  hitsAllowed: '피안타(H)',
  bb: '볼넷(BB)',
  w: '승(W)',
  sv: '세이브(SV)',
  so: '탈삼진(SO)',
};
