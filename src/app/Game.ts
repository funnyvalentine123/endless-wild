import { InputManager } from '../input/InputManager';
import { requestPointerLock } from '../input/pointerLock';
import type { InputAction } from '../input/types';
import { GameLoop } from '../core/GameLoop';
import { requireElement } from '../core/dom';
import { FAST_TIME_SCALE, NORMAL_TIME_SCALE } from '../config/daynight';
import { DESERT } from '../config/desert';
import { WATER_LEVEL } from '../config/world';
import {
  formatWeatherLabel,
  type WeatherKind,
  type WeatherLevel,
} from '../config/weather';
import { CameraRig } from '../player/CameraRig';
import { Hero } from '../player/Hero';
import { Player } from '../player/Player';
import { SceneEnvironment } from '../render/environment/SceneEnvironment';
import { Viewport } from '../render/Viewport';
import { downloadTextFile } from '../save/download';
import { SaveService } from '../save/SaveService';
import { SaveStore } from '../save/SaveStore';
import { summarizeSave } from '../save/codec';
import { DayNightCycle } from '../systems/DayNightCycle';
import { WeatherEffects } from '../systems/WeatherEffects';
import { WeatherSystem } from '../systems/WeatherSystem';
import { BigMap } from '../ui/BigMap';
import { VillageManager } from '../village/VillageManager';
import { Hud } from '../ui/Hud';
import { Minimap } from '../ui/Minimap';
import { SavePanel, type SavePanelModel } from '../ui/SavePanel';
import { SpeedControl } from '../ui/SpeedControl';
import { SkyView } from '../ui/SkyView';
import { StartScreen } from '../ui/StartScreen';
import { Toolbar } from '../ui/Toolbar';
import { WeatherControl } from '../ui/WeatherControl';
import { World } from '../world/World';
import { WorldMaterials } from '../world/WorldMaterials';
import { RoadPropAssets } from '../world/assets/RoadPropAssets';
import { VegetationAssets } from '../world/assets/VegetationAssets';
import { buildSeedUrl, createRandomWorldSeed, persistWorldSeed, resolveWorldSeed } from '../world/seed';
import { findNearestDesertEdge } from '../world/desertTravel';
import { findNearestOasisEdge } from '../world/oasisTravel';
import { WildlifeManager } from '../wildlife/WildlifeManager';
import { ChunkMeshBuilder } from '../world/streaming/ChunkMeshBuilder';
import { RoadMeshBuilder } from '../world/streaming/RoadMeshBuilder';
import { WorldStreamer } from '../world/streaming/WorldStreamer';

/**
 * 游戏顶层编排器：只负责依赖装配、主循环顺序和 UI 状态同步。
 * 具体的世界、渲染、输入、物理逻辑都在各自模块中。
 */
export class Game {
  private readonly seed: number;
  private readonly viewport: Viewport;
  private readonly world: World;
  private readonly materials: WorldMaterials;
  private readonly vegetationAssets: VegetationAssets;
  private readonly roadPropAssets: RoadPropAssets;
  private readonly environment: SceneEnvironment;
  private readonly wildlife: WildlifeManager;
  private readonly village: VillageManager;
  private readonly streamer: WorldStreamer;
  private readonly player: Player;
  private readonly hero: Hero;
  private readonly cameraRig: CameraRig;
  private readonly input: InputManager;
  private readonly dayNight: DayNightCycle;
  private readonly weather: WeatherSystem;
  private readonly weatherEffects: WeatherEffects;
  private readonly hud: Hud;
  private readonly minimap: Minimap;
  private readonly bigMap: BigMap;
  private readonly skyView: SkyView;
  private readonly save: SaveService;
  private readonly savePanel: SavePanel;
  private readonly startScreen: StartScreen;
  private readonly toolbar: Toolbar;
  private readonly speedControl: SpeedControl;
  private readonly weatherControl: WeatherControl;
  private readonly loop: GameLoop;
  private readonly canvas: HTMLCanvasElement;

