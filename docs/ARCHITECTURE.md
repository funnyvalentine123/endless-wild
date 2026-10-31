# 架构说明

## 1. 分层

```text
┌──────────────────────────────────────────────────────────────┐
│ app/Game.ts       装配依赖、决定每帧顺序、同步 UI 状态          │
└───────────────┬──────────────────────────────────────────────┘
                │
   ┌────────────┼─────────────┬──────────────────┐
   ▼            ▼             ▼                  ▼
 input/      player/       world/            render/
 统一输入     物理与相机     采样与网格        渲染基础设施
   │            │             │                  │
   └────────────┴──────┬──────┴──────────────────┘
                       ▼
                    ui/ + styles/
              只读状态，不参与世界生成
```

依赖方向原则：

1. `math/`、`config/` 不依赖任何上层模块。
2. `world/World.ts` 只依赖 `math/` 与 `config/`，不依赖 DOM / Three.js。
3. `player/Player.ts` 只依赖 `World` 与一个碰撞查询接口，不依赖 Three.js。
4. `render/` 只消费世界与时间数据；唯一会创建 Three.js 对象的世界模块是 `world/streaming/*`（网格构建）与 `world/assets/*`（共享几何体）。
5. `Game.ts` 是唯一知道所有模块的地方；其他模块之间不互相直接取全局状态。
6. UI 只读取状态并触发回调，不直接修改玩家或世界。

## 2. 每帧顺序

`Game.update(dt)` 严格按以下顺序执行：

| 顺序 | 动作 | 所在模块 |
| --- | --- | --- |
| 1 | 取出鼠标 / 触摸累积的视角增量并应用 | `InputManager` → `Player.applyLook` |
| 2 | 移动、自动前进、跳跃、重力、碰撞 | `Player.update` |
| 3 | 推进时刻，得到新的光照快照 | `DayNightCycle` |
| 4 | 加载 / 卸载附近区块与道路段 | `WorldStreamer.update` |
| 5 | 动物生成 / 回收、行为推进、实例矩阵 | `WildlifeManager.update` |
| 6 | 第一 / 第三人称相机 | `CameraRig.update` |
| 7 | 应用天空、太阳、雾、星星、水、云、路灯亮度 | `SceneEnvironment.applyDaylight` + `WorldMaterials.setLampIntensity` |
| 8 | 天空 / 星空跟随相机，水与云跟随玩家 | `SceneEnvironment.update` |
| 9 | 角色动画 | `Hero.update` |
| 10 | HUD / 小地图（内部节流） | `Hud` / `Minimap` |
| 11 | 大地图实时滚动、天穹俯瞰（内部节流，必须先于主视角渲染） | `BigMap` / `SkyView` |
| 12 | 提交渲染 | `Viewport.render` |

开始界面阶段仍在跑同一循环，只是跳过玩家移动，并让相机缓慢自转；世界会提前预生成附近区块。

大地图与天穹大视野打开时 **不再冻结模拟**：`Game.update` 照常推进玩家、昼夜、区块流式加载与渲染，只是禁用鼠标视角并退出 Pointer Lock，键盘 `WASD` / `F` 仍可驱动移动，两个大视野随玩家实时刷新挂载在 HUD 上。

## 3. 世界生成流水线

```text
seed
 ├─ NoiseFields          9 层 simplex 噪声，固定创建顺序
 ├─ config/terrain       山脉 / 丘陵 / 河流 / 湖泊的振幅、频率与阈值
 ├─ TerrainSurface       基础高度、河流、湖泊、森林密度
 └─ RoadTrack            道路中心线、路面高度缓存、桥判定
          │
          ▼
       World              组合 height / groundAt / biomeAt / forestAt
          │
          ├─ ChunkMeshBuilder → 地形顶点 + 顶点色 + 植被实例
          │                    └─ Houses → 固定房屋（种子 + 区块确定性）
          ├─ RoadMeshBuilder  → 路面 + 桥 + 栏杆 + 路灯
          ├─ Minimap          → 300m 半径地形色采样
          ├─ WildlifeManager  → 鸟 / 鱼 / 兔 / 蛇 / 牛 / 鹿
          └─ Player           → 地面高度 / 碰撞（findRoadSpawn 选出生点）
```

水体设计约定：**降低频率**让单个河湖更大，**提高阈值 / 抬升基准地面**让水域总量和道路穿越次数下降；同时加宽河岸过渡，避免路旁出现垂直切岸。

### 确定性契约

同一个种子必须生成同一个世界。为此有三条硬性约定：

