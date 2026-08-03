/**
 * Firestore 전송 형식 변환.
 *
 * 도메인에서는 선수 스탯을 `Record<선수명, 스탯>` 맵으로 다루지만
 * Firestore 문서의 맵 키(필드명)에는 '.'을 넣을 수 없다.
 * 'J.D. 마르티네스' 같은 이름이 그대로 키가 되면 쓰기가 실패하므로
 * 저장할 때는 배열로 펼치고 읽을 때 맵으로 되돌린다.
 */

import type {
  HittingLine,
  LeagueSnapshot,
  Manager,
  PitchingLine,
  Player,
  PlayerId,
  Roster,
} from '../domain/types';

export interface LeagueDoc {
  season: number;
  statsUpdatedAt: string | null;
  managers: Manager[];
  rosters: Roster[];
  players: Player[];
  hitting: Array<HittingLine & { playerId: PlayerId }>;
  pitching: Array<PitchingLine & { playerId: PlayerId }>;
}

export function toDoc(snapshot: LeagueSnapshot): LeagueDoc {
  return {
    season: snapshot.season,
    statsUpdatedAt: snapshot.statsUpdatedAt,
    managers: snapshot.managers,
    rosters: snapshot.rosters,
    players: Object.values(snapshot.players),
    hitting: Object.entries(snapshot.hitting).map(([playerId, line]) => ({ playerId, ...line })),
    pitching: Object.entries(snapshot.pitching).map(([playerId, line]) => ({ playerId, ...line })),
  };
}

export function fromDoc(doc: LeagueDoc): LeagueSnapshot {
  const players: Record<PlayerId, Player> = {};
  for (const player of doc.players ?? []) players[player.id] = player;

  const hitting: Record<PlayerId, HittingLine> = {};
  for (const { playerId, ...line } of doc.hitting ?? []) hitting[playerId] = line;

  const pitching: Record<PlayerId, PitchingLine> = {};
  for (const { playerId, ...line } of doc.pitching ?? []) pitching[playerId] = line;

  return {
    season: doc.season,
    statsUpdatedAt: doc.statsUpdatedAt ?? null,
    managers: doc.managers ?? [],
    rosters: (doc.rosters ?? []).map((r: Roster) => ({
      managerId: r.managerId,
      playerIds: r.playerIds ?? [],
    })),
    players,
    hitting,
    pitching,
  };
}
