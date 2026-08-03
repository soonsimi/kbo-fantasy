/**
 * 판타지 리그 도메인 타입.
 *
 * 설계 원칙: 저장하는 것은 "누적 원시 스탯"뿐이다.
 * 타율·평균자책점·WHIP 같은 비율 스탯은 저장하지 않고 팀 합계에서 매번 계산한다.
 * 선수별 비율 스탯을 평균내면 로토서리 산정이 틀리기 때문이다.
 * (타율 .400인 10타석 선수와 .250인 500타석 선수의 팀 타율은 두 값의 평균이 아니다.)
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

/** 타자 누적 원시 스탯. 비율 스탯 산출에 필요한 분모(AB)를 반드시 포함한다. */
export interface HittingLine {
  /** 타수 */
  ab: number;
  /** 안타 */
  h: number;
  /** 홈런 */
  hr: number;
  /** 타점 */
  rbi: number;
  /** 득점 */
  r: number;
  /** 도루 */
  sb: number;
}

/** 투수 누적 원시 스탯. ip는 소수 이닝(1/3 = 0.333…)으로 정규화해서 보관한다. */
export interface PitchingLine {
  /** 이닝 (소수 정규화) */
  ip: number;
  /** 자책점 */
  er: number;
  /** 피안타 */
  hitsAllowed: number;
  /** 볼넷 (사구 제외) */
  bb: number;
  /** 승 */
  w: number;
  /** 세이브 */
  sv: number;
  /** 탈삼진 */
  so: number;
}

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
  };
}

export const EMPTY_HITTING: HittingLine = { ab: 0, h: 0, hr: 0, rbi: 0, r: 0, sb: 0 };

export const EMPTY_PITCHING: PitchingLine = {
  ip: 0,
  er: 0,
  hitsAllowed: 0,
  bb: 0,
  w: 0,
  sv: 0,
  so: 0,
};