  private started = false;
  private autoWalk = false;
  private fastTime = false;
  private thirdPerson = false;
  private mapOpen = false;
  private restoredFromSave = false;
  private elapsed = 0;
  private desertFactor = 0;
  private uiWeatherBlocked = false;
  private uiWeatherKind: WeatherKind | null = null;
  private uiWeatherLevel: WeatherLevel | null = null;
  private uiWeatherAuto: boolean | null = null;

  constructor() {
    // 有本地存档时把它的种子作为兜底：URL 与上次游玩的世界优先，避免旧存档把世界拉回去。
    const archived = SaveStore.local().load();
    this.seed = resolveWorldSeed(window.location.search, undefined, archived?.seed ?? null);
    this.world = new World(this.seed);

    const canvas = requireElement<HTMLCanvasElement>('c');
    this.canvas = canvas;
    this.viewport = new Viewport(canvas);

    this.materials = new WorldMaterials();
    this.vegetationAssets = new VegetationAssets();
    this.roadPropAssets = new RoadPropAssets();
    this.environment = new SceneEnvironment(this.viewport.scene);
    this.wildlife = new WildlifeManager(
      this.viewport.scene,
      this.world,
      this.materials.vegetation,
    );
    this.village = new VillageManager(
      this.viewport.scene,
      this.world,
      this.materials.vegetation,
    );

    const chunkBuilder = new ChunkMeshBuilder(
      this.world,
      this.seed,
      this.materials,
      this.vegetationAssets,
    );
    const roadBuilder = new RoadMeshBuilder(this.world, this.materials, this.roadPropAssets);
    this.streamer = new WorldStreamer(this.viewport.scene, chunkBuilder, roadBuilder);

    this.player = new Player(this.world, this.streamer);
    this.hero = new Hero(this.viewport.scene);
    this.cameraRig = new CameraRig(this.viewport.camera, this.world);
    this.dayNight = new DayNightCycle();
    this.weather = new WeatherSystem();
    this.weatherEffects = new WeatherEffects();

    this.save = new SaveService({
      seed: this.seed,
      getHour: () => this.dayNight.hour,
      setHour: (hour) => this.dayNight.setHour(hour),
      getPlayer: () => {
        const state = this.player.state;
        return {
          x: state.x,
          y: state.y,
          z: state.z,
          yaw: state.yaw,
          pitch: state.pitch,
          walked: state.walked,
        };
      },
      restorePlayer: (player) => {
        this.player.restore(player);
        this.cameraRig.reset();
      },
      reloadToSeed: (seed) => this.reloadToSeed(seed),
    });
    // 启动续档：只有存档与当前种子一致时才回到保存点，换世界不会被旧存档干扰。
    this.restoredFromSave = this.save.restoreOnStart();

    this.desertFactor = this.world.desertAt(this.player.state.x, this.player.state.z);
    this.weather.setDesertFactor(this.desertFactor);

    this.hud = new Hud(this.world, this.seed);
    this.minimap = new Minimap(this.world);
    this.bigMap = new BigMap(this.world, {
      onOpenRequest: () => this.openMap(),
      onCloseRequest: () => this.closeMap(),
    });
    this.skyView = new SkyView(this.viewport, this.environment, this.world, {
      onOpenRequest: () => this.openSkyView(),
      onCloseRequest: () => this.closeSkyView(),
    });

    this.input = new InputManager(
      canvas,
      {
        joystick: requireElement('joy'),
        knob: requireElement('joyK'),
        jumpButton: requireElement<HTMLButtonElement>('jumpBtn'),
      },
      this.handleInputAction,
    );
    // 大视野打开时不请求 Pointer Lock，改为按住地图画面拖动转向。
    this.input.bindLookSurface(requireElement<HTMLElement>('bigMapCanvas'));
    this.input.bindLookSurface(requireElement<HTMLElement>('skyViewCanvas'));

    this.startScreen = new StartScreen(() => this.beginExploration());
    this.toolbar = new Toolbar({
      onToggleAuto: () => this.setAutoWalk(!this.autoWalk),
      onToggleTime: () => this.setFastTime(!this.fastTime),
      onToggleView: () => this.setThirdPerson(!this.thirdPerson),
      onTeleportDesert: () => this.teleportToDesert(),
      onTeleportOasis: () => this.teleportToOasis(),
      onOpenSave: () => this.openSavePanel(),
      onNewWorld: () => this.loadNewWorld(),
    });
    this.speedControl = new SpeedControl({
      onStep: (direction) => this.setSpeedScale(this.player.stepSpeedScale(direction)),
      onSet: (scale) => this.setSpeedScale(scale),
    });
    this.speedControl.setValue(this.player.speedScale);
    this.weatherControl = new WeatherControl({
      onAutoChange: (enabled) => this.setWeatherAuto(enabled),
      onManualChange: (kind, level) => this.setManualWeather(kind, level),
    });
    this.weatherControl.setState(this.weather.snapshot);

    this.savePanel = new SavePanel(
      {
        save: () => this.save.saveLocal().message,
        load: () => this.save.loadLocal().message,
        export: () => this.exportSaveFile(),
        import: (text) => this.save.importText(text).message,
        remove: () => {
          if (!window.confirm('删除本地存档？此操作无法撤销。')) return '已取消删除。';
          return this.save.removeLocal().message;
        },
        model: () => this.savePanelModel(),
      },
      { onCloseRequest: () => this.closeSavePanel() },
    );

    this.loop = new GameLoop((dt) => this.update(dt));

    this.startScreen.setReady(this.seed, this.restoredFromSave ? '已读取本地存档' : null);
    this.hud.forceUpdate(
      this.player.state,
      this.dayNight.hour,
      formatWeatherLabel(this.weather.kind, this.weather.level),
    );
    this.installDebugApi();
    this.startScreen.focus();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.streamer.dispose();
    this.wildlife.dispose();
    this.village.dispose();
    this.hero.dispose();
    this.environment.dispose();
    this.viewport.dispose();
    this.vegetationAssets.dispose();
    this.roadPropAssets.dispose();
    this.materials.dispose();
    this.bigMap.dispose();
    this.skyView.dispose();
    this.savePanel.dispose();
    this.startScreen.dispose();
    this.toolbar.dispose();
    this.speedControl.dispose();
    this.weatherControl.dispose();
    delete window.__wild;
  }

