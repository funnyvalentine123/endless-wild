import { describe, expect, it } from 'vitest';
import {
  MILESTONE_SPACING,
  formatMilestoneKm,
  milestoneIndexAt,
  milestoneKm,
} from '../../src/world/milestones';

describe('里程碑', () => {
  it('每 500m 一块，所在区间由 z 向下取整得到', () => {
    expect(MILESTONE_SPACING).toBe(500);
    expect(milestoneIndexAt(0)).toBe(0);
    expect(milestoneIndexAt(249)).toBe(0);
    expect(milestoneIndexAt(250)).toBe(0);
    expect(milestoneIndexAt(499)).toBe(0);
    expect(milestoneIndexAt(500)).toBe(1);
    expect(milestoneIndexAt(760)).toBe(1);
    expect(milestoneIndexAt(-1)).toBe(-1);
    expect(milestoneIndexAt(-260)).toBe(-1);
    expect(milestoneIndexAt(-500)).toBe(-1);
  });

  it('序号换算成公路里程', () => {
    expect(milestoneKm(0)).toBe(0);
    expect(milestoneKm(1)).toBe(0.5);
    expect(milestoneKm(3)).toBe(1.5);
    expect(milestoneKm(-4)).toBe(-2);
  });

  it('木牌文字：整公里不带小数，其余保留一位，负向用减号', () => {
    expect(formatMilestoneKm(0)).toBe('0 km');
    expect(formatMilestoneKm(1)).toBe('0.5 km');
    expect(formatMilestoneKm(24)).toBe('12 km');
    expect(formatMilestoneKm(-3)).toBe('−1.5 km');
  });
});
