/**
 * Firestore 전송 형식 변환.
 *
 * 도메인에서는 선수 스탯을 `Record<선수명, 스탯>` 맵으로 다루지만
 * Firestore 문서의 맵 키(필드명)에는 '.'을 넣을 수 없다.
 * 'J.D. 마르티네스' 같은 이름이 그대로 키가 되면 쓰기가 실패하므로
 * 저장할 때는 배열로 펼치고 읽을 때 맵으로 되돌린다.
 *
 * 월 키('2026-04')는 '.'을 포함하지 않으므로 맵 그대로 둔다.
 */

import { emptyMonth } from '../domain/types';
import type {
  HittingLine,
  LeagueSnapshot,
  Manager,
  MonthKey,
  MonthlyStats,
  PitchingLine,
  Player,
  PlayerId,
  Roster,
} from '../domain/types';

interface MonthDoc {
  hitting: Array<HittingLine & { playerId: PlayerId }>;
  pitching: Array<PitchingLine & { playerId: PlayerId }>;
  importedFields: MonthlyStats['importedFields'];
  updatedAt: string | null;
}

export interface LeagueDoc {
  season: number;
  managers: Manager[];
  rosters: Roster[];
  players: Player[];
  months: Record<MonthKey, MonthDoc>;
}

export function toDoc(snapshot: LeagueSnapshot): LeagueDoc {
  const months: Record<MonthKey, MonthDoc> = {};
  for (const [key, stats] of Object.entries(snapshot.months)) {
    months[key] = {
      hitting: Object.entries(stats.hitting).map(([playerId, line]) => ({ playerId, ...line })),
      pitching: Object.entries(stats.pitching).map(([playerId, line]) => ({ playerId, ...line })),
      importedFields: stats.importedFields,
      updatedAt: stats.updatedAt,
    };
  }

  return {
    season: snapshot.season,
    managers: snapshot.managers,
    rosters: snapshot.rosters,
    players: Object.values(snapshot.players),
    months,
  };
}

export function fromDoc(doc: LeagueDoc): LeagueSnapshot {
  const players: Record<PlayerId, Player> = {};
  for (const player of doc.players ?? []) players[player.id] = player;

  const months: Record<MonthKey, MonthlyStats> = {};
  for (const [key, monthDoc] of Object.entries(doc.months ?? {})) {
    const stats = emptyMonth();
    for (const { playerId, ...line } of monthDoc.hitting ?? []) stats.hitting[playerId] = line;
    for (const { playerId, ...line } of monthDoc.pitching ?? []) stats.pitching[playerId] = line;
    stats.importedFields = {
      hitting: monthDoc.importedFields?.hitting ?? [],
      pitching: monthDoc.importedFields?.pitching ?? [],
    };
    stats.updatedAt = monthDoc.updatedAt ?? null;
    months[key] = stats;
  }

  return {
    season: doc.season,
    managers: doc.managers ?? [],
    rosters: (doc.rosters ?? []).map((r: Roster) => ({
      managerId: r.managerId,
      playerIds: r.playerIds ?? [],
    })),
    players,
    months,
  };
}