  private update(dt: number): void {
    this.elapsed += dt;

    // 天气先推进，让玩家物理和水面使用本帧的新水位。
    const hoursPerSecond = this.fastTime ? FAST_TIME_SCALE : NORMAL_TIME_SCALE;
    this.desertFactor = this.world.desertAt(this.player.state.x, this.player.state.z);
    this.weather.setDesertFactor(this.desertFactor);
    this.weather.update(dt, hoursPerSecond);
    this.weatherEffects.update(dt, this.weather.snapshot, hoursPerSecond);
    this.materials.setSnowCoverage(this.weatherEffects.snowCoverage);

    const waterLevel = WATER_LEVEL + this.weatherEffects.waterLevelOffset;
    this.player.setWaterLevel(waterLevel);
    this.cameraRig.setWaterLevel(waterLevel);
    this.syncWeatherUi();

    const look = this.input.consumeLook();
    this.player.applyLook(look.yaw, look.pitch);

    let speed = 0;
    if (this.started) {
      speed = this.player.update(dt, this.input.getIntent(), this.autoWalk);
    } else {
      this.player.state.yaw += dt * 0.05;
    }

    const state = this.player.state;
    this.dayNight.update(dt, this.fastTime);
    this.streamer.update(state.x, state.z, state.yaw, this.started ? 2 : 4);
    this.village.update(dt, this.streamer.chunks);
    this.wildlife.update(dt, state.x, state.z);
    this.cameraRig.update(state, this.started, this.thirdPerson, dt);

    const daylight = this.dayNight.snapshot;
    this.materials.setWindowIntensity(daylight.lampIntensity);
    this.materials.setLampIntensity(daylight.lampIntensity);
    this.environment.applyDaylight(daylight, state.x, state.y, state.z);
    this.environment.applyWeather(this.weather.snapshot, this.weatherEffects.waterLevelOffset);
    this.environment.applyFlashlight(daylight, state);
    this.environment.update(
      dt,
      this.elapsed,
      state.x,
      state.z,
      this.viewport.camera.position,
    );

    this.hero.update(state, speed);
    this.hud.update(
      dt,
      state,
      this.dayNight.hour,
      formatWeatherLabel(this.weather.kind, this.weather.level),
    );
    this.minimap.update(dt, state);
    this.bigMap.update(dt, state);
    // 天穹俯瞰必须在主视角渲染之前：它借用画布一角渲染后立即拷走。
    if (this.started) this.skyView.update(dt, state);

    this.viewport.render();
  }

