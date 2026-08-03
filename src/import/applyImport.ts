/**
 * 파싱 결과를 리그 스냅샷의 특정 달에 반영한다.
 *
 * 표에 있던 필드만 덮어쓰고 나머지는 그대로 둔다.
 * KBO 기록실처럼 항목이 여러 페이지에 나뉘어 있어도
 * 표를 차례로 넣으면 열이 하나씩 채워진다.
 *
 * 입력 모드가 두 가지다:
 *
 *  - 'monthly'     붙여넣은 표가 그 달의 기록이다. 그대로 저장한다.
 *  - 'cumulative'  붙여넣은 표가 그 달까지의 시즌 누적이다.
 *                  이전 달들의 합을 빼서 그 달 기록을 계산한다.
 *
 * 두 모드를 다 두는 이유: 월간 기록을 바로 볼 수 있으면 'monthly'가 간단하지만,
 * 시즌 누적 표만 구할 수 있는 경우가 있어 그때는 차이로 월별 값을 만들어야 한다.
 */

import { seasonMonthKeys } from '../domain/types';
import { EMPTY_HITTING, EMPTY_PITCHING, emptyMonth } from '../domain/types';
import type {
  HittingLine,
  LeagueSnapshot,
  MonthKey,
  MonthlyStats,
  PitchingLine,
  PlayerId,
  StatField,
} from '../domain/types';
import type { ParseResult } from './parseStatTable';
import { playerKey } from './parseStatTable';

export type ImportMode = 'monthly' | 'cumulative';

export interface ApplyOptions {
  /** 반영할 달 */
  month: MonthKey;
  /** 기본값 'monthly' */
  mode?: ImportMode;
  /** 이 달, 이 역할의 기존 기록을 모두 지우고 시작한다 */
  replaceExisting?: boolean;
  /** 갱신 시각. 테스트에서 고정값을 넣기 위해 주입받는다. */
  now?: string;
}

export interface ApplyResult {
  snapshot: LeagueSnapshot;
  warnings: string[];
}

/** month 이전 달들의 값을 선수·필드별로 합산한다 (누적 모드에서 차이를 낼 때 쓴다). */
function priorTotals(
  snapshot: LeagueSnapshot,
  month: MonthKey,
  isHitter: boolean,
): Map<PlayerId, Partial<Record<StatField, number>>> {
  const result = new Map<PlayerId, Partial<Record<StatField, number>>>();
  for (const key of seasonMonthKeys(snapshot.season)) {
    if (key >= month) break;
    const stats = snapshot.months[key];
    if (!stats) continue;
    const lines: Record<PlayerId, HittingLine | PitchingLine> = isHitter
      ? stats.hitting
      : stats.pitching;
    for (const [playerId, line] of Object.entries(lines)) {
      const acc = result.get(playerId) ?? {};
      for (const [field, value] of Object.entries(line)) {
        acc[field as StatField] = (acc[field as StatField] ?? 0) + (value as number);
      }
      result.set(playerId, acc);
    }
  }
  return result;
}

export function applyImport(
  snapshot: LeagueSnapshot,
  result: ParseResult,
  options: ApplyOptions,
): ApplyResult {
  const { month, mode = 'monthly', replaceExisting = false, now = new Date().toISOString() } = options;
  const isHitter = result.role === 'hitter';
  const warnings: string[] = [];

  const players = { ...snapshot.players };
  const existing: MonthlyStats = snapshot.months[month] ?? emptyMonth();

  const hitting: Record<PlayerId, HittingLine> =
    replaceExisting && isHitter ? {} : { ...existing.hitting };
  const pitching: Record<PlayerId, PitchingLine> =
    replaceExisting && !isHitter ? {} : { ...existing.pitching };

  const prior = mode === 'cumulative' ? priorTotals(snapshot, month, isHitter) : null;

  for (const row of result.rows) {
    const id = playerKey(row.name);

    players[id] = {
      id,
      name: row.name,
      kboTeam: row.kboTeam ?? players[id]?.kboTeam ?? '',
      role: result.role,
    };

    // 누적 모드면 이전 달 합을 빼서 이 달 값을 만든다
    let stats: Partial<Record<StatField, number>> = row.stats;
    if (prior) {
      const before = prior.get(id) ?? {};
      const derived: Partial<Record<StatField, number>> = {};
      for (const [field, cumulative] of Object.entries(row.stats)) {
        const previous = before[field as StatField] ?? 0;
        const delta = (cumulative as number) - previous;
        if (delta < 0) {
          warnings.push(
            `${row.name}: 누적값이 이전 달 합보다 작습니다 (${cumulative} < ${previous}). ` +
              '0으로 처리했습니다. 붙여넣은 표가 정말 시즌 누적인지, 달을 맞게 골랐는지 확인하세요.',
          );
        }
        derived[field as StatField] = Math.max(0, delta);
      }
      stats = derived;
    }

    if (isHitter) {
      const base = hitting[id] ?? { ...EMPTY_HITTING };
      hitting[id] = { ...base, ...(stats as Partial<HittingLine>) };
    } else {
      const base = pitching[id] ?? { ...EMPTY_PITCHING };
      pitching[id] = { ...base, ...(stats as Partial<PitchingLine>) };
    }
  }

  // 채운 필드 기록. 교체 모드면 해당 역할의 기록만 초기화하고 다시 쌓는다.
  const previousFields = replaceExisting
    ? {
        hitting: isHitter ? [] : existing.importedFields.hitting,
        pitching: isHitter ? existing.importedFields.pitching : [],
      }
    : existing.importedFields;

  const importedFields = {
    hitting: isHitter
      ? [...new Set([...previousFields.hitting, ...result.providedFields])]
      : previousFields.hitting,
    pitching: isHitter
      ? previousFields.pitching
      : [...new Set([...previousFields.pitching, ...result.providedFields])],
  } as MonthlyStats['importedFields'];

  return {
    snapshot: {
      ...snapshot,
      players,
      months: {
        ...snapshot.months,
        [month]: { hitting, pitching, importedFields, updatedAt: now },
      },
    },
    warnings,
  };
}
