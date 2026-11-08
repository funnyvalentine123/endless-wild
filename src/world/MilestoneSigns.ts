import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
  type Scene,
} from 'three';
import { ROAD_WIDTH } from '../config/world';
import type { World } from './World';
import { MILESTONE_SPACING, milestoneIndexAt, milestoneKm, formatMilestoneKm } from './milestones';

/** 只生成玩家这个距离内的木牌：雾距 420m，留一点余量即可。 */
const VISIBLE_SPAN = 700;
/** 木牌贴图缓存上限：走远后释放，避免长途旅行一直堆 canvas 纹理。 */
const MAX_BOARD_CACHE = 12;
const BOARD_WIDTH = 2.2;
const BOARD_HEIGHT = 1.1;

export interface MilestoneCrossing {
  index: number;
  km: number;
}

/**
 * 沿路里程碑木牌。
 *
 * 每 500m 在路边立一块木牌，牌面写着当前公路里程与所在地貌。
 * 木牌不属于区块流式系统：只有几块、只依赖地形高度采样，独立管理更容易
 * 控制贴图缓存与释放；玩家跨过一块时由 `update()` 返回跨越信息给 HUD。
 */
export class MilestoneSigns {
  private readonly group = new Group();
  private readonly active = new Map<number, Group>();
  private readonly boards = new Map<number, { texture: CanvasTexture; material: MeshLambertMaterial }>();
  private readonly boardOrder: number[] = [];

  private readonly postGeometry = new BoxGeometry(0.24, 2.3, 0.24).translate(0, 1.15, 0);
  private readonly boardGeometry = createBoardGeometry(BOARD_WIDTH, BOARD_HEIGHT, 0.08);
  private readonly postMaterial = new MeshLambertMaterial({ color: 0x6b4a2c });

  /** 上一次所在的里程碑序号；首次采样只记录，不播报。 */
  private lastIndex: number | null = null;

  constructor(
    scene: Scene,
    private readonly world: World,
  ) {
    scene.add(this.group);
  }

  /** 玩家当前落在哪一块里程碑（用于调试与提示）。 */
  get index(): number {
    return this.lastIndex ?? 0;
  }

  /**
   * 按玩家位置补建 / 卸载木牌，并返回本帧刚跨过的里程碑。
   * 传送、载入存档造成的大跨度移动不会播报，避免一次跳出好几条提示。
   */
  update(z: number): MilestoneCrossing | null {
    const index = milestoneIndexAt(z);
    const first = Math.ceil((z - VISIBLE_SPAN) / MILESTONE_SPACING);
    const last = Math.floor((z + VISIBLE_SPAN) / MILESTONE_SPACING);

    for (let key = first; key <= last; key++) {
      if (!this.active.has(key)) {
        const sign = this.createSign(key);
        if (sign) {
          this.active.set(key, sign);
          this.group.add(sign);
        }
      }
    }

    for (const [key, sign] of this.active) {
      if (key < first || key > last) {
        this.group.remove(sign);
        this.active.delete(key);
      }
    }

    const previous = this.lastIndex;
    this.lastIndex = index;
    if (previous === null || previous === index) return null;
    // 相邻两块才算“走过去”；传送 / 换世界时 lastIndex 会一次跳很多，不播报。
    if (Math.abs(index - previous) !== 1) return null;
    // 真正跨过的是两块之间的那根木牌：正向取新的，反向取旧的。
    const crossed = Math.max(previous, index);
    return { index: crossed, km: milestoneKm(crossed) };
  }

  dispose(): void {
    this.group.clear();
    this.active.clear();
    for (const board of this.boards.values()) {
      board.material.dispose();
      board.texture.dispose();
    }
    this.boards.clear();
    this.boardOrder.length = 0;
    this.group.removeFromParent();
    this.postGeometry.dispose();
    this.boardGeometry.dispose();
    this.postMaterial.dispose();
  }

