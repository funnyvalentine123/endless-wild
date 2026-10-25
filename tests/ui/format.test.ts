import { describe, expect, it } from 'vitest';
import { formatAltitude, formatClock, formatCompass, formatDistance } from '../../src/ui/format';

describe('HUD 格式化', () => {
  it('时刻', () => {
    expect(formatClock(8)).toBe('08:00');
    expect(formatClock(23.5)).toBe('23:30');
    expect(formatClock(0)).toBe('00:00');
  });

  it('罗盘方向', () => {
    expect(formatCompass(0)).toBe('北 0°');
    expect(formatCompass(-Math.PI / 2)).toBe('东 90°');
    expect(formatCompass(Math.PI)).toBe('南 180°');
  });

  it('距离与海拔', () => {
    expect(formatDistance(1234.9)).toBe('1,234');
    expect(formatAltitude(-3)).toBe('0');
    expect(formatAltitude(12.6)).toBe('13');
  });
});