1. **随机数消耗顺序不能改。** 植被撒点、云、星星、岩石变形、道路贴图各自使用独立随机流，但同一随机流内部调用 `random()` 的顺序必须与原始版本一致。例如树木的 `sy` 随机数必须先于颜色随机数消耗。
2. **每个区块独立播种。** `hashChunk(seed, cx, cz)` 决定该区块的随机流，因此先加载 / 后卸载 / 再加载不会改变内容，也不依赖构建顺序。
3. **噪声层按固定顺序创建。** `NoiseFields` 中 9 个 `createNoise2D(...)` 的调用顺序决定了各自子种子，改动顺序会让所有地图变样。

修改世界生成后，建议同时更新 `tests/world/world.test.ts` 中的快照式断言、`tests/world/terrain-character.test.ts` 里的水体密度 / 道路穿越 / 坡度范围，以及 `tests/world/houses.test.ts` 的房屋选址约束。

## 4. 流式加载

`WorldStreamer` 维护两张表：

- `chunks: Map<"cx,cz", ChunkView>`：64m 地形区块，半径 7（约 448m，与雾距 420m 对齐），按“距离 + 面朝方向”排序。外圈只有地形，进入 `CHUNK_DETAIL_RADIUS`（5 格 ≈ 320m）后才重建为带植被 / 房屋的完整区块。
- `roads: Map<segmentIndex, RoadView>`：40m 道路段，比区块范围略宽。

每帧构建预算：

- 已开始探索：2 个区块 / 1 个道路段；
- 开始界面：4 个区块 / 2 个道路段。

整理待建列表时，靠近玩家但还没补全内容的区块会以最高优先级加入重建队列，因此单帧预算同样限制升级开销。超出半径 + 边距的区块会立即移出场景并释放本区块独有的 GPU 资源；共享几何体与共享材质不释放。

## 5. 渲染组织

- **地形**：每个区块一个 `PlaneGeometry(64, 64, 32, 32)`，顶点位移后计算法线，再写顶点色；共享 `MeshLambertMaterial({ vertexColors, flatShading })`。
- **植被**：低模几何体在 `VegetationAssets` 中合并一次，区块内用 `InstancedMesh` 分别按种类提交。
- **道路**：每 2m 采样一条中心线，生成三角形带；栏杆 / 桥墩 / 路灯使用实例化；路灯头单独用发光材质。
- **环境**：天空为跟随相机的背面球体 + 自定义 shader；水面在 `onBeforeCompile` 中注入顶点波浪；云在 CPU 侧漂移并循环。Three.js r163+ 的 WebGLRenderer 仅支持 WebGL 2，`Viewport` 启动时用临时 canvas 做能力检测。
- **昼夜**：`DayNightCycle` 输出一个原地复用的 `DaylightSnapshot`；`SceneEnvironment` 应用天空 / 光照 / 水 / 云，`Game` 把路灯亮度写回共享的 `WorldMaterials`，避免每帧分配 Color。

## 6. 扩展指南

### 新增一种植被

1. 在 `VegetationAssets` 中创建共享几何体；
2. 在 `VEGETATION_KINDS` 中加入名称；
3. 在 `VegetationScatter` 的 `instances` 初始化和判定逻辑里加入分支；
4. 若需要在 `ChunkMeshBuilder` 之外使用，补充类型。

### 调整地形

- 山脉 / 丘陵的振幅、频率：`config/terrain.ts`；
- 河流 / 湖泊的频率、阈值、深度与河岸宽度：`config/terrain.ts`；
- 地形组合与噪声采样：`TerrainSurface`；
- 路面宽度与融合范围：`config/world.ts` + `World.height`；
- 出生点搜索：`world/spawn.ts`；
- 配色：`TerrainColoring.ts`。

调参后先跑 `pnpm vitest run tests/world/terrain-character.test.ts`，确认水面占比、道路桥梁次数和坡度分布仍在范围内，再看实际画面。

### 新增 UI 面板

1. 在 `index.html` 中加入带稳定 `id` 的 DOM；
2. 在 `src/ui/` 新建组件，通过 `requireElement` 获取元素；
3. 在 `Game` 中实例化并传入只读状态；刷新频率放进 `config/ui.ts`。

### 新增昼夜效果

1. 在 `DaylightSnapshot` 中增加字段；
2. 在 `DayNightCycle.snapshot` 中计算；
3. 在 `SceneEnvironment.applyDaylight` 中应用到具体对象；如果目标属于世界共享材质（如路灯），在 `Game.update` 中写入 `WorldMaterials`。

## 7. 资源生命周期