  private createSign(index: number): Group | null {
    const z = index * MILESTONE_SPACING;
    // 桥面两侧是深谷，木牌无处落脚；这一块跳过，下一块照常出现。
    if (this.world.bridge(z) > 0.3) return null;

    const side = index % 2 === 0 ? 1 : -1;
    // 站在道路肩内（植被在路缘 1.5m 外才开始生成），这样树不会挡住牌面。
    const x = this.world.roadX(z) + side * (ROAD_WIDTH / 2 + 1.3);
    const ground = Math.max(this.world.groundAt(x, z), this.world.roadHeight(z));

    // 牌面顺着道路切线站，走近时不会只看到一条边。
    const slope = (this.world.roadX(z + 2) - this.world.roadX(z - 2)) / 4;
    const facing = Math.atan2(slope, 1);

    const sign = new Group();
    sign.name = 'milestone-sign';
    sign.position.set(x, ground - 0.05, z);
    sign.rotation.y = facing;

    sign.add(new Mesh(this.postGeometry, this.postMaterial));
    const board = new Mesh(this.boardGeometry, this.boardFor(index, x).material);
    board.position.y = 2.0;
    sign.add(board);
    return sign;
  }

  private boardFor(
    index: number,
    x: number,
  ): { texture: CanvasTexture; material: MeshLambertMaterial } {
    const cached = this.boards.get(index);
    if (cached) return cached;

    const z = index * MILESTONE_SPACING;
    const texture = createBoardTexture(
      formatMilestoneKm(index),
      `无尽山野 · ${this.world.biomeAt(x, z)}`,
    );
    const material = new MeshLambertMaterial({
      map: texture,
      // 夜里木牌也能看清字：用同一张贴图做一点自发光。
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.28,
    });

    const board = { texture, material };
    this.boards.set(index, board);
    this.boardOrder.push(index);
    this.trimBoards();
    return board;
  }

  private trimBoards(): void {
    if (this.boardOrder.length <= MAX_BOARD_CACHE) return;

    const reusable = this.boardOrder.find((key) => !this.active.has(key));
    if (reusable === undefined) return;

    this.boardOrder.splice(this.boardOrder.indexOf(reusable), 1);
    const board = this.boards.get(reusable);
    if (!board) return;
    board.material.dispose();
    board.texture.dispose();
    this.boards.delete(reusable);
  }
}

/** 两块背对背的牌面合并成一个几何体：正面与背面都读得清，只需一次绘制。 */
function createBoardGeometry(width: number, height: number, offset: number): BufferGeometry {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  const positions = [
    -halfWidth, -halfHeight, offset,
    halfWidth, -halfHeight, offset,
    -halfWidth, halfHeight, offset,
    halfWidth, halfHeight, offset,
    -halfWidth, -halfHeight, -offset,
    halfWidth, -halfHeight, -offset,
    -halfWidth, halfHeight, -offset,
    halfWidth, halfHeight, -offset,
  ];
  // 背面把 u 反过来，从另一侧看文字不会镜像。
  const uvs = [0, 0, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 1];
  const indices = [0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7];

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 画一块木牌：深色木纹底、浅色描边、大号里程与一行小字。 */
function createBoardTexture(main: string, sub: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建里程碑木牌的绘图上下文');

  const background = context.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, '#7d5836');
  background.addColorStop(1, '#4a3120');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // 几条横向木纹，近看不像一块纯色板。
  context.strokeStyle = 'rgba(0, 0, 0, 0.14)';
  context.lineWidth = 3;
  for (let y = 28; y < canvas.height; y += 46) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y + 6);
    context.stroke();
  }

  context.strokeStyle = '#e0bd8a';
  context.lineWidth = 9;
  context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#f7e7c6';
  context.font = 'bold 104px "Microsoft YaHei", system-ui, sans-serif';
  context.fillText(main, canvas.width / 2, 112);

  context.fillStyle = '#e5cba0';
  context.font = '600 34px "Microsoft YaHei", system-ui, sans-serif';
  context.fillText(sub, canvas.width / 2, 204);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
