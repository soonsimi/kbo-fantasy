/**
 * 월별 순위와 시즌 종합 순위.
 *
 * 산정 방식:
 *  1. 각 달의 기록으로 로토서리 점수를 매겨 그 달의 순위를 낸다.
 *  2. 시즌 종합 순위는 **월별 순위의 합산**이다. 합이 작을수록 상위.
 *     예) 4월 3위 + 5월 1위 + 6월 2위 = 6점. 다른 참가자가 5점이면 그 쪽이 상위.
 *  3. 순위 합이 같으면 **월별 총점 합계가 높은 쪽**이 상위다.
 *     둘 다 같을 때만 공동 순위가 된다.
 *  4. 기록이 없는 달은 계산에서 제외한다 (전원 0점 동점이 되어 무의미하므로).
 *
 * 월 순위 합산은 인원수가 그대로 유지될 때만 달끼리 공평하다.
 * 시즌 중 인원이 바뀌면 달마다 순위 범위가 달라져 합산이 왜곡된다.
 * hasParticipantCountChanged()로 이를 감지해 화면에서 경고한다.
 */

import type { Category } from './categories';
import { DEFAULT_CATEGORIES } from './categories';
import { assignSharedRanks, computeStandings } from './rotisserie';
import type { Standings } from './rotisserie';
import { monthNumber, seasonMonthKeys } from './types';
import type { LeagueSnapshot, ManagerId, MonthKey, MonthlyStats } from './types';

export interface MonthlyResult {
  month: MonthKey;
  standings: Standings;
}

export interface SeasonRow {
  managerId: ManagerId;
  managerName: string;
  /** 월 → 그 달의 순위 */
  monthlyRanks: Record<MonthKey, number>;
  /** 월 → 그 달의 로토서리 총점 */
  monthlyPoints: Record<MonthKey, number>;
  /** 월별 순위의 합. 작을수록 상위. */
  rankSum: number;
  /** 월별 총점의 합. 순위 합이 같을 때 높은 쪽이 상위. */
  pointsSum: number;
  /** 시즌 종합 순위 */
  rank: number;
}

export interface SeasonStandings {
  /** 기록이 있어 산정에 포함된 달 */
  scoredMonths: MonthKey[];
  monthly: MonthlyResult[];
  rows: SeasonRow[];
}

/** 그 달에 기록이 하나라도 들어와 있는지 */
export function hasData(month: MonthlyStats | undefined): boolean {
  if (!month) return false;
  return (
    month.importedFields.hitting.length > 0 ||
    month.importedFields.pitching.length > 0
  );
}

/** 산정에 쓸 수 있는 달을 시간 순으로 */
export function scoredMonthKeys(snapshot: LeagueSnapshot): MonthKey[] {
  return seasonMonthKeys(snapshot.season).filter((key) => hasData(snapshot.months[key]));
}

/** 한 달의 순위를 계산한다. */
export function computeMonth(
  snapshot: LeagueSnapshot,
  month: MonthKey,
  categories: Category[] = DEFAULT_CATEGORIES,
): Standings {
  const stats = snapshot.months[month];
  return computeStandings(
    {
      managers: snapshot.managers,
      rosters: snapshot.rosters,
      hitting: stats?.hitting ?? {},
      pitching: stats?.pitching ?? {},
    },
    categories,
  );
}

export function computeSeason(
  snapshot: LeagueSnapshot,
  categories: Category[] = DEFAULT_CATEGORIES,
): SeasonStandings {
  const scoredMonths = scoredMonthKeys(snapshot);
  const monthly = scoredMonths.map((month) => ({
    month,
    standings: computeMonth(snapshot, month, categories),
  }));

  const unranked = snapshot.managers.map((manager) => {
    const monthlyRanks: Record<MonthKey, number> = {};
    const monthlyPoints: Record<MonthKey, number> = {};
    let rankSum = 0;
    let pointsSum = 0;

    for (const { month, standings } of monthly) {
      const row = standings.rows.find((r) => r.managerId === manager.id);
      if (!row) continue;
      monthlyRanks[month] = row.rank;
      monthlyPoints[month] = row.totalPoints;
      rankSum += row.rank;
      pointsSum += row.totalPoints;
    }

    return {
      managerId: manager.id,
      managerName: manager.name,
      monthlyRanks,
      monthlyPoints,
      rankSum,
      pointsSum,
    };
  });

  // 월 순위 합이 작은 쪽이 상위, 같으면 월별 총점 합계가 높은 쪽이 상위
  unranked.sort((a, b) => a.rankSum - b.rankSum || b.pointsSum - a.pointsSum);

  return {
    scoredMonths,
    monthly,
    rows: assignSharedRanks(
      unranked,
      // 총점 합계는 동점 균등 배분 때문에 1/3 같은 값이 섞여 부동소수 오차가 생긴다.
      // 순위를 가르는 기준이므로 오차 범위 안이면 같은 값으로 본다.
      (a, b) => a.rankSum === b.rankSum && Math.abs(a.pointsSum - b.pointsSum) < 1e-9,
    ),
  };
}

/** 가장 최근에 기록이 들어온 달 */
export function latestScoredMonth(snapshot: LeagueSnapshot): MonthKey | null {
  const months = scoredMonthKeys(snapshot);
  return months.length > 0 ? months[months.length - 1] : null;
}

/** 오늘 날짜에 해당하는 시즌 월. 시즌 범위를 벗어나면 가장 가까운 달로 맞춘다. */
export function currentSeasonMonth(snapshot: LeagueSnapshot, today: Date): MonthKey {
  const keys = seasonMonthKeys(snapshot.season);
  const thisMonth = today.getFullYear() === snapshot.season ? today.getMonth() + 1 : 0;

  const exact = keys.find((k) => monthNumber(k) === thisMonth);
  if (exact) return exact;

  // 시즌 전이면 첫 달, 시즌 후면 마지막 달
  const first = monthNumber(keys[0]);
  return thisMonth !== 0 && thisMonth < first ? keys[0] : keys[keys.length - 1];
}
