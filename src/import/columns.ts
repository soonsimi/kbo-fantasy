/**
 * 스탯 표의 열 이름 → 도메인 필드 매핑.
 *
 * 같은 약어가 타자표와 투수표에서 다른 뜻을 갖는다:
 *   H → 타자는 안타,   투수는 피안타
 *   BB → 둘 다 볼넷이지만 타자에겐 플러스, 투수에겐 마이너스 부문
 *   SO → 타자는 삼진(마이너스), 투수는 탈삼진(플러스)
 * 그래서 매핑은 반드시 타자/투수 역할별로 분리한다.
 * 역할을 자동 판별하려 하면 피안타를 안타로 읽는 사고가 난다.
 *
 * 투수 홀드는 'HLD'/'HOLD'만 인식한다. 'H'를 홀드로 붙이면 피안타와 충돌한다.
 */

import { neededFields } from '../domain/categories';
import type { PlayerRole, StatField } from '../domain/types';

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

const HITTING_ALIASES: Record<string, string[]> = {
  r: ['R', '득점', 'RUN', 'RUNS'],
  h: ['H', '안타', 'HIT', 'HITS'],
  hr: ['HR', '홈런', '홈런수'],
  rbi: ['RBI', '타점'],
  sb: ['SB', '도루', '도루성공'],
  bb: ['BB', '볼넷'],
  so: ['SO', 'K', 'KK', '삼진'],
  gdp: ['GDP', 'GIDP', 'DP', '병살', '병살타'],
};

const PITCHING_ALIASES: Record<string, string[]> = {
  w: ['W', '승', '승리'],
  l: ['L', '패', '패전'],
  sv: ['SV', 'S', '세', '세이브', 'SAVE'],
  hld: ['HLD', 'HOLD', 'HD', '홀드'],
  ip: ['IP', '이닝', '투구이닝'],
  hitsAllowed: ['H', '피안타', 'HIT', 'HITS'],
  bb: ['BB', '볼넷'],
  so: ['SO', 'K', 'KK', '탈삼진', '삼진'],
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

/**
 * 해당 역할의 부문 산정에 필요한 스탯 필드.
 * 부문 정의(categories.ts)에서 도출하므로 부문을 바꾸면 자동으로 따라온다.
 */
export function statFieldsFor(role: PlayerRole): StatField[] {
  return neededFields(role === 'hitter' ? 'hitting' : 'pitching');
}

const HITTING_LABELS: Record<string, string> = {
  r: '득점(R)',
  h: '안타(H)',
  hr: '홈런(HR)',
  rbi: '타점(RBI)',
  sb: '도루(SB)',
  bb: '볼넷(BB)',
  so: '삼진(SO)',
  gdp: '병살타(GDP)',
};

const PITCHING_LABELS: Record<string, string> = {
  w: '승(W)',
  l: '패(L)',
  sv: '세이브(SV)',
  hld: '홀드(HLD)',
  ip: '이닝(IP)',
  hitsAllowed: '피안타(H)',
  bb: '볼넷(BB)',
  so: '탈삼진(SO)',
};

/** 화면 안내용 라벨. H·BB·SO는 역할에 따라 뜻이 달라 role이 필요하다. */
export function fieldLabel(field: MappedField, role: PlayerRole): string {
  if (field === 'name') return '선수명';
  if (field === 'kboTeam') return '팀';
  const labels = role === 'hitter' ? HITTING_LABELS : PITCHING_LABELS;
  return labels[field] ?? field;
}
