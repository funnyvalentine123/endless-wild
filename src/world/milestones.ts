/** 里程碑间距（米）：沿路每 500m 立一块木牌。 */
export const MILESTONE_SPACING = 500;

/** 玩家位于哪两个里程碑之间（负数表示起点另一侧）。 */
export function milestoneIndexAt(z: number): number {
  return Math.floor(z / MILESTONE_SPACING);
}

/** 里程碑序号的公路里程（公里）。 */
export function milestoneKm(index: number): number {
  return (index * MILESTONE_SPACING) / 1000;
}

/** 木牌上的里程文字：整公里不带小数，其余保留一位。 */
export function formatMilestoneKm(index: number): string {
  const km = milestoneKm(index);
  const absolute = Math.abs(km);
  const text = Number.isInteger(absolute) ? String(absolute) : absolute.toFixed(1);
  return `${km < 0 ? '−' : ''}${text} km`;
}
