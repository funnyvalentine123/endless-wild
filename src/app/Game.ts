import { InputManager } from '../input/InputManager';
import { requestPointerLock } from '../input/pointerLock';
import type { InputAction } from '../input/types';
import { GameLoop } from '../core/GameLoop';
import { requireElement } from '../core/dom';
import { FAST_TIME_SCALE, NORMAL_TIME_SCALE } from '../config/daynight';
import { GEM_DEFINITIONS, GEM_KINDS, type GemKind } from '../config/gems';
import { findSynthesisRecipe } from '../config/gemSynthesis';
import { SPEED_SCALE_MIN } from '../config/player';
import {
  CRAFT_FEATURE_ORDER,
  FEATURES,
  STARTER_GEMS,
  type FeatureId,
} from '../config/unlocks';
import { Inventory } from '../inventory/Inventory';
import { Album } from '../album/Album';
import { AlbumPanel } from '../ui/AlbumPanel';
import { GemCodex } from '../codex/GemCodex';
import { CodexPanel } from '../ui/CodexPanel';
import { formatClock } from '../ui/format';
import { MilestoneSigns } from '../world/MilestoneSigns';
import { formatMilestoneKm } from '../world/milestones';
import { clamp } from '../math/scalar';
import type { PlayerIntent } from '../player/Player';
import { InventoryPanel } from '../ui/InventoryPanel';
import { CraftPanel, type CraftActionResult, type CraftFeatureCard, type CraftFeatureDetail, type CraftMaterial } from '../ui/CraftPanel';
import { UnlockStore } from '../unlock/UnlockStore';
import { UnlockSystem } from '../unlock/UnlockSystem';
import { DESERT } from '../config/desert';
import { CHUNK_STREAM_MS, CHUNK_STREAM_MS_BOOT, WATER_LEVEL } from '../config/world';
import {
  formatWeatherLabel,
  type WeatherKind,
  type WeatherLevel,
} from '../config/weather';
import { CameraRig } from '../player/CameraRig';
import { Hero } from '../player/Hero';
import { Player } from '../player/Player';
import { GemManager } from '../gems/GemManager';
import { synthesizeGem } from '../gems/GemSynthesis';
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

/** 未解锁时点击按钮给出的提示文案。 */
const LOCKED_HINT: Record<
  'time' | 'view' | 'save' | 'bag' | 'album' | 'codex' | 'teleport',
  string
