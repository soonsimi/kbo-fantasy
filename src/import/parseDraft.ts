/**
 * 오프라인 드래프트 결과 일괄 입력 파서.
 *
 * 드래프트는 오프라인에서 진행하고 결과만 옮겨 적는다.
 * 참가자마다 검색해서 한 명씩 지명하면 12명 × 20명 = 240번을 클릭해야 하므로,
 * 종이에 적힌 결과를 그대로 붙여넣는 경로를 만든다.
 *
 * 입력 형식 (한 줄에 참가자 한 명):
 *   홍길동: 김도영, 구자욱, 원태인
 *   이몽룡 - 레이예스, 오스틴, 네일
 *   김철수	강백호	박병호        (탭 구분도 됨)
 *
 * 선수는 이름으로 맞춘다. 스탯을 먼저 불러와 선수 명단이 있어야 대조가 된다.
 */

import type { Manager, ManagerId, Player, PlayerId } from '../domain/types';

export interface DraftAssignment {
  managerId: ManagerId;
  managerName: string;
  playerIds: PlayerId[];
}

export interface DraftParseResult {
  assignments: DraftAssignment[];
  /** 리그 참가자 명단에 없는 이름 */
  unknownManagers: string[];
  /** 선수 명단에 없는 이름 */
  unknownPlayers: string[];
  /** 두 명 이상에게 배정된 선수 */
  conflicts: Array<{ playerName: string; managerNames: string[] }>;
  warnings: string[];
}

/** 이름 대조용 정규화: 공백 제거 */
function normalize(name: string): string {
  return name.replace(/\s+/g, '');
}

export function parseDraft(
  text: string,
  managers: readonly Manager[],
  players: Record<PlayerId, Player>,
): DraftParseResult {
  const managerByName = new Map<string, Manager>();
  for (const manager of managers) managerByName.set(normalize(manager.name), manager);

  const playerByName = new Map<string, Player>();
  for (const player of Object.values(players)) {
    playerByName.set(normalize(player.name), player);
  }

  const assignments: DraftAssignment[] = [];
  const unknownManagers: string[] = [];
  const unknownPlayers: string[] = [];
  const warnings: string[] = [];
  // 선수 → 배정된 참가자 이름들 (중복 배정 감지)
  const assignedTo = new Map<PlayerId, string[]>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    // 참가자와 선수 목록을 가르는 첫 구분자: ':' 또는 '-' 또는 탭
    const match = line.match(/^([^:\t]+?)\s*(?::|\t|\s-\s)\s*(.*)$/);
    if (!match) {
      warnings.push(`'${line}' — 참가자와 선수를 구분할 수 없습니다. '이름: 선수1, 선수2' 형식으로 적어주세요.`);
      continue;
    }

    const managerName = match[1].trim();
    const manager = managerByName.get(normalize(managerName));
    if (!manager) {
      unknownManagers.push(managerName);
      continue;
    }

    const playerNames = match[2]
      .split(/[,\t]/)
      .map((s) => s.trim())
      .filter((s) => s !== '');

    if (playerNames.length === 0) {
      warnings.push(`${managerName}: 선수 이름이 없습니다.`);
      continue;
    }

    const playerIds: PlayerId[] = [];
    const seenInLine = new Set<PlayerId>();

    for (const playerName of playerNames) {
      const player = playerByName.get(normalize(playerName));
      if (!player) {
        unknownPlayers.push(playerName);
        continue;
      }
      if (seenInLine.has(player.id)) {
        warnings.push(`${managerName}: '${player.name}'이 같은 줄에 두 번 있습니다. 한 번만 넣었습니다.`);
        continue;
      }
      seenInLine.add(player.id);
      playerIds.push(player.id);

      const holders = assignedTo.get(player.id) ?? [];
      holders.push(manager.name);
      assignedTo.set(player.id, holders);
    }

    const existing = assignments.find((a) => a.managerId === manager.id);
    if (existing) {
      // 같은 참가자가 여러 줄에 나오면 이어 붙인다 (로스터가 길어 줄을 나눈 경우)
      existing.playerIds.push(...playerIds.filter((id) => !existing.playerIds.includes(id)));
    } else {
      assignments.push({ managerId: manager.id, managerName: manager.name, playerIds });
    }
  }

  const conflicts = [...assignedTo.entries()]
    .filter(([, holders]) => new Set(holders).size > 1)
    .map(([playerId, holders]) => ({
      playerName: players[playerId]?.name ?? playerId,
      managerNames: [...new Set(holders)],
    }));

  return {
    assignments,
    unknownManagers: [...new Set(unknownManagers)],
    unknownPlayers: [...new Set(unknownPlayers)],
    conflicts,
    warnings,
  };
}