- `WorldMaterials`：地形 / 植被 / 道路 / 路灯材质与道路贴图，`Game.dispose` 时释放。
- `VegetationAssets` / `RoadPropAssets`：全局共享几何体，`Game.dispose` 时释放。
- `ChunkView`：地形几何体与实例缓冲由 `WorldStreamer` 卸载时释放。
- `RoadView`：路面几何体与实例缓冲由 `WorldStreamer` 卸载时释放；共享的栏杆 / 路灯几何体不释放。
- 环境对象：天空、星空、水、云各自持有一个几何体 / 材质，`SceneEnvironment.dispose` 统一释放。

## 8. 性能注意点

1. 植被撒点与地形高度采样是主要 CPU 成本；每区块候选数在 `config/world.ts`。
2. 区块构建是同步的，构建预算避免单帧生成过多。
3. 小地图每 0.4s 采样 2500 个点，是稳定的次要 CPU 成本；可降低 `MINIMAP_CELLS` 或扩大刷新间隔。
4. 大地图只在打开时整张采样 512×512 ≈ 26 万个点（按 12ms 分片）；之后每 0.1s 只做像素平移与新边条重采样（最多 48 列 / 行），位移更大才退回整体重画。
5. 天穹俯瞰是额外的一次完整场景渲染：缩略图 4fps、256px，大视野 12fps、512px；它借用主画布角落渲染并在同一帧拷走，因此不要在其后再调用其它 `renderer.render`。
6. 所有静态植被与动物都走 InstancedMesh；不要为每棵树 / 每只动物单独建 Mesh。
7. 动物不做持久化和玩家碰撞，离开距离直接销毁并重新随机生成。
8. Three.js 单独分包，业务改动不会让浏览器重新下载引擎。
9. 渲染统计与实时帧率：`ui/fps.ts` 的 `FpsMeter` 用 `performance.now()` 的 0.5s 窗口统计，不使用主循环 `dt`（`GameLoop` 会把长帧截断到 50ms，反推会偏高）；`Game.installDebugApi` 暴露 `getFps()` 与 `renderStats()`（draw calls / triangles / geometries / textures / chunks），便于对照定位掉帧。

## 9. 大地图

`ui/BigMap.ts` 维护一张以玩家为中心的滚动底图，范围固定为玩家中心 ±1500m：

- **范围**：3000m × 3000m，等于小地图的 10 倍长宽；
- **底图**：`TerrainColoring.sampleMapColor` 采样到 512×512 的 `ImageData`，每片 12ms，用 `setTimeout` 让出主线程；
- **实时滚动**：`update` 每 `BIG_MAP_LIVE_INTERVAL`（0.1s）把玩家位移换算成像素位移，双缓冲上做 `drawImage` 平移（`MAX_SCROLL_PIXELS = 48`），只重采样新露出的列 / 行条带；超出上限才重新分片整图；
- **覆盖层**：世界坐标对齐的 500m 网格、沿 `roadX(z)` 采样的道路、中心玩家箭头、1km 比例尺、N 指北；坐标文字按 `BIG_MAP_COORDS_INTERVAL`（0.4s）节流；
- **非暂停语义**：打开地图时 `Game` 退出 Pointer Lock、改用 `InputManager.setOverlayMode(true)`：键盘保留、鼠标改为按住地图画面拖拽转向，模拟与渲染都不暂停；关闭时恢复 Pointer Lock；
- **状态**：`generating` 标记整图生成中；打开 / 重新打开会取消上一次生成并重启。

调参入口在 `config/ui.ts`：`BIG_MAP_RANGE_METERS`、`BIG_MAP_TEXTURE_SIZE`、`BIG_MAP_FRAME_BUDGET_MS`、`BIG_MAP_GRID_METERS`、`BIG_MAP_LIVE_INTERVAL`、`BIG_MAP_COORDS_INTERVAL`。

## 10. 天穹摄像机

`ui/SkyView.ts` 把小地图下方的缩略图与「天穹视角」大视野共用同一个俯瞰相机：

