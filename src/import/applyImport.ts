/**
 * 파싱 결과를 리그 스냅샷에 반영한다.
 *
 * 표에 있던 필드만 덮어쓰고 나머지는 그대로 둔다.
 * KBO 기록실처럼 항목이 여러 페이지에 나뉘어 있어도
 * 표를 차례로 넣으면 열이 하나씩 채워진다.
 */

import { EMPTY_HITTING, EMPTY_PITCHING } from '../domain/types';
import type {
  HittingField,
  HittingLine,
  LeagueSnapshot,
  PitchingField,
  PitchingLine,
} from '../domain/types';
import type { ParseResult } from './parseStatTable';
import { playerKey } from './parseStatTable';

export interface ApplyOptions {
  /** 해당 역할의 기존 스탯을 모두 지우고 시작한다 (시즌 초기화용) */
  replaceExisting?: boolean;
  /** 갱신 시각. 테스트에서 고정값을 넣기 위해 주입받는다. */
  now?: string;
}

export function applyImport(
  snapshot: LeagueSnapshot,
  result: ParseResult,
  options: ApplyOptions = {},
): LeagueSnapshot {
  const { replaceExisting = false, now = new Date().toISOString() } = options;
  const isHitter = result.role === 'hitter';

  const players = { ...snapshot.players };
  const hitting: Record<string, HittingLine> =
    replaceExisting && isHitter ? {} : { ...snapshot.hitting };
  const pitching: Record<string, PitchingLine> =
    replaceExisting && !isHitter ? {} : { ...snapshot.pitching };

  for (const row of result.rows) {
    const id = playerKey(row.name);

    players[id] = {
      id,
      name: row.name,
      kboTeam: row.kboTeam ?? players[id]?.kboTeam ?? '',
      role: result.role,
    };

    if (isHitter) {
      const base = hitting[id] ?? { ...EMPTY_HITTING };
      hitting[id] = { ...base, ...(row.stats as Partial<HittingLine>) };
    } else {
      const base = pitching[id] ?? { ...EMPTY_PITCHING };
      pitching[id] = { ...base, ...(row.stats as Partial<PitchingLine>) };
    }
  }

  // 채운 필드 기록. 교체 모드면 해당 역할의 기록을 초기화하고 다시 쌓는다.
  const previous = replaceExisting
    ? { hitting: isHitter ? [] : snapshot.importedFields.hitting, pitching: isHitter ? snapshot.importedFields.pitching : [] }
    : snapshot.importedFields;

  const importedFields = {
    hitting: isHitter
      ? ([...new Set([...previous.hitting, ...result.providedFields])] as HittingField[])
      : previous.hitting,
    pitching: isHitter
      ? previous.pitching
      : ([...new Set([...previous.pitching, ...result.providedFields])] as PitchingField[]),
  };

  return {
    ...snapshot,
    players,
    hitting,
    pitching,
    importedFields,
    statsUpdatedAt: now,
  };
}
