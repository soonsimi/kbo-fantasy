/**
 * 판타지 리그 도메인 타입.
 *
 * 설계 원칙: 저장하는 것은 "누적 원시 스탯"뿐이다.
 * 부문 값은 팀 합계에서 매번 계산한다 (categories.ts).
 *
 * 현재 부문 구성은 전부 누적 카운팅 스탯이라 팀 값은 단순 합이다.
 * 나중에 타율·평균자책점처럼 비율 부문을 넣을 때는 분모(AB, IP)까지 합산한 뒤
 * 나눠야 한다. 선수별 비율을 평균내면 틀린다 — 타율 .400인 10타수 선수와
 * .250인 500타수 선수의 팀 타율은 .325가 아니라 .253이다.
 */

export type PlayerId = string;
export type ManagerId = string;

export type PlayerRole = 'hitter' | 'pitcher';

export interface Player {
  id: PlayerId;
  /** 선수명 */
  name: string;
  /** 소속 KBO 구단 (예: 'LG', '두산') */
  kboTeam: string;
  role: PlayerRole;
}

/** 타자 누적 원시 스탯 */
export interface HittingLine {
  /** 득점 */
  r: number;
  /** 안타 */
  h: number;
  /** 홈런 */
  hr: number;
  /** 타점 */
  rbi: number;
  /** 도루 */
  sb: number;
  /** 볼넷 */
  bb: number;
  /** 삼진 */
  so: number;
  /** 병살타 */
  gdp: number;
}

/** 투수 누적 원시 스탯. ip는 소수 이닝(1/3 = 0.333…)으로 정규화해서 보관한다. */
export interface PitchingLine {
  /** 승 */
  w: number;
  /** 패 */
  l: number;
  /** 세이브 */
  sv: number;
  /** 홀드 */
  hld: number;
  /** 이닝 (소수 정규화) */
  ip: number;
  /** 피안타 */
  hitsAllowed: number;
  /** 볼넷 */
  bb: number;
  /** 탈삼진 */
  so: number;
}

export type HittingField = keyof HittingLine;
export type PitchingField = keyof PitchingLine;
export type StatField = HittingField | PitchingField;

/** 리그 참가자 */
export interface Manager {
  id: ManagerId;
  name: string;
}

/** 드래프트 결과 = 참가자별 보유 선수 목록 */
export interface Roster {
  managerId: ManagerId;
  playerIds: PlayerId[];
}

/**
 * 리그의 전체 상태 스냅샷.
 * 저장소(localStorage / Firestore)가 읽고 쓰는 단위이며,
 * 순위 계산은 이 스냅샷만 입력으로 받는 순수 함수다.
 */
export interface LeagueSnapshot {
  season: number;
  /** 스탯을 마지막으로 갱신한 시각 (ISO 8601) */
  statsUpdatedAt: string | null;
  managers: Manager[];
  rosters: Roster[];
  players: Record<PlayerId, Player>;
  hitting: Record<PlayerId, HittingLine>;
  pitching: Record<PlayerId, PitchingLine>;
  /**
   * 지금까지 임포트로 채운 스탯 필드.
   *
   * 필요한 항목이 여러 페이지에 나뉘어 있어 표를 여러 번 넣어야 하는데,
   * 값이 0인 것과 아직 안 넣은 것을 구별할 방법이 없으면
   * "GDP를 넣었는지" 를 화면에서 알려줄 수 없다.
   */
  importedFields: {
    hitting: HittingField[];
    pitching: PitchingField[];
  };
}

export function emptySnapshot(season: number): LeagueSnapshot {
  return {
    season,
    statsUpdatedAt: null,
    managers: [],
    rosters: [],
    players: {},
    hitting: {},
    pitching: {},
    importedFields: { hitting: [], pitching: [] },
  };
}

export const EMPTY_HITTING: HittingLine = {
  r: 0,
  h: 0,
  hr: 0,
  rbi: 0,
  sb: 0,
  bb: 0,
  so: 0,
  gdp: 0,
};

export const EMPTY_PITCHING: PitchingLine = {
  w: 0,
  l: 0,
  sv: 0,
  hld: 0,
  ip: 0,
  hitsAllowed: 0,
  bb: 0,
  so: 0,
};

export const HITTING_FIELDS: readonly HittingField[] = Object.keys(
  EMPTY_HITTING,
) as HittingField[];

export const PITCHING_FIELDS: readonly PitchingField[] = Object.keys(
  EMPTY_PITCHING,
) as PitchingField[];