- **机位**：`PerspectiveCamera(SKY_VIEW_FOV = 42°, 1, SKY_VIEW_NEAR = 10, SKY_VIEW_FAR = 1600)`，位置 `(player.x, SKY_VIEW_HEIGHT = 760, player.z)`，`lookAt(player)`，`up = (0, 0, -1)` 使屏幕上方为正北；
- **视野**：地面宽度约 583m；对角半径约 412m，小于 `CHUNK_RADIUS × CHUNK_SIZE` 的 448m，四角不会露出未加载的虚空（`tests/ui/sky-view.test.ts` 用这些约束防止调参调坏）；
- **渲染方式**：`Viewport.renderOverview` 借用主画布，`setScissorTest(true)` + 画布左下角正方形 viewport / scissor 渲染一帧，立即 `drawImage` 拷进 UI 的 2D 画布，随后恢复 viewport / scissor；`Game.update` 必须在 `Viewport.render()` 之前调用它，主视角渲染会把画布覆盖回第一人称画面；
- **像素预算**：设备像素数被限制在 2D 画布分辨率（512 / 256）以内。Retina 或 150% 缩放的屏幕上，`size × pixelRatio` 会变成 768~1024 的方形填充，白白多出 2~4 倍成本；限制后俯瞰渲染成本恒定，打开大视野不再掉帧；
- **雾与云**：俯瞰前 `SceneEnvironment.beginSkyView()` 把 `Fog.near/far` 临时改为 460/1500（不更换雾对象，避免 shader 重编译）并隐藏云层，`endSkyView()` 恢复；
- **刷新**：未打开时按 `SKY_THUMB_INTERVAL` 直接渲染缩略图（4fps、256px）；打开后先把俯瞰渲染到离屏底图（`SKY_VIEW_INTERVAL` = 12fps、512px），**每帧**再按玩家位移把底图平移到可见画布（`SKY_VIEW_MAX_SCROLL_PIXELS` = 24px，超出或瞬移时立刻重渲染），因此画面每帧跟手、3D 只低频重画。中心只画一团从红到透明的渐变光晕标记主角所在区域，没有圆环也没有箭头（线条/箭头会盖住主角本体）；
- **互斥**：与大地图同一套覆盖层样式，`Game.openSkyView` 会先关掉大地图；`N` 键、缩略图（`#skyOpen`）、缩略图下方的「天穹大视野」按钮（`#skyBigOpen`，与大地图按钮共用 `.map-button` 样式）三个入口都能打开，`Esc` 关闭后恢复输入与 Pointer Lock。
- **覆盖层开销**：两个大视野都盖在实时渲染的 3D 画面上，全屏 `backdrop-filter` 每帧都要重新模糊整屏，已在 `bigmap.css` 中移除，改用更深的底色。

## 11. 房屋与野生动物

### 固定房屋

`world/landmarks/Houses.ts` 由 `seed + (cx, cz)` 做哈希，决定该区块是否生成房屋、候选位置、旋转和配色：

- 选址要求 10m×10m 地基与周围 16m 范围基本平坦、干燥，并避开道路；
- 房屋几何按区块构建并挂到该区块的 Group 上，随区块卸载一起销毁；同一区块重新加载会得到同一栋房子；
- 房屋清出 13m 植被带，并添加一个圆形碰撞体，玩家不能穿墙；
- 每栋房屋是 1 个 draw call，材质复用 `WorldMaterials.vegetation`。

### 动态动物

`wildlife/WildlifeManager.ts` 管理 6 个物种群：

| 物种 | 上限 | 渲染 | 行为 |
| --- | ---: | --- | --- |
| 鸟 | 12 | body + 左右翼，3 个 InstancedMesh | 盘旋 → 落地休息 → 起飞，地面 : 飞行 = 1 : 3 |
| 鱼 | 10 | 1 个 InstancedMesh | 只在水面下，随机游动 |
| 兔子 | 8 | 1 个 InstancedMesh | 停走 + 蹦跳，玩家靠近逃跑 |
| 蛇 | 5 | 1 个 InstancedMesh | 低伏蛇行 + 侧向摆动，受惊加速 |
| 牛 | 4 | 1 个 InstancedMesh | 只生成在平坦开阔地，长时间吃草 |
| 鹿 | 4 | 1 个 InstancedMesh | 开阔林地，警觉范围大，快速逃跑 |

生成点由 `wildlife/spawn.ts` 在玩家周围采样：陆地动物检查水面与坡度，鱼检查水深，鸟只看高度。动物不记录路径：

- 距玩家超过各物种的 `despawnRadius` 后直接从数组移除；
- 数量不足时按 `spawnInterval` 在玩家周围重新生成新的个体；
- 通过 `config/wildlife.ts` 统一调整速度、停走时长、逃跑半径、数量与距离。

鸟在 `wildlife/Birds.ts` 里有一个四态状态机：`fly`（巡航）→ `landing`（下降并收翅）→ `perched`（地面休息）→ `takeoff`（展翅爬升回巡航高度）。落地时在前方 6~24m 内试 8 次选点，要求地面高于 `WATER_LEVEL + 0.4`（不落水面 / 浅滩）；地面停留时长按本轮实际飞行时长换算（`groundToFlightRatio = 1/3`，飞行 15~26s、休息 5~8.7s），水位上涨淹没落脚点会立即起飞。收翅/展翅只是实例矩阵里翼根绕 Y 轴的旋转（`WING_FOLD_ANGLE`），不掉额外 draw call。

