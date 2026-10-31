import type { PerspectiveCamera, Scene } from 'three';
import type { GemKind } from '../config/gems';
import type { GemSighting } from '../gems/GemManager';
import type { GemSite } from '../gems/sites';
import type { WeatherKind, WeatherLevel } from '../config/weather';
import type { PlayerState } from '../player/Player';
import type { SaveResult } from '../save/SaveService';
import type { SaveData } from '../save/types';
import type { World } from '../world/World';
import type { ChunkView, RoadView } from '../world/streaming/types';

/** 控制台调试接口；保留与原始版本同名的 window.__wild。 */
export interface WildDebugApi {
  player: PlayerState;
  world: World;
  chunks: ReadonlyMap<string, ChunkView>;
  roads: ReadonlyMap<number, RoadView>;
  camera: PerspectiveCamera;
  /** 主场景，便于在控制台里检查具体对象。 */
  scene: Scene;
  setAuto(value: boolean): void;
  getSpeed(): number;
  setSpeed(scale: number): void;
  height(x: number, z: number): number;
  /** 沙漠因子：1 为核心沙漠，0 为普通地形。 */
  desertAt(x: number, z: number): number;
  desertFactor(): number;
  /** 调试：传送到最近的沙漠边缘并面朝沙漠。 */
  toDesertEdge(): void;
  /** 调试：传送到最近的绿洲湖边并面朝湖心。 */
  toOasisEdge(): void;
  /** 调试：打开/关闭天穹摄像机大视野。 */
  openSkyView(): void;
  closeSkyView(): void;
  isBigMapOpen(): boolean;
  isSkyViewOpen(): boolean;
  /** 实时帧率（最近 0.5 秒平均值），与左上角 HUD 显示一致。 */
  getFps(): number;
  /** 上一帧主视角渲染的绘制统计，用于排查掉帧。 */
  renderStats(): {
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    chunks: number;
  };
  getHour(): number;
  setHour(hour: number): void;
  /** 存档：打开 / 关闭面板、保存与载入、导入导出。 */
  openSavePanel(): void;
  closeSavePanel(): void;
  isSavePanelOpen(): boolean;
  /** 启动时是否自动读取了同种子的本地存档。 */
  didRestoreSave(): boolean;
  saveGame(): SaveResult;
  loadGame(): SaveResult;
  getLocalSave(): SaveData | null;
  exportSaveText(): { name: string; text: string };
  importSaveText(text: string): SaveResult;
  getWeather(): {
    kind: WeatherKind;
    level: WeatherLevel;
    auto: boolean;
    rain: number;
    snow: number;
    precipitation: number;
    snowCoverage: number;
    waterLevelOffset: number;
  };
  setWeather(kind: WeatherKind, level?: WeatherLevel): void;
  setWeatherAuto(enabled: boolean): void;
  wildlifePopulation(): Record<string, number>;
  wildlifeSightings(): Array<{
    kind: string;
    /** 鸟的稳定编号（用于观察同一只鸟的状态变化）；其它动物没有该字段。 */
    id?: number;
    x: number;
    y: number;
    z: number;
    /** 鸟的当前状态（fly / landing / perched / takeoff）；其它动物没有该字段。 */
    mode?: string;
  }>;
  /** 各类宝石当前数量。 */
  gemPopulation(): Record<GemKind, number>;
  /** 各类宝石当前位置；红宝石带 attached（附着的动物种类）。 */
  gemSightings(): GemSighting[];
  /** 玩家附近由地形规则决定的宝石站点（调试找点用，不代表已经生成）。 */
  gemSitesNear(chunkRadius?: number): GemSite[];
  villageStats(): { houses: number; villagers: number; smokeEmitters: number };
}

declare global {
  interface Window {
    __wild?: WildDebugApi;
  }
}
