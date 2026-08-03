/**
 * 판타지 리그 도메인 타입.
 *
 * 설계 원칙 1: 저장하는 것은 "누적 원시 스탯"뿐이다.
 * 부문 값은 팀 합계에서 매번 계산한다 (categories.ts).
 *
 * 설계 원칙 2: 스탯은 **월별로** 저장한다.
 * 순위 산정이 월 단위이고 시즌 총 순위가 월별 순위의 합산이므로,
 * 시즌 누적만 갖고 있으면 월별 순위를 되돌려 계산할 수 없다.
 *
 * 현재 부문 구성은 전부 누적 카운팅 스탯이라 팀 값은 단순 합이다.
 * 나중에 타율·평균자책점처럼 비율 부문을 넣을 때는 분모(AB, IP)까지 합산한 뒤
 * 나눠야 한다. 선수별 비율을 평균내면 틀린다 — 타율 .400인 10타수 선수와
 * .250인 500타수 선수의 팀 타율은 .325가 아니라 .253이다.
 */

export type PlayerId = string;
export type ManagerId = string;

/** 'YYYY-MM' 형식의 월 식별자 */
export type MonthKey = string;

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

/** 오프라인 드래프트 결과 = 참가자별 보유 선수 목록 */
export interface Roster {
  managerId: ManagerId;
  playerIds: PlayerId[];
}

/** 한 달치 기록 */
export interface MonthlyStats {
  hitting: Record<PlayerId, HittingLine>;
  pitching: Record<PlayerId, PitchingLine>;
  /**
   * 이 달에 임포트로 채운 스탯 필드.
   *
   * 값이 0인 것과 아직 안 넣은 것을 구별하기 위해 필요하다.
   * 안 넣은 부문은 전원 0이 되어 그 달 순위가 무의미해진다.
   */
  importedFields: {
    hitting: HittingField[];
    pitching: PitchingField[];
  };
  updatedAt: string | null;
}

export function emptyMonth(): MonthlyStats {
  return {
    hitting: {},
    pitching: {},
    importedFields: { hitting: [], pitching: [] },
    updatedAt: null,
  };
}

/**
 * 리그의 전체 상태 스냅샷.
 * 저장소(localStorage / Firestore)가 읽고 쓰는 단위이며,
 * 순위 계산은 이 스냅샷만 입력으로 받는 순수 함수다.
 */
export interface LeagueSnapshot {
  season: number;
  managers: Manager[];
  rosters: Roster[];
  players: Record<PlayerId, Player>;
  /** 월별 기록. 키는 'YYYY-MM' */
  months: Record<MonthKey, MonthlyStats>;
}

export function emptySnapshot(season: number): LeagueSnapshot {
  return {
    season,
    managers: [],
    rosters: [],
    players: {},
    months: {},
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

/** KBO 정규시즌이 걸쳐 있는 달 (3월 말 개막 ~ 10월 초 종료) */
export const SEASON_MONTHS: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 10];

export function monthKey(season: number, month: number): MonthKey {
  return `${season}-${String(month).padStart(2, '0')}`;
}

/** 'YYYY-MM' → 4 */
export function monthNumber(key: MonthKey): number {
  return Number(key.slice(5, 7));
}

export function monthLabel(key: MonthKey): string {
  return `${monthNumber(key)}월`;
}

/** 시즌의 모든 월 키를 시간 순으로 */
export function seasonMonthKeys(season: number): MonthKey[] {
  return SEASON_MONTHS.map((m) => monthKey(season, m));
}
