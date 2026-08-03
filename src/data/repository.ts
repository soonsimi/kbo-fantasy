/**
 * 저장소 인터페이스.
 *
 * 도메인과 UI는 이 인터페이스만 알고, localStorage인지 Firestore인지는 모른다.
 * Firebase 프로젝트가 준비되기 전에도 앱이 돌아가야 하고,
 * 나중에 저장 위치를 바꿀 때 화면 코드를 고치지 않기 위한 경계다.
 */

import type { LeagueSnapshot } from '../domain/types';

export interface LeagueRepository {
  /** 사람이 읽을 수 있는 저장소 이름 (화면에 현재 저장 위치를 표시하기 위함) */
  readonly label: string;

  load(season: number): Promise<LeagueSnapshot | null>;

  save(snapshot: LeagueSnapshot): Promise<void>;

  /**
   * 다른 참가자의 변경을 실시간으로 받는다.
   * 지원하지 않는 구현은 undefined를 반환한다.
   * @returns 구독 해지 함수
   */
  subscribe?(season: number, onChange: (snapshot: LeagueSnapshot) => void): () => void;
}
