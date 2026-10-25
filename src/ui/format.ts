const DIRECTIONS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'] as const;

export function formatClock(hour: number): string {
  const hours = Math.floor(hour);
  const minutes = Math.floor((hour - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatCompass(yaw: number): string {
  const degrees = (((-yaw * 180) / Math.PI) % 360 + 360) % 360;
  const direction = DIRECTIONS[Math.round(degrees / 45) % 8]!;
  return `${direction} ${Math.round(degrees)}°`;
}

export function formatDistance(walked: number): string {
  return Math.floor(walked).toLocaleString();
}

export function formatAltitude(y: number): string {
  return Math.max(0, y).toFixed(0);
}
