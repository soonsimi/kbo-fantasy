/**
 * localStorage 기반 저장소.
 *
 * Firebase 설정 없이 앱을 돌려보기 위한 기본 구현이다.
 * 브라우저 하나에만 저장되므로 참가자끼리 공유되지 않는다.
 * 실제 리그 운영에는 Firestore 구현을 쓴다.
 */

import type { LeagueSnapshot } from '../domain/types';
import type { LeagueRepository } from './repository';

const keyFor = (season: number) => `kbo-fantasy:league:${season}`;

export class LocalLeagueRepository implements LeagueRepository {
  readonly label = '이 브라우저 (localStorage)';

  async load(season: number): Promise<LeagueSnapshot | null> {
    const raw = localStorage.getItem(keyFor(season));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LeagueSnapshot;
    } catch {
      // 저장된 값이 깨졌으면 없는 것으로 취급한다. 덮어쓰기는 save 시점에 일어난다.
      return null;
    }
  }

  async save(snapshot: LeagueSnapshot): Promise<void> {
    localStorage.setItem(keyFor(snapshot.season), JSON.stringify(snapshot));
  }
}
