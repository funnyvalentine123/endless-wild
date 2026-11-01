import { GEM_DEFINITIONS, type GemKind, type GemShape } from '../config/gems';

/** 每种宝石的几何体对应一个 clip-path 图标（样式见 inventory.css 的 `.bag-gem--*`）。 */
const SHAPE_CLASS: Record<GemShape, string> = {
  octahedron: 'bag-gem--octahedron',
  icosahedron: 'bag-gem--icosahedron',
  tetrahedron: 'bag-gem--tetrahedron',
  dodecahedron: 'bag-gem--dodecahedron',
  bipyramid: 'bag-gem--bipyramid',
  brilliant: 'bag-gem--brilliant',
  crystal: 'bag-gem--crystal',
  orb: 'bag-gem--orb',
};

export function hexColor(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/** 把某个通道向 target 混合：用来给图标做「亮面 / 本色 / 暗面」三段渐变。 */
export function mix(value: number, target: number, amount: number): string {
  const channel = (shift: number): number => {
    const from = (value >> shift) & 0xff;
    const to = (target >> shift) & 0xff;
    return Math.round(from + (to - from) * amount);
  };
  return `rgb(${channel(16)} ${channel(8)} ${channel(0)})`;
}

/** 宝石图标的完整类名（形状由 clip-path 决定，颜色由行内 CSS 变量决定）。 */
export function gemClassName(kind: GemKind): string {
  return `bag-gem ${SHAPE_CLASS[GEM_DEFINITIONS[kind].shape]}`;
}

/** 给图标写入颜色变量；荧光石本身是多色圆球，不需要单色渐变。 */
export function paintGem(element: HTMLElement, kind: GemKind): void {
  const definition = GEM_DEFINITIONS[kind];
  if (kind === 'glow') return;

  element.style.setProperty('--gem-light', mix(definition.color, 0xffffff, 0.55));
  element.style.setProperty('--gem-color', mix(definition.color, 0xffffff, 0.06));
  element.style.setProperty('--gem-dark', mix(definition.color, 0x000000, 0.42));
  element.style.setProperty('--gem-glow', hexColor(definition.glow));
}

/** 创建一个可直接插入 DOM 的宝石图标。 */
export function createGem(kind: GemKind): HTMLElement {
  const gem = document.createElement('span');
  gem.className = gemClassName(kind);
  gem.dataset.kind = kind;
  paintGem(gem, kind);
  return gem;
}

/** 粒子特效用的主色：取宝石光晕色，黑宝石也有一圈亮紫色。 */
export function gemGlowColor(kind: GemKind): string {
  return hexColor(GEM_DEFINITIONS[kind].glow);
}