> = {
  time: '还没解锁「时间流逝」：到合成台 (C) 合成后可用',
  view: '还没解锁「第三人称」：到合成台 (C) 合成后可用',
  save: '还没解锁「存档面板」：到合成台 (C) 合成后可用',
  bag: '还没解锁「背包」：到合成台 (C) 合成后可用',
  album: '还没解锁「旅途相册」：到合成台 (C) 合成后可用',
  codex: '还没解锁「宝石图鉴」：到合成台 (C) 合成后可用',
  teleport: '调试传送按钮：点合成台的「调试 · 全部解锁」后放行',
};

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
  private readonly inventory: Inventory;
  private readonly album: Album;
  private readonly codex: GemCodex;
  private readonly unlock: UnlockSystem;
  private readonly unlockStore: UnlockStore;
  private readonly gems: GemManager;
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
  private readonly bagPanel: InventoryPanel;
  private readonly albumPanel: AlbumPanel;
  private readonly codexPanel: CodexPanel;
  private readonly craftPanel: CraftPanel;
  private readonly milestones: MilestoneSigns;
  private readonly startScreen: StartScreen;
  private readonly toolbar: Toolbar;
  private readonly speedControl: SpeedControl;
  private readonly weatherControl: WeatherControl;
  private readonly loop: GameLoop;
  private readonly canvas: HTMLCanvasElement;
  /** 触屏控件：锁定态要跟着解锁进度变暗。 */
  private readonly joystick: HTMLElement;
  private readonly jumpButton: HTMLButtonElement;

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
  /** 宝石雷达刷新节流：宝石点位不需要每帧重算，0.25s 一次足够。 */
  private radarTimer = 0;
  /** K 键按下后等下一帧渲染完再截图：WebGL 画布的内容只在渲染后的同一任务里可靠。 */
  private photoRequest = false;

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
    // 背包先建好：宝石拾取要用它查“这颗是否已经收过”，存档也要从这里取扩展段。
    this.inventory = new Inventory();
    this.album = new Album();
    // 图鉴记录首次拾取的时间 / 种子 / 坐标，和背包数量分开保存。
    this.codex = new GemCodex();
    // 功能解锁：纯逻辑对象 + 独立 localStorage 槽位（换世界也不会丢进度）。
    this.unlock = new UnlockSystem();
    this.unlockStore = UnlockStore.local();
    // 红宝石要跟着真实动物移动，所以直接接WildlifeManager的位置查询。
    this.gems = new GemManager(
      this.viewport.scene,
      this.world,
      this.seed,
      () => this.wildlife.getSightings(),
      {
        isTaken: (key) => this.inventory.isTaken(key),
        onCollect: (kind, key) => this.collectGem(kind, key),
      },
    );

    const chunkBuilder = new ChunkMeshBuilder(
      this.world,
      this.seed,
      this.materials,
      this.vegetationAssets,
    );
    const roadBuilder = new RoadMeshBuilder(this.world, this.materials, this.roadPropAssets);
    this.streamer = new WorldStreamer(this.viewport.scene, chunkBuilder, roadBuilder);
    // 里程碑木牌不参与区块流式：沿路每隔 500m 一块，独立管理贴图缓存更省心。
    this.milestones = new MilestoneSigns(this.viewport.scene, this.world);

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
    // 背包作为存档的扩展段：宝石数量与已收走的站点会一起写进存档。
    this.save.registerSection({
      key: 'inventory',
      capture: () => this.inventory.toSave(),
      restore: (value) => this.inventory.fromSave(value),
    });
    // 旅途相册：照片缩略图与拍摄地一起随存档走。
    this.save.registerSection({
      key: 'album',
      capture: () => this.album.toSave(),
      restore: (value) => this.album.fromSave(value),
    });
    // 宝石图鉴：首次发现记录与累计数量。
    this.save.registerSection({
      key: 'codex',
      capture: () => this.codex.toSave(),
      restore: (value) => this.codex.fromSave(value),
    });
    // 解锁进度先读独立槽位：它不依赖世界种子，换世界 / 世界存档损坏时也能保住已解锁的功能。
    const storedUnlocks = this.unlockStore.load();
    if (storedUnlocks) this.unlock.fromSave(storedUnlocks, this.inventory);
    // 同一份进度也会写进完整存档的扩展段，随存档一起导出、导入。
    // 恢复用合并语义：世界存档可能比独立槽位旧，不能把已经解锁的功能抹掉。
    this.save.registerSection({
      key: 'unlock',
      capture: () => this.unlock.toSave(),
      restore: (value) => this.unlock.mergeFromSave(value, this.inventory),
    });
    // 启动续档：只有存档与当前种子一致时才回到保存点，换世界不会被旧存档干扰。
    this.restoredFromSave = this.save.restoreOnStart();
    // 新手礼包必须在续档之后判断：旧存档里已经有宝石就不重复发放。
    this.grantStarterGems();
    this.persistUnlocks();

    this.desertFactor = this.world.desertAt(this.player.state.x, this.player.state.z);
    this.weather.setDesertFactor(this.desertFactor);

    this.hud = new Hud(this.world, this.seed);
    // 启动续档在 HUD 创建之前完成，这里补一次背包数量显示。
    this.hud.setGemCount(this.inventory.total);
    this.minimap = new Minimap(this.world);
    this.bigMap = new BigMap(this.world, {
      onOpenRequest: () => this.openMap(),
      onCloseRequest: () => this.closeMap(),
    });
    this.skyView = new SkyView(this.viewport, this.environment, this.world, {
      onOpenRequest: () => this.openSkyView(),
      onCloseRequest: () => this.closeSkyView(),
    });

    this.joystick = requireElement('joy');
    this.jumpButton = requireElement<HTMLButtonElement>('jumpBtn');
    this.input = new InputManager(
      canvas,
      {
        joystick: this.joystick,
        knob: requireElement('joyK'),
        jumpButton: this.jumpButton,
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
      onOpenBag: () => this.openBagPanel(),
      onOpenAlbum: () => this.openAlbumPanel(),
      onOpenCodex: () => this.openCodexPanel(),
      onOpenCraft: () => this.toggleCraftPanel(),
      onNewWorld: () => this.loadNewWorld(),
    });
    this.speedControl = new SpeedControl({
      onStep: (direction) => this.changeSpeed(direction),
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
        load: () => this.runSaveAction(() => this.save.loadLocal()),
        export: () => this.exportSaveFile(),
        import: (text) => this.runSaveAction(() => this.save.importText(text)),
        remove: () => {
          if (!window.confirm('删除本地存档？此操作无法撤销。')) return '已取消删除。';
          return this.save.removeLocal().message;
        },
        model: () => this.savePanelModel(),
      },
      { onCloseRequest: () => this.closeSavePanel() },
    );
    this.bagPanel = new InventoryPanel(
      {
        model: () => ({
          entries: this.inventory.entries(),
          total: this.inventory.total,
        }),
        synthesize: (recipeId) => this.synthesizeGems(recipeId),
      },
      { onCloseRequest: () => this.closeBagPanel() },
    );
    this.craftPanel = new CraftPanel(
      {
        features: () => this.craftFeatures(),
        detail: (id) => this.craftDetail(id),
        materials: () => this.craftMaterials(),
        place: (id, index, kind) => this.craftPlace(id, index, kind),
        remove: (id, index) => this.craftRemove(id, index),
        clear: (id) => this.craftClear(id),
        craft: (id) => this.craftExecute(id),
        debugUnlock: () => this.debugUnlockAll(),
      },
      { onCloseRequest: () => this.closeCraftPanel() },
    );
    this.albumPanel = new AlbumPanel(
      {
        model: () => this.album.list,
        remove: (id) => {
          this.album.remove(id);
          this.save.saveLocal();
        },
      },
      { onCloseRequest: () => this.closeAlbumPanel() },
    );
    this.codexPanel = new CodexPanel(
      { model: () => this.codex.list() },
      { onCloseRequest: () => this.closeCodexPanel() },
    );
    // 初始状态：除地图、视角与 F 自动前进外，其余功能全部锁定。
    this.applyUnlocks();

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
    this.gems.dispose();
    this.milestones.dispose();
    this.hero.dispose();
    this.environment.dispose();
    this.viewport.dispose();
    this.vegetationAssets.dispose();
    this.roadPropAssets.dispose();
    this.materials.dispose();
    this.bigMap.dispose();
    this.skyView.dispose();
    this.savePanel.dispose();
    this.bagPanel.dispose();
    this.albumPanel.dispose();
    this.codexPanel.dispose();
    this.craftPanel.dispose();
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
      // 未解锁的功能在输入层就直接清零：走路 / 奔跑 / 跳跃都按解锁状态放行。
      speed = this.player.update(dt, this.gateIntent(this.input.getIntent()), this.autoWalk);
    } else {
      this.player.state.yaw += dt * 0.05;
    }

    const state = this.player.state;
    this.dayNight.update(dt, this.fastTime);
    // 昼夜快照当帧只算一次：宝石用它判断白天/夜晚，光照也复用同一份。
    const daylight = this.dayNight.snapshot;
    this.streamer.update(
      state.x,
      state.z,
      state.yaw,
      this.started ? 2 : 4,
      this.started ? CHUNK_STREAM_MS : CHUNK_STREAM_MS_BOOT,
    );
    this.village.update(dt, this.streamer.chunks);
    this.wildlife.update(dt, state.x, state.z);
    // 里程碑木牌：走到下一块时播报一次，传送 / 载入造成的大跨度移动不播报。
    const crossing = this.milestones.update(state.z);
    if (crossing && this.started) {
      this.hud.announce(`里程碑 · ${formatMilestoneKm(crossing.index)}`);
    }
    this.gems.update(dt, state, this.weather.snapshot, waterLevel, daylight.daylightFactor);
    this.cameraRig.update(state, this.started, this.thirdPerson, dt);

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
    // 宝石雷达：节流刷新点位，小地图与大地图共用同一份数据。
    this.radarTimer += dt;
    if (this.radarTimer >= 0.25) {
      this.radarTimer = 0;
      this.refreshRadar();
    }
    this.minimap.update(dt, state);
    this.bigMap.update(dt, state);
    // 天穹俯瞰必须在主视角渲染之前：它借用画布一角渲染后立即拷走。
    if (this.started) this.skyView.update(dt, state);

    this.viewport.render();

    // 截图必须紧跟 render 的同一任务：WebGL 画布在浏览器合成后内容就不再可靠。
    if (this.photoRequest) {
      this.photoRequest = false;
      this.capturePhoto();
    }
  }

  private beginExploration(): void {
    if (this.started) return;

    this.started = true;
    this.startScreen.hide();
    this.input.setActive(true);
    if (!this.input.isTouch) requestPointerLock(this.canvas);

    // 开局提示：行走 / 跳跃 / 背包默认可用，其余能力都在合成台里等着合成。
    this.hud.announce('基础能力已就绪：WASD 行走 · 空格跳跃 · B 背包 · 按 C 合成更多能力');
  }

  /** 尚未解锁「奔跑」时把 run 清零；行走 / 跳跃 / 背包是默认能力，不受影响。 */
  private gateIntent(intent: PlayerIntent): PlayerIntent {
    return {
      forward: intent.forward,
      strafe: intent.strafe,
      run: this.unlock.isUnlocked('sprint') && intent.run,
      jump: intent.jump,
    };
  }

  /** 未解锁时提示去合成台；返回 true 表示这次操作应该被拦下。 */
  private blockedByUnlock(id: FeatureId, label: string): boolean {
    if (this.unlock.isUnlocked(id)) return false;
    this.hud.announce(`「${label}」尚未解锁 · 按 C 打开合成台`);
    return true;
  }

  private openMap(): void {
    if (!this.started || this.mapOpen) return;

    // 先收起存档面板：它与大视野互斥，且不希望在打开地图时重新锁定鼠标。
    this.savePanel.close();
    if (this.albumPanel.isOpen) this.albumPanel.close();
    if (this.codexPanel.isOpen) this.codexPanel.close();
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
    if (!this.skyView.isOpen && this.blockedByUnlock('sky', '天穹视角')) return;
    if (this.skyView.isOpen) this.closeSkyView();
    else this.openSkyView();
  }

  /** 打开天穹大视野：与大地图同时只保留一个，但仍可继续行走。 */
  private openSkyView(): void {
    if (!this.started || this.skyView.isOpen) return;

    this.savePanel.close();
    if (this.albumPanel.isOpen) this.albumPanel.close();
    if (this.codexPanel.isOpen) this.codexPanel.close();
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

  /** Esc：优先关掉正在打开的覆盖层（合成台 → 背包 → 图鉴 → 相册 → 存档面板 → 天穹 → 大地图）。 */
  private closeOverlays(): void {
    if (this.craftPanel.isOpen) this.closeCraftPanel();
    else if (this.bagPanel.isOpen) this.closeBagPanel();
    else if (this.codexPanel.isOpen) this.closeCodexPanel();
    else if (this.albumPanel.isOpen) this.closeAlbumPanel();
    else if (this.savePanel.isOpen) this.closeSavePanel();
    else if (this.skyView.isOpen) this.closeSkyView();
    else if (this.mapOpen) this.closeMap();
  }

  /** 存档面板 / 背包 / 图鉴 / 相册 / 合成台 / 大视野都关掉后，才把 Pointer Lock 与鼠标转向交还给游戏。 */
  private releaseOverlayInput(): void {
    if (this.mapOpen || this.skyView.isOpen || this.savePanel.isOpen) return;
    if (this.bagPanel.isOpen || this.albumPanel.isOpen || this.craftPanel.isOpen) return;
    if (this.codexPanel.isOpen) return;

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
    if (this.blockedByUnlock('save', '存档面板')) return;

    // 先让面板进入打开状态：随后关闭大视野时 releaseOverlayInput 不会重新锁定鼠标。
    this.savePanel.open();
    if (this.craftPanel.isOpen) this.craftPanel.close();
    if (this.bagPanel.isOpen) this.bagPanel.close();
    if (this.albumPanel.isOpen) this.albumPanel.close();
    if (this.codexPanel.isOpen) this.codexPanel.close();
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

  /** B 键 / 底部「背包」按钮：打开或关闭背包面板。 */
  private toggleBagPanel(): void {
    if (this.bagPanel.isOpen) this.closeBagPanel();
    else this.openBagPanel();
  }

  private openBagPanel(): void {
    if (!this.started || this.bagPanel.isOpen) return;
    if (this.blockedByUnlock('bag', '背包')) return;

    // 与其他覆盖层同样的顺序：先打开自己，再关掉别人，避免释放鼠标时重新锁定。
    this.bagPanel.open();
    if (this.craftPanel.isOpen) this.craftPanel.close();
    if (this.albumPanel.isOpen) this.albumPanel.close();
    if (this.codexPanel.isOpen) this.codexPanel.close();
    if (this.savePanel.isOpen) this.savePanel.close();
    if (this.mapOpen) this.closeMap();
    if (this.skyView.isOpen) this.closeSkyView();
    this.input.setOverlayMode(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private closeBagPanel(): void {
    if (!this.bagPanel.isOpen) return;

    this.bagPanel.close();
    this.releaseOverlayInput();
  }

  /** C 键 / 底部「合成台」按钮：打开或关闭合成台。 */
  private toggleCraftPanel(): void {
    if (this.craftPanel.isOpen) this.closeCraftPanel();
    else this.openCraftPanel();
  }

  private openCraftPanel(): void {
    if (!this.started || this.craftPanel.isOpen) return;

    this.craftPanel.open();
    if (this.bagPanel.isOpen) this.bagPanel.close();
    if (this.albumPanel.isOpen) this.albumPanel.close();
    if (this.codexPanel.isOpen) this.codexPanel.close();
    if (this.savePanel.isOpen) this.savePanel.close();
    if (this.mapOpen) this.closeMap();
    if (this.skyView.isOpen) this.closeSkyView();
    this.input.setOverlayMode(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private closeCraftPanel(): void {
    if (!this.craftPanel.isOpen) return;

    this.craftPanel.close();
    this.releaseOverlayInput();
  }

  /** 底部「相册」按钮：解锁后才能打开旅途相册。 */
  private openAlbumPanel(): void {
    if (!this.started || this.albumPanel.isOpen) return;
    if (this.blockedByUnlock('album', '旅途相册')) return;

    this.albumPanel.open();
    if (this.craftPanel.isOpen) this.craftPanel.close();
    if (this.bagPanel.isOpen) this.bagPanel.close();
    if (this.codexPanel.isOpen) this.codexPanel.close();
    if (this.savePanel.isOpen) this.savePanel.close();
    if (this.mapOpen) this.closeMap();
    if (this.skyView.isOpen) this.closeSkyView();
    this.input.setOverlayMode(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private closeAlbumPanel(): void {
    if (!this.albumPanel.isOpen) return;

    this.albumPanel.close();
    this.releaseOverlayInput();
  }

  /** 底部「图鉴」按钮：解锁后才能查看宝石图鉴。 */
  private openCodexPanel(): void {
    if (!this.started || this.codexPanel.isOpen) return;
    if (this.blockedByUnlock('codex', '宝石图鉴')) return;

    this.codexPanel.open();
    if (this.craftPanel.isOpen) this.craftPanel.close();
    if (this.bagPanel.isOpen) this.bagPanel.close();
    if (this.albumPanel.isOpen) this.albumPanel.close();
    if (this.savePanel.isOpen) this.savePanel.close();
    if (this.mapOpen) this.closeMap();
    if (this.skyView.isOpen) this.closeSkyView();
    this.input.setOverlayMode(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private closeCodexPanel(): void {
    if (!this.codexPanel.isOpen) return;

    this.codexPanel.close();
    this.releaseOverlayInput();
  }

  /** K 键 / 调试按钮都走这里：未解锁「旅途相册」时拦下并提示去合成台。 */
  private requestPhoto(): void {
    if (!this.started) return;
    if (this.blockedByUnlock('album', '旅途相册')) return;
    this.photoRequest = true;
  }

  /**
   * K 键：把当前画面压成一张缩略图存进旅途相册。
   * 调用点必须是 `viewport.render()` 之后的同一帧，否则 WebGL 画布可能已被清空。
   */
  private capturePhoto(): void {
    if (!this.started) return;

    const sourceWidth = this.canvas.width;
    const sourceHeight = this.canvas.height;
    if (sourceWidth <= 0 || sourceHeight <= 0) return;

    const width = 480;
    const height = Math.max(1, Math.round((width * sourceHeight) / sourceWidth));
    const frame = document.createElement('canvas');
    frame.width = width;
    frame.height = height;
    const context = frame.getContext('2d');
    if (!context) return;
    context.drawImage(this.canvas, 0, 0, width, height);

    let thumb: string;
    try {
      thumb = frame.toDataURL('image/jpeg', 0.62);
    } catch {
      this.hud.announce('这张照片没能存下来：浏览器拒绝了画布导出');
      return;
    }

    const state = this.player.state;
    const hour = this.dayNight.hour;
    const weather = formatWeatherLabel(this.weather.kind, this.weather.level);
    const biome = this.world.biomeAt(state.x, state.z);
    const photo = this.album.add({
      at: Date.now(),
      seed: this.seed,
      x: state.x,
      z: state.z,
      y: state.y,
      yaw: state.yaw,
      pitch: state.pitch,
      hour,
      weather,
      biome,
      title: `${weather} · ${biome} · ${formatClock(hour)}`,
      thumb,
    });

    // 照片跟存档走：拍完立刻静默落盘，关掉页面也不会丢。
    this.save.saveLocal();
    this.hud.announce(`已存入旅途相册（${this.album.count} 张）：${photo.title}`);
    if (this.albumPanel.isOpen) this.albumPanel.refresh();
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

  /** 宝石飞进身体后由 GemManager 回调：写进背包、记录图鉴并同步 UI。 */
  private collectGem(kind: GemKind, key: string): void {
    this.inventory.add(kind, key);

    const state = this.player.state;
    const { first } = this.codex.record(kind, {
      at: Date.now(),
      seed: this.seed,
      x: state.x,
      z: state.z,
    });

    this.hud.setGemCount(this.inventory.total);
    // 第一次发现时把“图鉴新增”一起报出来；之后只报本次收获 +1。
    const label = GEM_DEFINITIONS[kind].label;
    this.hud.announce(
      first
        ? `收进背包：${label} +1 · 图鉴新增（${this.codex.discovered}/${this.codex.total}）`
        : `收进背包：${label} +1`,
    );
    if (this.bagPanel.isOpen) this.bagPanel.refresh();
    if (this.codexPanel.isOpen) this.codexPanel.refresh();
  }

  /** 宝石合成：2 颗低阶宝石 → 1 颗高阶宝石，成功后同步 HUD、图纸可用数量与存档。 */
  private synthesizeGems(recipeId: string): { ok: boolean; message: string } {
    const recipe = findSynthesisRecipe(recipeId);
    if (!recipe) return { ok: false, message: '未知的宝石合成配方。' };

    const result = synthesizeGem(recipe, this.inventory);
    if (result.outcome !== 'ok') return { ok: false, message: result.message };

    this.hud.setGemCount(this.inventory.total);
    this.hud.announce(result.message);
    this.craftPanel.refresh();
    this.save.saveLocal();
    return { ok: true, message: result.message };
  }

  /** 载入 / 导入存档后同步背包与解锁相关的 UI（数量、站点、解锁状态都变了）。 */
  private syncInventoryUi(): void {
    this.hud.setGemCount(this.inventory.total);
    // 新背包里已经收走过的固定站点，可能还留在当前场景里，要先清掉避免重复计数。
    this.gems.dropTakenSites();
    this.bagPanel.refresh();
    this.albumPanel.refresh();
    this.codexPanel.refresh();
    // 存档里带着解锁进度：载入后重新应用锁定状态并同步独立槽位。
    this.applyUnlocks();
    this.persistUnlocks();
  }

  /** 存档操作统一走这里：执行后立刻刷新背包显示。 */
  private runSaveAction(action: () => { message: string }): string {
    const result = action();
    this.syncInventoryUi();
    return result.message;
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
    if (enabled && this.blockedByUnlock('time', '时间流逝')) return;
    this.fastTime = enabled;
    this.toolbar.setTime(enabled);
  }

  private setThirdPerson(enabled: boolean): void {
    if (enabled && this.blockedByUnlock('view', '第三人称')) return;
    this.thirdPerson = enabled;
    this.hero.setVisible(enabled);
    this.toolbar.setView(enabled);
  }

  /** 调试传送：需要先点过合成台的「调试 · 全部解锁」。 */
  private debugTransportAllowed(): boolean {
    if (this.unlock.debugUnlocked) return true;
    this.hud.announce('调试传送未放行 · 到合成台点「调试 · 全部解锁」');
    return false;
  }

  /** 调试：把玩家放到最近的沙漠边缘，并面朝沙漠。 */
  private teleportToDesert(): void {
    if (!this.debugTransportAllowed()) return;

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
    if (!this.debugTransportAllowed()) return;

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

  /** 速度倍率始终夹在已解锁的上限内：没解锁任何速度档位就只能保持 ×1。 */
  private setSpeedScale(scale: number): void {
    this.player.setSpeedScale(clamp(scale, SPEED_SCALE_MIN, this.unlock.speedLimit()));
    this.speedControl.setValue(this.player.speedScale);
  }

  /** 键盘 / 按钮调速：速度档位没解锁时给出提示，不改变倍率。 */
  private changeSpeed(direction: -1 | 1): void {
    if (!this.unlock.speedUnlocked()) {
      this.hud.announce('速度档位尚未解锁 · 按 C 打开合成台');
      return;
    }
    this.setSpeedScale(this.player.stepSpeedScale(direction));
  }

  private setManualWeather(kind: WeatherKind, level: WeatherLevel): void {
    if (this.blockedByUnlock('weather', '天气控制')) return;
    if (this.desertFactor >= DESERT.weatherUiBlock) return;
    this.weather.setManual(kind, level);
    this.syncWeatherUi(true);
  }

  private setWeatherAuto(enabled: boolean): void {
    if (enabled && this.blockedByUnlock('weather', '天气控制')) return;
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

  /**
   * 新手礼包：只在第一次进入、背包还是空的时候发放。
   * 初始只能按 F 沿路自动前进，宝石大多长在离路较远的地方，
   * 没有这几颗启动宝石就会陷入“不能走 → 收不到宝石 → 永远不能走”的死锁。
   */
  private grantStarterGems(): void {
    if (this.unlock.starterGranted) return;

    // 老存档 / 导入存档里已经有宝石：只补记标记，不重复发放。
    if (this.inventory.total > 0) {
      this.unlock.markStarterGranted();
      return;
    }

    for (const kind of GEM_KINDS) {
      const count = STARTER_GEMS[kind] ?? 0;
      for (let index = 0; index < count; index++) this.inventory.add(kind);
    }
    this.unlock.markStarterGranted();
  }

  /** 解锁进度除了写进完整存档，还单独存一份，换世界或世界存档损坏时都不会丢。 */
  private persistUnlocks(): void {
    this.unlockStore.save(this.unlock.toSave());
  }

  /** 把解锁状态同步到所有受控的界面与玩家状态（初始调用一次，合成 / 调试解锁后再调用）。 */
  private applyUnlocks(): void {
    const unlocked = (id: FeatureId): boolean => this.unlock.isUnlocked(id);

    this.toolbar.setLocked('time', !unlocked('time'), LOCKED_HINT.time);
    this.toolbar.setLocked('view', !unlocked('view'), LOCKED_HINT.view);
    this.toolbar.setLocked('save', !unlocked('save'), LOCKED_HINT.save);
    this.toolbar.setLocked('album', !unlocked('album'), LOCKED_HINT.album);
    this.toolbar.setLocked('codex', !unlocked('codex'), LOCKED_HINT.codex);
    // 行走 / 跳跃 / 背包是默认能力，不再上锁。
    this.toolbar.setLocked('bag', false);
    this.toolbar.setLocked('teleport', !this.unlock.debugUnlocked, LOCKED_HINT.teleport);

    const limit = this.unlock.speedLimit();
    this.speedControl.setLimits(SPEED_SCALE_MIN, limit, !this.unlock.speedUnlocked());
    this.player.setSpeedScale(clamp(this.player.speedScale, SPEED_SCALE_MIN, limit));
    this.speedControl.setValue(this.player.speedScale);

    this.weatherControl.setLocked(!unlocked('weather'));

    // 天穹摄像机未解锁时整个入口都不出现（缩略图与“天穹大视野”按钮一起隐藏）。
    this.skyView.setUnlocked(unlocked('sky'));
    this.joystick.classList.remove('is-locked');
    this.jumpButton.classList.remove('is-locked');

    this.refreshRadar();
    this.craftPanel.refresh();
  }

  /** 宝石雷达：解锁后才能在地图上看到宝石光点，未解锁时清空点位。 */
  private refreshRadar(): void {
    const spots = this.unlock.isUnlocked('radar') ? this.gems.getSightings() : null;
    this.minimap.setGems(spots);
    this.bigMap.setGems(spots);
  }

  private craftFeatures(): CraftFeatureCard[] {
    return CRAFT_FEATURE_ORDER.map((id) => {
      const spec = FEATURES[id];
      return {
        id,
        label: spec.label,
        status: this.unlock.status(id),
        filled: this.unlock.filledCount(id),
        total: spec.total,
      };
    });
  }

  private craftDetail(id: FeatureId): CraftFeatureDetail {
    const spec = FEATURES[id];
    const status = this.unlock.status(id);
    const draft = this.unlock.draft(id);
    const completed = status === 'completed';

    const cells = spec.cells.map((cell, index) => ({
      need: cell.kind,
      // 合成完成后草稿已清空，但图纸本身继续留在槽位里显示完成态。
      gem: completed ? cell.kind : draft[index],
      row: cell.row,
      col: cell.col,
    }));

    const needs = spec.needs.map((need) => {
      let placed = 0;
      for (const gem of draft) if (gem === need.kind) placed += 1;

      return {
        kind: need.kind,
        need: need.count,
        placed: completed ? need.count : placed,
        // 其他功能的草稿先预留，这里显示当前功能还能用的数量。
        have: this.unlock.available(need.kind, this.inventory, id),
      };
    });

    return {
      id,
      label: spec.label,
      summary: spec.summary,
      cols: spec.cols,
      status,
      cells,
      needs,
      total: spec.total,
      filled: this.unlock.filledCount(id),
    };
  }

  private craftMaterials(): CraftMaterial[] {
    return this.inventory
      .entries()
      .filter((entry) => entry.count > 0)
      .map((entry) => ({
        kind: entry.kind,
        available: this.unlock.available(entry.kind, this.inventory),
        total: entry.count,
      }));
  }

  private craftPlace(id: FeatureId, index: number, kind: GemKind): CraftActionResult {
    const outcome = this.unlock.placeGem(id, index, kind, this.inventory);
    const label = GEM_DEFINITIONS[kind].label;

    if (outcome === 'ok') {
      this.afterCraftChange();
      return { ok: true, message: `已放入 ${label}。` };
    }
    if (outcome === 'no-stock') {
      return { ok: false, message: `${label} 已经全部摆在槽位里了。` };
    }
    if (outcome === 'occupied') {
      return { ok: false, message: '这个槽位已经有宝石了，先点一下取回。' };
    }
    if (outcome === 'void-cell') {
      return { ok: false, message: '这一格不在图纸形状内。' };
    }
    if (outcome === 'unlocked') {
      return { ok: false, message: '这个功能已经解锁，槽位不再接受新的合成。' };
    }
    return { ok: false, message: '无法放入这颗宝石。' };
  }

  private craftRemove(id: FeatureId, index: number): CraftActionResult {
    if (!this.unlock.removeGem(id, index)) {
      return { ok: false, message: '这个槽位是空的。' };
    }
    this.afterCraftChange();
    return { ok: true, message: '已取回一颗宝石。' };
  }

  private craftClear(id: FeatureId): CraftActionResult {
    if (!this.unlock.clearDraft(id)) {
      return { ok: false, message: '槽位本来就是空的。' };
    }
    this.afterCraftChange();
    return { ok: true, message: '已清空当前图纸的槽位。' };
  }

  private craftExecute(id: FeatureId): CraftActionResult {
    const result = this.unlock.craft(id, this.inventory);
    if (result.outcome !== 'ok' || !result.feature) {
      return { ok: false, message: result.message };
    }

    this.hud.setGemCount(this.inventory.total);
    this.hud.announce(`合成成功：${result.feature.label} 已永久解锁`);
    this.applyUnlocks();
    this.persistUnlocks();
    // 静默写一份完整存档：新消耗的宝石数量与解锁状态一起落盘。
    this.save.saveLocal();

    return { ok: true, message: result.message };
  }

  /** 调试：不消耗宝石，一键启用所有被锁定的功能（同时放行调试传送按钮）。 */
  private debugUnlockAll(): CraftActionResult {
    const added = this.unlock.unlockAll();
    this.applyUnlocks();
    this.persistUnlocks();
    this.hud.announce('调试：所有功能已启用');

    return {
      ok: true,
      message:
        added.length > 0
          ? `调试：已启用 ${added.length} 项功能，并放行调试传送按钮。`
          : '所有功能已处于启用状态，调试传送按钮已放行。',
    };
  }

  private afterCraftChange(): void {
    this.persistUnlocks();
    if (this.bagPanel.isOpen) this.bagPanel.refresh();
  }

  private readonly handleInputAction = (action: InputAction): void => {
    if (action === 'toggle-auto') this.setAutoWalk(!this.autoWalk);
    else if (action === 'toggle-time') this.setFastTime(!this.fastTime);
    else if (action === 'toggle-view') this.setThirdPerson(!this.thirdPerson);
    else if (action === 'toggle-map') this.toggleMap();
    else if (action === 'toggle-sky-view') this.toggleSkyView();
    else if (action === 'toggle-save') this.toggleSavePanel();
    else if (action === 'toggle-bag') this.toggleBagPanel();
    else if (action === 'toggle-craft') this.toggleCraftPanel();
    else if (action === 'take-photo') this.requestPhoto();
    else if (action === 'close-map') this.closeOverlays();
    else if (action === 'speed-down') this.changeSpeed(-1);
    else if (action === 'speed-up') this.changeSpeed(1);
  };

  private installDebugApi(): void {
    window.__wild = {
      player: this.player.state,
      world: this.world,
      chunks: this.streamer.chunks,
      roads: this.streamer.roads,
      camera: this.viewport.camera,
      scene: this.viewport.scene,
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
      streamStats: () => this.streamer.stats(),
      openSavePanel: () => this.openSavePanel(),
      closeSavePanel: () => this.closeSavePanel(),
      isSavePanelOpen: () => this.savePanel.isOpen,
      didRestoreSave: () => this.restoredFromSave,
      saveGame: () => this.save.saveLocal(),
      // 调试接口也要和面板走同一条路径：载入 / 导入后立刻把背包数量同步到 HUD 与背包面板。
      loadGame: () => {
        const result = this.save.loadLocal();
        this.syncInventoryUi();
        return result;
      },
      getLocalSave: () => this.save.readLocal(),
      exportSaveText: () => this.save.createExport(),
      importSaveText: (text: string) => {
        const result = this.save.importText(text);
        this.syncInventoryUi();
        return result;
      },
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
      gemPopulation: () => this.gems.getPopulation(),
      gemSightings: () => this.gems.getSightings(),
      gemSitesNear: (chunkRadius?: number) =>
        this.gems.sitesNear(this.player.state.x, this.player.state.z, chunkRadius),
      inventory: () => this.inventory.toSave(),
      bagEntries: () => this.inventory.entries().filter((entry) => entry.count > 0),
      openBagPanel: () => this.openBagPanel(),
      closeBagPanel: () => this.closeBagPanel(),
      isBagPanelOpen: () => this.bagPanel.isOpen,
      // 相册：takePhoto 走和 K 键同一条路径，等下一帧渲染完再截图。
      takePhoto: () => {
        this.requestPhoto();
      },
      albumPhotos: () => this.album.list,
      openAlbumPanel: () => this.openAlbumPanel(),
      closeAlbumPanel: () => this.closeAlbumPanel(),
      isAlbumPanelOpen: () => this.albumPanel.isOpen,
      // 图鉴：list 包含未发现条目（entry 为 null），方便测试检查“首次拾取即解锁”。
      codexEntries: () => this.codex.list(),
      codexState: () => ({ discovered: this.codex.discovered, total: this.codex.total }),
      openCodexPanel: () => this.openCodexPanel(),
      closeCodexPanel: () => this.closeCodexPanel(),
      isCodexPanelOpen: () => this.codexPanel.isOpen,
      milestoneIndex: () => this.milestones.index,
      openCraftPanel: () => this.openCraftPanel(),
      closeCraftPanel: () => this.closeCraftPanel(),
      isCraftPanelOpen: () => this.craftPanel.isOpen,
      unlockState: () => ({
        unlocked: this.unlock.unlocked(),
        completed: this.unlock.completed(),
        speedLimit: this.unlock.speedLimit(),
        starterGranted: this.unlock.starterGranted,
        debug: this.unlock.debugUnlocked,
        drafts: this.unlock.toSave()?.drafts ?? {},
      }),
      unlockAll: () => {
        this.debugUnlockAll();
        return this.unlock.unlocked();
      },
      villageStats: () => this.village.getStats(),
    };
  }
}
