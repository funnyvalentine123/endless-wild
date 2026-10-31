import {
  AdditiveBlending,
  BufferAttribute,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TetrahedronGeometry,
  Vector2,
  type BufferGeometry,
  type Scene,
  type Texture,
} from 'three';
import {
  GEM_DEFINITIONS,
  GEM_DYNAMIC,
  GEM_KINDS,
  GEM_SPAWN,
  GEM_VISUALS,
  type GemKind,
  type GemShape,
} from '../config/gems';
import { CHUNK_SIZE, ROAD_WIDTH, WATER_LEVEL } from '../config/world';
import type { PlayerState } from '../player/Player';
import type { WeatherSnapshot } from '../config/weather';
import type { RandomSource } from '../math/random';
import { staticGemSitesInChunk, type GemSite } from './sites';
import type { World } from '../world/World';

/** 动物位置查询：由 Game 把 WildlifeManager 的 sighting 列表接进来。 */
export interface WildlifeSighting {
  kind: string;
  x: number;
  y: number;
  z: number;
}

export interface GemSighting {
  kind: GemKind;
  x: number;
  y: number;
  z: number;
  /** 红宝石当前附着的动物种类。 */
  attached?: string;
}

interface GemEntry {
  readonly key: string;
  readonly kind: GemKind;
  readonly group: Group;
  readonly gem: Mesh;
  readonly halo: Sprite;
  x: number;
  z: number;
  /** 地面或水面高度，光柱从这里起。 */
  baseY: number;
  /** 光晕呼吸的相位，让每颗宝石的脉动节奏略有不同。 */
  readonly phase: number;
  /** 红宝石附着的动物种类。 */
  animalKind?: string;
}

const SPECIES_OF_RED = GEM_DYNAMIC.red.animals as readonly string[];

function createGlowTexture(): Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.62, 'rgba(255,255,255,0.14)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * 光柱贴图：竖向越靠柱顶越透明（在最高点之前完全消失），横向左右边缘透明、
 * 中间最实，这样普通透明混合下也不会出现一根硬边管子。
 */