调试接口 `window.__wild.wildlifePopulation()` 和 `window.__wild.wildlifeSightings()` 可查看当前数量与位置。

## 12. 存档与扩展

存档保存的是「哪个世界 + 玩家在哪 + 几点」，世界本身仍由种子确定性重建，因此存档体积极小（约 270 字节）。

### 分层

```text
ui/SavePanel.ts        面板 DOM：当前进度 / 本地存档摘要 / 按钮
        │ 回调
app/Game.ts            saveLocal / loadLocal / export / import / remove + 覆盖层互斥
        │
save/SaveService.ts    快照 → codec 校验 → SaveStore 写槽位；恢复 player / hour / sections
        │                        │
save/codec.ts          结构定义 + 校验 + 序列化 + 文件名 + 摘要
save/SaveStore.ts      localStorage 读写；隐私模式 / 配额满 / 损坏内容都降级为 null / false
save/download.ts       Blob + <a download> 导出（延迟 60s 释放 objectURL）
```

`SaveService` 不直接碰 DOM，也不直接读写 `Player`：通过构造时注入的 `SaveContext`（`getHour/setHour/getPlayer/restorePlayer/reloadToSeed` + `seed`）访问游戏状态，因此可以在 Vitest 里用内存 `Storage` 和假 context 完整测试。

### 数据格式

```ts
interface SaveData {
  format: 'endless-wild-save';   // 校验第一道闸门
  version: 1;                    // 只接受 <= SAVE_VERSION，超前版本明确拒绝
  savedAt: number; seed: number; hour: number;
  player: { x, y, z, yaw, pitch, walked };
  sections?: Record<string, unknown>;   // 扩展区：未知键读取时原样保留
}
```

校验规则：`format` 必须匹配；`version` 超过当前版本视为无效；`seed` 必须在 `1..WORLD_SEED_MAX`（0 视为未提供而不是合法世界）；`player.x/z` 必须是有限数；`y/yaw/pitch` 缺省为 0，`walked` 取非负；`hour` 归一到 `[0, 24)`，缺失回落到初始时刻；`sections` 只接受普通对象，其余字段忽略。任何一步失败都返回 `invalid`，**不会覆盖本地已有的好存档**。

### 种子优先级与续档

1. URL `?seed=`；
2. `localStorage['wild-seed']`（上次游玩的世界）；
3. 本地存档的种子（`Game` 构造时先读存档，只把种子传给 `resolveWorldSeed` 作为兜底）；
4. 随机新种子。

`SaveService.restoreOnStart()` 只在「存档种子 === 当前世界种子」时恢复位置与时刻，避免打开旧存档把新世界拉回去。导入跨种子存档时先写本地槽位，再通过 `reloadToSeed(seed)` 改写 URL 并整页重载；重载后种子一致，启动续档自然生效。

### 恢复语义

- `Player.restore()` 直接落在存档点，清空 `vy`、`phase` 与平滑相机状态（`CameraRig.reset()`）；
- 存档点低于当前地表时抬回地面；保存在空中时保留高度，让重力自然落下；
- 单个 section 的 `restore` 抛错会被吞掉，不会让整份存档失败。

### 扩展点：新增可存档系统

```ts
save.registerSection({
  key: 'inventory',
  capture: () => ({ items: inventory.serialize() }), // 返回 undefined = 本次不写入
  restore: (value) => inventory.restore(value as Inventory),
});
```

新增系统只需实现 `capture / restore`，序列化、校验、跨种子重载、导入导出都不用改；`sections` 里的未知键在读取时会被保留，旧版本存档不会因为缺少新段而失效。若某系统需要独立版本，可在自己的 section 值里带 `version`，由 `restore` 自行降级。

### 覆盖层与输入

存档面板与大地图 / 天穹大视野互斥，且**不暂停模拟**：

- `openSavePanel()` 先 `savePanel.open()`，再关闭两个大视野，最后 `setOverlayMode(true)` + `exitPointerLock()`；先开面板是为了让 `releaseOverlayInput()` 看到面板已打开，不再重新请求 Pointer Lock（避免关闭大视野时锁定鼠标再被面板强行退出，产生闪烁）；
- `Esc` 顺序：存档面板 → 天穹 → 大地图；
- `SavePanel` 打开时刷新摘要并启用 / 禁用按钮：无本地存档时「载入 / 删除」不可点，`localStorage` 不可用（隐私模式）时「保存」不可点。

