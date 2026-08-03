/** 점수 표시. 동점 균등 배분으로 11.5 같은 반값이 나올 수 있다. */
export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}