function createPillarTexture(): Texture {
  const width = 64;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) {
    const vertical = context.createLinearGradient(0, 0, 0, height);
    vertical.addColorStop(0, 'rgba(255,255,255,0)');
    vertical.addColorStop(GEM_VISUALS.pillarFadeStart, 'rgba(255,255,255,0.06)');
    vertical.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    vertical.addColorStop(0.82, 'rgba(255,255,255,0.8)');
    vertical.addColorStop(1, 'rgba(255,255,255,0.55)');
    context.fillStyle = vertical;
    context.fillRect(0, 0, width, height);

    // destination-in：用横向渐变把柱体两侧擦成透明，保留中间的实心部分。
    context.globalCompositeOperation = 'destination-in';
    const horizontal = context.createLinearGradient(0, 0, width, 0);
    horizontal.addColorStop(0, 'rgba(255,255,255,0)');
    horizontal.addColorStop(0.18, 'rgba(255,255,255,0.5)');
    horizontal.addColorStop(0.5, 'rgba(255,255,255,1)');
    horizontal.addColorStop(0.82, 'rgba(255,255,255,0.5)');
    horizontal.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = horizontal;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * 荧光石的彩色光晕：圆盘按 24 段色环着色，再用径向渐变把外缘擦成透明，
 * 所以同一时刻光晕四周就是好几种颜色，而不是整体换色。
 */
function createRainbowGlowTexture(): Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const center = size / 2;
    const segments = 24;
    for (let i = 0; i < segments; i++) {
      const from = (i / segments) * Math.PI * 2;
      const to = ((i + 1) / segments) * Math.PI * 2;
      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, center, from, to);
      context.closePath();
      context.fillStyle = `hsl(${(i / segments) * 360} 92% 62%)`;
      context.fill();
    }

    // 径向 alpha：中心让开给宝石本体（否则光晕会把每个面的颜色盖住），外圈淡出。
    context.globalCompositeOperation = 'destination-in';
    const mask = context.createRadialGradient(
      center,
      center,
      center * 0.12,
      center,
      center,
      center,
    );
    mask.addColorStop(0, 'rgba(0,0,0,0.1)');
    mask.addColorStop(0.3, 'rgba(0,0,0,0.55)');
    mask.addColorStop(0.6, 'rgba(0,0,0,0.32)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = mask;
    context.fillRect(0, 0, size, size);
    context.globalCompositeOperation = 'source-over';
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * 荧光石的光柱：横向一整圈 24 段色环，从任何角度都能同时看到好几种颜色；
 * 竖向依旧在柱顶前淡出，横向两端只做轻微收边（色环首尾同色，可以无缝滚动）。
 */
function createRainbowPillarTexture(): Texture {
  const width = 64;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) {
    const segments = 24;
    const band = width / segments;
    for (let i = 0; i < segments; i++) {
      context.fillStyle = `hsl(${(i / segments) * 360} 92% 62%)`;
      // 多画 1px，避免浮点误差留下竖条缝隙。
      context.fillRect(Math.floor(i * band), 0, Math.ceil(band) + 1, height);
    }

    context.globalCompositeOperation = 'destination-in';
    const vertical = context.createLinearGradient(0, 0, 0, height);
    vertical.addColorStop(0, 'rgba(0,0,0,0)');
    vertical.addColorStop(GEM_VISUALS.pillarFadeStart, 'rgba(0,0,0,0.06)');
    vertical.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    vertical.addColorStop(0.82, 'rgba(0,0,0,0.8)');
    vertical.addColorStop(1, 'rgba(0,0,0,0.55)');
    context.fillStyle = vertical;
    context.fillRect(0, 0, width, height);

    const horizontal = context.createLinearGradient(0, 0, width, 0);
    horizontal.addColorStop(0, 'rgba(0,0,0,0.82)');
    horizontal.addColorStop(0.12, 'rgba(0,0,0,1)');
    horizontal.addColorStop(0.88, 'rgba(0,0,0,1)');
    horizontal.addColorStop(1, 'rgba(0,0,0,0.82)');
    context.fillStyle = horizontal;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // 周向重复，才能靠 offset.x 滚动彩虹而不跳到空白处。
  texture.wrapS = RepeatWrapping;
  return texture;
}

/**
 * 荧光石本体：每个三角面一种颜色，色相按黄金角错开，相邻面颜色差异明显。
 * 返回的几何体带 `color` 属性，配合顶点色材质使用。
 */
function paintRainbowFaces(geometry: BufferGeometry): BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  if (source !== geometry) geometry.dispose();

  const position = source.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  const faces = Math.floor(position.count / 3);
  for (let face = 0; face < faces; face++) {
    color.setHSL((face * 0.618) % 1, 0.92, 0.62);
    for (let vertex = 0; vertex < 3; vertex++) {
      const offset = (face * 3 + vertex) * 3;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
  }
  source.setAttribute('color', new BufferAttribute(colors, 3));
  return source;
}

/**
 * 按形状生成宝石本体：八面体、二十面体、四面体、十二面体、双锥、钻石切面、
 * 六棱晶体和多面体球。所有形状的最大外径都对齐到 GEM_VISUALS.size，
 * 只是轮廓不同，摆在远处也能一眼分出种类。
 */
function createGemShape(shape: GemShape): BufferGeometry {
  const r = GEM_VISUALS.size * 0.5;
  switch (shape) {
    case 'octahedron':
      return new OctahedronGeometry(r, 0);
    case 'icosahedron':
      return new IcosahedronGeometry(r, 0);
    case 'tetrahedron':
      // 四面体体积小，外接球略放大一点，看起来才和其它宝石一样大。
      return new TetrahedronGeometry(r * 1.08, 0);
    case 'dodecahedron':
      return new DodecahedronGeometry(r, 0);
    case 'bipyramid':
      // 上下两个锥体：赤道最宽、两端收尖。
      return new LatheGeometry(
        [
          new Vector2(0, -r),
          new Vector2(r * 0.92, -r * 0.16),
          new Vector2(r * 0.92, r * 0.16),
          new Vector2(0, r),
        ],
        6,
      );
    case 'brilliant':
      // 钻石切面：底部尖、腰线最宽、冠部收成台面。
      return new LatheGeometry(
        [
          new Vector2(0, -r * 1.1),
          new Vector2(r * 0.92, -r * 0.2),
          new Vector2(r * 0.62, r * 0.16),
          new Vector2(r * 0.5, r * 0.3),
          new Vector2(0, r * 0.3),
        ],
        10,
      );
    case 'crystal':
      // 六棱晶体：两条棱柱面收向两端尖顶。
      return new LatheGeometry(
        [
          new Vector2(0, -r * 1.05),
          new Vector2(r * 0.58, -r * 0.55),
          new Vector2(r * 0.58, r * 0.62),
          new Vector2(0, r * 1.05),
        ],
        6,
      );
    case 'orb':
      // 细分 1 次 = 80 个三角面，每个面一种颜色，看起来像一块彩色马赛克球。
      return paintRainbowFaces(new IcosahedronGeometry(r, 1));
  }
}

/**
 * 宝石系统：固定宝石随区块扫描生成，红宝石跟随动物，紫宝石只在雨雪天出现，
 * 荧光石只在夜晚出现。
 *
 * 每颗宝石 = 1 个发光多面体 + 1 张始终朝向相机的光晕 + 1 根半透明光柱，
 * 最多十余颗同时存在，因此不为了省 draw call 做实例化。
 */
export class GemManager {
  private readonly root = new Group();
  private readonly gemGeometries = new Map<GemKind, BufferGeometry>();
  private readonly pillarGeometry: CylinderGeometry;
  private readonly glowTexture: Texture;
  private readonly rainbowGlowTexture: Texture;
  private readonly pillarTexture: Texture;
  private readonly rainbowPillarTexture: Texture;
  private readonly gemMaterials = new Map<
    GemKind,
    MeshStandardMaterial | MeshBasicMaterial
  >();
  private readonly haloMaterials = new Map<GemKind, SpriteMaterial>();
  private readonly pillarMaterials = new Map<GemKind, MeshBasicMaterial>();

  private readonly entries = new Map<string, GemEntry>();
  private readonly chunkCache = new Map<string, GemSite[]>();

  private scanTimer = 0;
  private time = 0;
  private lastWaterLevel = WATER_LEVEL;

  private purpleTimer = 0;
  private purpleSerial = 0;
  private glowTimer = 0;
  private glowSerial = 0;
  /** 开局先等一会儿再找动物，避免一进游戏就有宝石贴在牛身上。 */
  private redTimer = GEM_DYNAMIC.red.retryInterval * 0.5;
  private redFollowTimer = 0;
  private redLostTimer = 0;

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly seed: number,
    private readonly sightings: () => WildlifeSighting[],
    private readonly random: RandomSource = Math.random,
  ) {
    this.root.name = 'gems';
    scene.add(this.root);

    this.pillarGeometry = new CylinderGeometry(
      GEM_VISUALS.pillarRadius,
      GEM_VISUALS.pillarRadius,
      GEM_VISUALS.pillarHeight,
      12,
      1,
      true,
    );
    this.pillarGeometry.translate(0, GEM_VISUALS.pillarHeight * 0.5, 0);
    this.glowTexture = createGlowTexture();
    this.rainbowGlowTexture = createRainbowGlowTexture();
    this.pillarTexture = createPillarTexture();
    this.rainbowPillarTexture = createRainbowPillarTexture();

    for (const kind of GEM_KINDS) {
      const definition = GEM_DEFINITIONS[kind];
      this.gemGeometries.set(kind, createGemShape(definition.shape));

      if (kind === 'glow') {
        // 荧光石每个面一种颜色：顶点色 + 无光照材质，颜色不会被灯光或色调映射冲白。
        this.gemMaterials.set(
          kind,
          new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
        );
        this.haloMaterials.set(
          kind,
          new SpriteMaterial({
            map: this.rainbowGlowTexture,
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            // 加色混合会把彩虹相加成白，这里用普通混合保留多色本身。
            depthWrite: false,
            fog: false,
            toneMapped: false,
          }),
        );
        this.pillarMaterials.set(
          kind,
          new MeshBasicMaterial({
            map: this.rainbowPillarTexture,
            transparent: true,
            opacity: GEM_VISUALS.pillarOpacity,
            depthWrite: false,
            side: DoubleSide,
            fog: false,
            toneMapped: false,
          }),
        );
        continue;
      }

      this.gemMaterials.set(
        kind,
        new MeshStandardMaterial({
          color: definition.color,
          emissive: definition.glow,
          emissiveIntensity: kind === 'black' ? 2.4 : 1.5,
          metalness: 0.25,
          roughness: 0.18,
          flatShading: true,
        }),
      );
      this.haloMaterials.set(
        kind,
        new SpriteMaterial({
          map: this.glowTexture,
          color: definition.glow,
          transparent: true,
          opacity: GEM_VISUALS.haloOpacity,
          blending: AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
      );
      this.pillarMaterials.set(
        kind,
        new MeshBasicMaterial({
          map: this.pillarTexture,
          // 普通透明混合而不是加色混合：近看不会把颜色冲成一片白。
          color: definition.glow,
          transparent: true,
          opacity: GEM_VISUALS.pillarOpacity,
          depthWrite: false,
          side: DoubleSide,
          fog: false,
          toneMapped: false,
        }),
      );
    }
  }

  update(
    dt: number,
    state: PlayerState,
    weather: WeatherSnapshot,
    waterLevel: number,
    /** 当前日照因子（0 = 深夜，1 = 正午）：荧光石只在夜晚出现。 */
    daylight: number,
  ): void {
    this.time += dt;

    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = GEM_SPAWN.scanInterval;
      this.scanStatic(state.x, state.z, waterLevel);
    }

    this.updateRed(dt, state.x, state.z);
    this.updatePurple(dt, state.x, state.z, weather, waterLevel);
    this.updateGlow(dt, state.x, state.z, daylight, waterLevel);
    if (Math.abs(waterLevel - this.lastWaterLevel) > 0.02) {
      this.lastWaterLevel = waterLevel;
      this.refreshSurfaces(waterLevel);
    }

    for (const entry of this.entries.values()) {
      entry.gem.rotation.y += dt * GEM_VISUALS.spinSpeed;
      const pulse = 1 + Math.sin(this.time * 2.1 + entry.phase) * 0.04;
      entry.halo.scale.setScalar(GEM_VISUALS.haloScale * pulse);
    }

    this.updateGlowEffects(dt);
  }

  getPopulation(): Record<string, number> {
    const population: Record<string, number> = {};
    for (const kind of GEM_KINDS) population[kind] = 0;
    for (const entry of this.entries.values()) {
      population[entry.kind] = (population[entry.kind] ?? 0) + 1;
    }
    return population;
  }

  /** 调试：列出附近区块里由地形规则决定的站点，方便定位/截图。 */
  sitesNear(x: number, z: number, chunkRadius = 3): GemSite[] {
    const radius = Math.min(Math.max(Math.floor(chunkRadius), 1), 8);
    const cx = Math.round(x / CHUNK_SIZE);
    const cz = Math.round(z / CHUNK_SIZE);
    const sites: GemSite[] = [];
    for (let ix = cx - radius; ix <= cx + radius; ix++) {
      for (let iz = cz - radius; iz <= cz + radius; iz++) {
        sites.push(...staticGemSitesInChunk(this.world, this.seed, ix, iz));
      }
    }
    return sites;
  }

  getSightings(): GemSighting[] {
    const spots: GemSighting[] = [];
    for (const entry of this.entries.values()) {
      spots.push({
        kind: entry.kind,
        x: entry.x,
        y: entry.baseY + GEM_VISUALS.centerHeight,
        z: entry.z,
        ...(entry.animalKind ? { attached: entry.animalKind } : {}),
      });
    }
    return spots;
  }

  dispose(): void {
    for (const entry of this.entries.values()) this.root.remove(entry.group);
    this.entries.clear();
    this.chunkCache.clear();
    this.scene.remove(this.root);

    for (const geometry of this.gemGeometries.values()) geometry.dispose();
    this.gemGeometries.clear();
    this.pillarGeometry.dispose();
    this.glowTexture.dispose();
    this.rainbowGlowTexture.dispose();
    this.pillarTexture.dispose();
    this.rainbowPillarTexture.dispose();
    for (const material of this.gemMaterials.values()) material.dispose();
    for (const material of this.haloMaterials.values()) material.dispose();
    for (const material of this.pillarMaterials.values()) material.dispose();
  }

  /** 扫描玩家附近区块：计算固定宝石站点，够了就生成，走远就回收。 */
  private scanStatic(playerX: number, playerZ: number, waterLevel: number): void {
    const playerCx = Math.round(playerX / CHUNK_SIZE);
    const playerCz = Math.round(playerZ / CHUNK_SIZE);
    const radius = GEM_SPAWN.chunkRadius;
    const needed: Array<{ cx: number; cz: number; distance: number }> = [];

    for (let cx = playerCx - radius; cx <= playerCx + radius; cx++) {
      for (let cz = playerCz - radius; cz <= playerCz + radius; cz++) {
        needed.push({
          cx,
          cz,
          distance: (cx * CHUNK_SIZE - playerX) ** 2 + (cz * CHUNK_SIZE - playerZ) ** 2,
        });
      }
    }
    needed.sort((a, b) => a.distance - b.distance);

    let budget = GEM_SPAWN.chunkBudget;
    for (const chunk of needed) {
      const key = `${chunk.cx}:${chunk.cz}`;
      let sites = this.chunkCache.get(key);
      if (!sites) {
        if (budget <= 0) continue;
        budget--;
        sites = staticGemSitesInChunk(this.world, this.seed, chunk.cx, chunk.cz);
        this.chunkCache.set(key, sites);
        if (this.chunkCache.size > GEM_SPAWN.chunkCacheLimit) {
          const oldest = this.chunkCache.keys().next().value;
          if (oldest !== undefined) this.chunkCache.delete(oldest);
        }
      }

      for (const site of sites) this.spawnSite(site, waterLevel);
    }

    // 离开太远的固定宝石直接回收；红宝石由跟随逻辑处理。
    for (const entry of this.entries.values()) {
      if (entry.kind === 'red') continue;
      const dx = entry.x - playerX;
      const dz = entry.z - playerZ;
      if (dx * dx + dz * dz > GEM_SPAWN.despawnRadius ** 2) this.removeEntry(entry);
    }
  }

  private spawnSite(site: GemSite, waterLevel: number): void {
    if (this.entries.has(site.key)) return;
    const limit = GEM_DEFINITIONS[site.kind].maxActive;
    if (this.countKind(site.kind) >= limit) return;

    const baseY = this.surfaceY(site.x, site.z, waterLevel);
    this.addEntry(site.key, site.kind, site.x, site.z, baseY);
  }

  private updateRed(dt: number, playerX: number, playerZ: number): void {
    const red = this.findKind('red');
    if (!red) {
      this.redTimer -= dt;
      if (this.redTimer > 0) return;

      this.redTimer = GEM_DYNAMIC.red.retryInterval;
      if (this.random() >= GEM_DYNAMIC.red.chance) return;
      this.attachRed(playerX, playerZ);
      return;
    }

    this.redFollowTimer -= dt;
    if (this.redFollowTimer > 0) return;
    this.redFollowTimer = 0.2;

    const target = this.findAnimalTarget(red, playerX, playerZ);
    if (!target) {
      this.redLostTimer += 0.2;
      if (this.redLostTimer > GEM_DYNAMIC.red.lostGrace) {
        this.removeEntry(red);
      }
      return;
    }

    this.redLostTimer = 0;
    red.x = target.x;
    red.z = target.z;
    red.baseY = Math.max(target.y + GEM_DYNAMIC.red.rideHeight, this.lastWaterLevel);
    red.group.position.set(red.x, red.baseY, red.z);
  }

  private attachRed(playerX: number, playerZ: number): void {
    const candidates = this.sightings()
      .filter((spot) => SPECIES_OF_RED.includes(spot.kind))
      .map((spot) => ({
        ...spot,
        distance: (spot.x - playerX) ** 2 + (spot.z - playerZ) ** 2,
      }))
      .filter((spot) => spot.distance <= GEM_DYNAMIC.red.maxDistance ** 2)
      .sort((a, b) => a.distance - b.distance);
    const target = candidates[0];
    if (!target) return;

    const key = 'red:animal';
    const baseY = Math.max(target.y + GEM_DYNAMIC.red.rideHeight, this.lastWaterLevel);
    const entry = this.addEntry(key, 'red', target.x, target.z, baseY);
    entry.animalKind = target.kind;
    this.redLostTimer = 0;
    this.redFollowTimer = 0.2;
  }

  private findAnimalTarget(
    red: GemEntry,
    playerX: number,
    playerZ: number,
  ): WildlifeSighting | null {
    const all = this.sightings().filter(
      (spot) => spot.kind === red.animalKind || SPECIES_OF_RED.includes(spot.kind),
    );
    if (all.length === 0) return null;

    let best: WildlifeSighting | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const spot of all) {
      // 优先匹配原来那只动物：按离上一次位置最近来近似“同一只”。
      const dx = spot.x - red.x;
      const dz = spot.z - red.z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = spot;
      }
    }
    if (!best) return null;

    // 动物走丢后不要跨半张地图追过去，交给无目标逻辑回收。
    const playerDistance =
      (best.x - playerX) ** 2 + (best.z - playerZ) ** 2;
    if (playerDistance > (GEM_DYNAMIC.red.maxDistance * 1.6) ** 2) return null;
    if (bestDistance > 90 ** 2) return null;
    return best;
  }

  private updatePurple(
    dt: number,
    playerX: number,
    playerZ: number,
    weather: WeatherSnapshot,
    waterLevel: number,
  ): void {
    if (weather.precipitation < GEM_DYNAMIC.purple.minPrecipitation) {
      for (const entry of this.entries.values()) {
        if (entry.kind === 'purple') this.removeEntry(entry);
      }
      return;
    }

    this.purpleTimer -= dt;
    if (this.purpleTimer > 0) return;
    this.purpleTimer = GEM_DYNAMIC.purple.interval;

    if (this.countKind('purple') >= GEM_DEFINITIONS.purple.maxActive) return;
    if (this.random() >= GEM_DYNAMIC.purple.chance) return;

    const spot = this.findOpenSpot(playerX, playerZ, GEM_DYNAMIC.purple, true);
    if (!spot) return;

    const key = `purple:${this.purpleSerial++}`;
    this.addEntry(key, 'purple', spot.x, spot.z, this.surfaceY(spot.x, spot.z, waterLevel));
  }

  /**
   * 荧光石：日照因子低于阈值时每 3.5 秒掷一次，在玩家周围的任意开阔地生成；
   * 天亮后立即回收，所以白天不会在场景里留下彩色光柱。
   */
  private updateGlow(
    dt: number,
    playerX: number,
    playerZ: number,
    daylight: number,
    waterLevel: number,
  ): void {
    if (daylight >= GEM_DYNAMIC.glow.maxDaylight) {
      for (const entry of this.entries.values()) {
        if (entry.kind === 'glow') this.removeEntry(entry);
      }
      return;
    }

    this.glowTimer -= dt;
    if (this.glowTimer > 0) return;
    this.glowTimer = GEM_DYNAMIC.glow.interval;

    if (this.countKind('glow') >= GEM_DEFINITIONS.glow.maxActive) return;
    if (this.random() >= GEM_DYNAMIC.glow.chance) return;

    const spot = this.findOpenSpot(playerX, playerZ, GEM_DYNAMIC.glow, false);
    if (!spot) return;

    const key = `glow:${this.glowSerial++}`;
    this.addEntry(key, 'glow', spot.x, spot.z, this.surfaceY(spot.x, spot.z, waterLevel));
  }

  /**
   * 荧光石的多色是同时存在的：光晕缓慢自转、光柱彩虹沿柱面滚动，
   * 每一帧都能看到好几种颜色，而不是整体换色。
   */
  private updateGlowEffects(dt: number): void {
    const halo = this.haloMaterials.get('glow');
    if (halo) halo.rotation += dt * GEM_VISUALS.glowHaloSpin;
    this.rainbowPillarTexture.offset.x =
      (this.rainbowPillarTexture.offset.x + dt * GEM_VISUALS.glowPillarScroll) % 1;
  }

  /**
   * 动态宝石的落点：玩家周围的环形随机点，避开道路、水面与已有宝石；
   * 紫宝石额外避开沙漠，荧光石允许出现在任何生境。
   */
  private findOpenSpot(
    playerX: number,
    playerZ: number,
    config: { readonly minDistance: number; readonly maxDistance: number },
    avoidDesert: boolean,
  ): { x: number; z: number } | null {
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = this.random() * Math.PI * 2;
      const distance =
        config.minDistance + this.random() * (config.maxDistance - config.minDistance);
      const x = playerX + Math.cos(angle) * distance;
      const z = playerZ + Math.sin(angle) * distance;

      if (Math.abs(x - this.world.roadX(z)) < ROAD_WIDTH * 0.5 + 2) continue;
      if (avoidDesert && this.world.habitatDesertAt(x, z) > 0.25) continue;
      if (this.world.groundAt(x, z) < WATER_LEVEL + 0.5) continue;

      let tooClose = false;
      for (const entry of this.entries.values()) {
        if (Math.hypot(entry.x - x, entry.z - z) < 12) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      return { x, z };
    }
    return null;
  }

  private addEntry(
    key: string,
    kind: GemKind,
    x: number,
    z: number,
    baseY: number,
  ): GemEntry {
    const group = new Group();
    group.position.set(x, baseY, z);

    const gem = new Mesh(this.gemGeometries.get(kind)!, this.gemMaterials.get(kind)!);
    gem.position.y = GEM_VISUALS.centerHeight;
    group.add(gem);

    const halo = new Sprite(this.haloMaterials.get(kind)!);
    halo.position.y = GEM_VISUALS.centerHeight;
    halo.scale.setScalar(GEM_VISUALS.haloScale);
    group.add(halo);

    const pillar = new Mesh(this.pillarGeometry, this.pillarMaterials.get(kind)!);
    group.add(pillar);

    this.root.add(group);
    const entry: GemEntry = {
      key,
      kind,
      group,
      gem,
      halo,
      x,
      z,
      baseY,
      phase: (x * 0.17 + z * 0.23) % (Math.PI * 2),
    };
    this.entries.set(key, entry);
    return entry;
  }

  private refreshSurfaces(waterLevel: number): void {
    for (const entry of this.entries.values()) {
      if (entry.kind === 'red') continue;
      entry.baseY = this.surfaceY(entry.x, entry.z, waterLevel);
      entry.group.position.y = entry.baseY;
    }
  }

  private surfaceY(x: number, z: number, waterLevel: number): number {
    return Math.max(this.world.groundAt(x, z), waterLevel);
  }

  private countKind(kind: GemKind): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.kind === kind) count++;
    }
    return count;
  }

  private findKind(kind: GemKind): GemEntry | null {
    for (const entry of this.entries.values()) {
      if (entry.kind === kind) return entry;
    }
    return null;
  }

  private removeEntry(entry: GemEntry): void {
    this.entries.delete(entry.key);
    this.root.remove(entry.group);
  }
}