  private beginExploration(): void {
    if (this.started) return;

    this.started = true;
    this.startScreen.hide();
    this.input.setActive(true);
    if (!this.input.isTouch) requestPointerLock(this.canvas);
  }

  private openMap(): void {
    if (!this.started || this.mapOpen) return;

    // 先收起存档面板：它与大视野互斥，且不希望在打开地图时重新锁定鼠标。
    this.savePanel.close();
    this.mapOpen = true;
    // 两个大视野不同时打开：大地图会完全盖住天穹视角。
    this.skyView.close();
    this.input.setOverlayMode(true);
    if (document.pointerLockElement) document.exitPointerLock();
    this.bigMap.open(this.player.state);
  }

  private closeMap(): void {
    if (!this.mapOpen) return;

    this.mapOpen = false;
    this.bigMap.close();
    this.releaseOverlayInput();
  }

  private toggleMap(): void {
    if (this.mapOpen) this.closeMap();
    else this.openMap();
  }

  /** N 键：打开 / 关闭天穹大视野。 */
  private toggleSkyView(): void {
    if (!this.started) return;
    if (this.skyView.isOpen) this.closeSkyView();
    else this.openSkyView();
  }

  /** 打开天穹大视野：与大地图同时只保留一个，但仍可继续行走。 */
  private openSkyView(): void {
    if (!this.started || this.skyView.isOpen) return;

    this.savePanel.close();
    if (this.mapOpen) {
      this.mapOpen = false;
      this.bigMap.close();
    }
    this.skyView.open(this.player.state);
    this.input.setOverlayMode(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private closeSkyView(): void {
    if (!this.skyView.isOpen) return;

    this.skyView.close();
    this.releaseOverlayInput();
  }

  /** Esc：优先关掉正在打开的覆盖层（存档面板 → 天穹 → 大地图）。 */
  private closeOverlays(): void {
    if (this.savePanel.isOpen) this.closeSavePanel();
    else if (this.skyView.isOpen) this.closeSkyView();
    else if (this.mapOpen) this.closeMap();
  }

  /** 存档面板 / 大视野都关掉后，才把 Pointer Lock 与鼠标转向交还给游戏。 */
  private releaseOverlayInput(): void {
    if (this.mapOpen || this.skyView.isOpen || this.savePanel.isOpen) return;

    this.input.setOverlayMode(false);
    if (!this.input.isTouch) requestPointerLock(this.canvas);
  }

  /** P 键 / 底部「存档」按钮：打开或关闭存档面板。 */
  private toggleSavePanel(): void {
    if (this.savePanel.isOpen) this.closeSavePanel();
    else this.openSavePanel();
  }

  private openSavePanel(): void {
    if (!this.started || this.savePanel.isOpen) return;

    // 先让面板进入打开状态：随后关闭大视野时 releaseOverlayInput 不会重新锁定鼠标。
    this.savePanel.open();
    if (this.mapOpen) this.closeMap();
    if (this.skyView.isOpen) this.closeSkyView();
    this.input.setOverlayMode(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private closeSavePanel(): void {
    if (!this.savePanel.isOpen) return;

    this.savePanel.close();
    this.releaseOverlayInput();
  }

  private exportSaveFile(): string {
    const { name, text } = this.save.createExport();
    downloadTextFile(name, text);
    return `已导出存档文件：${name}`;
  }

  private savePanelModel(): SavePanelModel {
    const local = this.save.readLocal();
    return {
      current: summarizeSave(this.save.snapshot()),
      local: local ? summarizeSave(local) : null,
      localAvailable: this.save.localAvailable,
    };
  }

  /** 载入另一个种子的存档：写回种子后整页重载，重载后自动续档。 */
  private reloadToSeed(seed: number): void {
    persistWorldSeed(seed);
    window.location.search = buildSeedUrl(seed);
  }

  private setAutoWalk(enabled: boolean): void {
    this.autoWalk = enabled;
    this.toolbar.setAuto(enabled);
  }

  private setFastTime(enabled: boolean): void {
    this.fastTime = enabled;
    this.toolbar.setTime(enabled);
  }

  private setThirdPerson(enabled: boolean): void {
    this.thirdPerson = enabled;
    this.hero.setVisible(enabled);
    this.toolbar.setView(enabled);
  }

  /** 调试：把玩家放到最近的沙漠边缘，并面朝沙漠。 */
  private teleportToDesert(): void {
    const state = this.player.state;
    const target = findNearestDesertEdge(this.world, state.x, state.z);
    if (!target) return;

    state.x = target.x;
    state.z = target.z;
    state.y = this.world.groundAt(target.x, target.z);
    state.vy = 0;
    state.grounded = true;
    state.yaw = target.yaw;
    state.pitch = -0.03;
    this.cameraRig.reset();
  }

  /** 调试：把玩家放到最近的绿洲湖边，并面朝湖心。 */
  private teleportToOasis(): void {
    const state = this.player.state;
    const target = findNearestOasisEdge(this.world, state.x, state.z);
    if (!target) return;

    state.x = target.x;
    state.z = target.z;
    state.y = this.world.groundAt(target.x, target.z);
    state.vy = 0;
    state.grounded = true;
    state.yaw = target.yaw;
    // 视线已经对准湖面，交还给玩家后不需要再调整。
    state.pitch = target.pitch;
    this.cameraRig.reset();
  }

  private setSpeedScale(scale: number): void {
    this.player.setSpeedScale(scale);
    this.speedControl.setValue(this.player.speedScale);
  }

  private setManualWeather(kind: WeatherKind, level: WeatherLevel): void {
    if (this.desertFactor >= DESERT.weatherUiBlock) return;
    this.weather.setManual(kind, level);
    this.syncWeatherUi(true);
  }

  private setWeatherAuto(enabled: boolean): void {
    if (enabled && this.desertFactor >= DESERT.weatherUiBlock) return;
    this.weather.setAuto(enabled);
    this.syncWeatherUi(true);
  }

  /** 自动天气变化后同步下拉框；只在类型/强度/模式/沙漠禁用状态变化时写 DOM。 */
  private syncWeatherUi(force = false): void {
    const weather = this.weather;
    const blocked = this.desertFactor >= DESERT.weatherUiBlock;

    if (blocked !== this.uiWeatherBlocked) {
      this.uiWeatherBlocked = blocked;
      this.weatherControl.setDisabled(blocked);
    }

    if (
      !force &&
      weather.kind === this.uiWeatherKind &&
      weather.level === this.uiWeatherLevel &&
      weather.auto === this.uiWeatherAuto
    ) {
      return;
    }

    this.uiWeatherKind = weather.kind;
    this.uiWeatherLevel = weather.level;
    this.uiWeatherAuto = weather.auto;
    this.weatherControl.setState(weather.snapshot);
  }

  private loadNewWorld(): void {
    const seed = createRandomWorldSeed();
    persistWorldSeed(seed);
    window.location.search = buildSeedUrl(seed);
  }

  private readonly handleInputAction = (action: InputAction): void => {
    if (action === 'toggle-auto') this.setAutoWalk(!this.autoWalk);
    else if (action === 'toggle-time') this.setFastTime(!this.fastTime);
    else if (action === 'toggle-view') this.setThirdPerson(!this.thirdPerson);
    else if (action === 'toggle-map') this.toggleMap();
    else if (action === 'toggle-sky-view') this.toggleSkyView();
    else if (action === 'toggle-save') this.toggleSavePanel();
    else if (action === 'close-map') this.closeOverlays();
    else if (action === 'speed-down') this.setSpeedScale(this.player.stepSpeedScale(-1));
    else if (action === 'speed-up') this.setSpeedScale(this.player.stepSpeedScale(1));
  };

  private installDebugApi(): void {
    window.__wild = {
      player: this.player.state,
      world: this.world,
      chunks: this.streamer.chunks,
      roads: this.streamer.roads,
      camera: this.viewport.camera,
      setAuto: (value: boolean) => this.setAutoWalk(value),
      getSpeed: () => this.player.speedScale,
      setSpeed: (scale: number) => this.setSpeedScale(scale),
      height: (x: number, z: number) => this.world.height(x, z),
      desertAt: (x: number, z: number) => this.world.desertAt(x, z),
      desertFactor: () => this.desertFactor,
      toDesertEdge: () => this.teleportToDesert(),
      toOasisEdge: () => this.teleportToOasis(),
      openSkyView: () => this.openSkyView(),
      closeSkyView: () => this.closeSkyView(),
      isBigMapOpen: () => this.bigMap.isOpen,
      isSkyViewOpen: () => this.skyView.isOpen,
      getFps: () => this.hud.fps,
      renderStats: () => ({
        // info 在每次 render 后重置，这里读到的是最后一次主视角渲染的统计。
        drawCalls: this.viewport.renderer.info.render.calls,
        triangles: this.viewport.renderer.info.render.triangles,
        geometries: this.viewport.renderer.info.memory.geometries,
        textures: this.viewport.renderer.info.memory.textures,
        chunks: this.streamer.chunks.size,
      }),
      openSavePanel: () => this.openSavePanel(),
      closeSavePanel: () => this.closeSavePanel(),
      isSavePanelOpen: () => this.savePanel.isOpen,
      didRestoreSave: () => this.restoredFromSave,
      saveGame: () => this.save.saveLocal(),
      loadGame: () => this.save.loadLocal(),
      getLocalSave: () => this.save.readLocal(),
      exportSaveText: () => this.save.createExport(),
      importSaveText: (text: string) => this.save.importText(text),
      getHour: () => this.dayNight.hour,
      setHour: (hour: number) => this.dayNight.setHour(hour),
      getWeather: () => ({
        kind: this.weather.kind,
        level: this.weather.level,
        auto: this.weather.auto,
        rain: this.weather.snapshot.rain,
        snow: this.weather.snapshot.snow,
        precipitation: this.weather.snapshot.precipitation,
        snowCoverage: this.weatherEffects.snowCoverage,
        waterLevelOffset: this.weatherEffects.waterLevelOffset,
      }),
      setWeather: (kind: WeatherKind, level: WeatherLevel = 'medium') =>
        this.setManualWeather(kind, level),
      setWeatherAuto: (enabled: boolean) => this.setWeatherAuto(enabled),
      wildlifePopulation: () => this.wildlife.getPopulation(),
      wildlifeSightings: () => this.wildlife.getSightings(),
      villageStats: () => this.village.getStats(),
    };
  }
}
