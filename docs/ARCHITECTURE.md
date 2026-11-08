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
| 5 | 补建 / 卸载前后 700m 的里程碑木牌，跨过时返回播报 | `MilestoneSigns.update` |
| 6 | 动物生成 / 回收、行为推进、实例矩阵 | `WildlifeManager.update` |
| 7 | 宝石扫描 / 动态生成（动物、雨、雪、晴天白昼、夜晚）/ 拾取动画（回调把宝石写进背包与图鉴） | `GemManager.update` |
| 8 | 第一 / 第三人称相机 | `CameraRig.update` |
| 9 | 应用天空、太阳、雾、星星、水、云、路灯亮度 | `SceneEnvironment.applyDaylight` + `WorldMaterials.setLampIntensity` |
| 10 | 天空 / 星空跟随相机，水与云跟随玩家 | `SceneEnvironment.update` |
| 11 | 角色动画 | `Hero.update` |
| 12 | HUD / 小地图（内部节流）；宝石雷达点位 0.25s 刷新一次 | `Hud` / `Minimap` / `Game.refreshRadar` |
| 13 | 大地图实时滚动、天穹俯瞰（内部节流，必须先于主视角渲染） | `BigMap` / `SkyView` |
| 14 | 提交渲染；若 `K` 刚按下，在同一帧抓取画布像素存进相册 | `Viewport.render` + `Game.capturePhoto` |

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

每帧构建预算是**按毫秒算的**，不再是“几个区块”：

- 已开始探索：`CHUNK_STREAM_MS = 3.5`，最多 2 个区块 / 1 个道路段；
- 开始界面：`CHUNK_STREAM_MS_BOOT = 9`，最多 4 个区块 / 2 个道路段。

`update()` 在循环里每建完一个区块就检查一次 `performance.now() - frameStart`，超预算立刻 `break`；但每帧至少建 1 个，避免预算过小把加载卡死。这样一次山头进入视野时不会出现“一帧建 3 个区块 → 50ms 长帧”的掉帧。整理待建列表时，靠近玩家但还没补全内容的区块会以最高优先级加入重建队列，因此预算同样限制升级开销。

两阶段构建与交替调度：

- `ChunkMeshBuilder.buildTerrain()` 只采样高度、写顶点色与积雪遮罩（`CHUNK_SEGMENTS = 24`，外圈 `CHUNK_SEGMENTS_FAR = 16`）；
- `decorate()` 再撒植被、放房屋，并把 `colliders / house / detailed` 原地写回同一个 `ChunkView`；
- 需要内容的区块建完地形后进 `pendingDecoration`，`update()` 用 `decoratedLastFrame` 让“建地形”和“补内容”**一帧只做其中一件**——单帧最重的任务是原来的一半；
- `window.__wild.streamStats()` 暴露 `buildCount / avgTerrainMs / avgDetailMs / avgDecorateMs / maxBuildMs / frameBuildMs / pendingDecoration`，调参时用它看预算是否合适。

超出半径 + 边距的区块会立即移出场景并释放本区块独有的 GPU 资源；共享几何体与共享材质不释放，`pendingDecoration` 队列里属于该区块的项也会先被剔除。

## 5. 渲染组织

- **地形**：每个区块一个 `PlaneGeometry(64, 64, segments, segments)`，顶点位移后计算法线，再写顶点色；`segments` 按层级取 24（`CHUNK_DETAIL_RADIUS` 内）或 16（外圈，只在雾里）；共享 `MeshLambertMaterial({ vertexColors, flatShading })`。
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
- **宝石雷达叠加**：`setGems(spots | null)` 保存最近一次点位，`draw()` 在道路之后、比例尺之前用 `gemGlowColor(kind)` 画半径 3.2px、`shadowBlur = 8` 的光点，越界的点跳过；未解锁时传 `null`，叠加层为空；
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
- **解锁门控**：`SkyView.setUnlocked(v)` 同时控制 `#skyOpen` / `#skyBigOpen` 的 `hidden` 与内部的 `unlocked` 标记；未解锁时构造期就隐藏入口、`open()` 直接返回、`update()` 不渲染，解锁后 `timer = 0` 让缩略图立刻出一帧。`hud.css` 的 `#skyOpen[hidden], #skyBigOpen[hidden] { display: none; }` 用来覆盖作者样式里的 `display: block`；
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
  capture: () => this.inventory.toSave(),   // 返回 undefined = 本次不写入
  restore: (value) => this.inventory.fromSave(value),
});
```

新增系统只需实现 `capture / restore`，序列化、校验、跨种子重载、导入导出都不用改；`sections` 里的未知键在读取时会被保留，旧版本存档不会因为缺少新段而失效。若某系统需要独立版本，可在自己的 section 值里带 `version`，由 `restore` 自行降级。

### 覆盖层与输入

存档面板 / 背包 / 相册 / 图鉴 / 合成台与大地图、天穹大视野互斥，且**不暂停模拟**：

- `openSavePanel()` 先 `savePanel.open()`，再关闭两个大视野，最后 `setOverlayMode(true)` + `exitPointerLock()`；先开面板是为了让 `releaseOverlayInput()` 看到面板已打开，不再重新请求 Pointer Lock（避免关闭大视野时锁定鼠标再被面板强行退出，产生闪烁）；
- `Esc` 顺序：合成台 → 背包 → 图鉴 → 相册 → 存档面板 → 天穹 → 大地图；
- `SavePanel` 打开时刷新摘要并启用 / 禁用按钮：无本地存档时「载入 / 删除」不可点，`localStorage` 不可用（隐私模式）时「保存」不可点。

## 13. 宝石系统

宝石是低概率出现的发光地标，共 10 种。它们不参与物理 / 碰撞，也不修改世界，只是从地形数据里“挑点”然后在场景里画出来，因此可以完全按需生成与回收。

### 分层

```text
config/gems.ts         种类、颜色、尺寸、概率、扫描预算、动态宝石参数
        │
gems/sites.ts          纯函数：给定 (World, seed, cx, cz) → 该区块的固定宝石站点
        │              钻石 / 蓝 / 绿 / 黑 / 黄各走一条生境规则
world/desertLandmarks.ts  hoodooSiteAt()：风蚀岩柱位置，植被撒点与黄宝石共用
        │
gems/GemManager.ts      渲染（多面体 + 光晕 + 光柱）、区块扫描、动物 / 天气 / 夜晚动态生成
        │
app/Game.ts             每帧 update(dt, playerState, weather, waterLevel)

宝石合成（独立于生成管线）：
config/gemSynthesis.ts  2 合 1 配方表 + 6 层获取难度
gems/GemSynthesis.ts    纯逻辑：库存足够时 spend(2) → add(1)
```

`GemManager` 只依赖 `World`、`PlayerState`、天气快照、水位和一份动物位置回调（由 `Game` 传入 `WildlifeManager.getSightings()`），不碰 DOM 与输入。

### 每帧流程

1. 每 0.3s 扫一次玩家周围 5 个区块（约 320m），按距离由近到远，最多新算 10 个区块的站点；
2. 站点命中就按 `maxActive` 生成；离玩家超过 480m 的固定宝石（含动态宝石）回收；
3. 红宝石每 0.2s 跟随一次动物，丢失目标 1.5s 后回收；
4. 紫宝石在**雨天**且降水 ≥ 0.08 时每 2.2s 掷一次，雨停后全部回收；
5. 冰晶石在**雪天**且降雪 ≥ 0.08 时每 2.6s 掷一次，雪停后全部回收；
6. 日耀石在**晴天白昼**（降水 ≤ 0.02 且日照 ≥ 0.55）时每 3.2s 掷一次，天黑或转雨雪后立即回收；
7. 荧光石在日照因子 < 0.35（夜晚）时每 3.5s 掷一次，天亮后立即回收；
8. 荧光石的本体固定为每面一色（顶点色），光晕与光柱是同时多色的彩虹贴图：光晕按 `glowHaloSpin` 自转、光柱贴图按 `glowPillarScroll` 沿柱面滚动；
9. 水位变化超过 0.02 时重算所有宝石的 `baseY`（湖心的蓝宝石会随水位一起上升）；
10. 每颗宝石自转（1.15 弧度/秒），光晕按正弦呼吸；
11. 最后跑一次拾取：碰到玩家胸口的宝石进入 `collectTime` 动画（详见「14. 背包与拾取」），动画结束时回调 `Game.collectGem()` 写进背包与图鉴并移除这一颗。已经进入拾取动画的宝石不参与扫描回收、红宝石跟随与水位重算。

### 站点规则（概率都在 `GEM_RULES` / `GEM_DYNAMIC` 里）

| 宝石 | 规则 | 概率 |
| --- | --- | --- |
| 钻石 | 森林 ≥ 0.2、沙漠 ≤ 0.2、离道路 > 半宽 + 3m、地面高出水位 0.5m | 每区块 0.02，最多 2 颗 |
| 黑宝石 | 区块最高点的积雪值 `height + detail * 4` ≥ 40m（地形开始泛白的雪线），且是 3×3 区块里最高的峰顶（山头），并避开沙漠与绿洲 | 每座山 1/2 概率（`chance = 0.5`），一座山最多一颗，最多 4 颗；光柱纯黑 |
| 蓝宝石 | 不看 biome / 深度：落点比水位低 0.4m，且向外 24m 的 8 个方向都仍是水（水面直径 ≥ 48m）。候选点按 96m 水面格划分，格心附近 3×3（步长 24m）从深到浅验算 | 每个水面格 0.4；一格最多一颗，相邻两颗至少隔 48m，最多 3 颗 |
| 绿宝石 | 绿洲：只由绿洲中心所在区块生成，落点在湖岸外 40m 到绿洲外缘之间；草地：草原地表、离水面 / 道路 / 沙漠都够远 | 每块绿洲 0.85；每个草地区块 0.005；最多 3 颗 |
| 黄宝石 | 岩柱：复用 `hoodooSiteAt()` 的真实岩柱格号，落点距岩柱 3.6–5.2m；沙漠：沙漠生境因子 ≥ 0.6、离所有岩柱 ≥ 9.6m | 每根岩柱 0.7；每个沙漠区块 0.006；最多 3 颗 |
| 紫宝石 | 雨天玩家 55–250m 的环形内，避开道路、沙漠、水面与其它宝石 | 每次扫描 0.3，最多 3 颗；雨停回收 |
| 冰晶石 | 雪天玩家 55–250m 的环形内，避开道路、沙漠、水面与其它宝石 | 每次扫描 0.3，最多 3 颗；雪停回收 |
| 日耀石 | 晴天白昼玩家 60–240m 的开阔地，避开道路、沙漠、水面与其它宝石 | 每次扫描 0.28，最多 2 颗；天黑 / 转雨雪回收 |
| 荧光石 | 夜晚玩家 60–260m 的开阔地，避开道路、水面与其它宝石（不避开沙漠） | 每 3.5s 0.3，最多 2 颗 |
| 红宝石 | 130m 内最近的牛 / 鹿 / 骆驼，宝石悬在背上方并跟着走 | 每 16s 0.4，最多 1 颗 |

### 确定性

固定宝石只由 `seed ^ 各自盐值 + 区块坐标` 决定：每种宝石一条独立随机流，新增宝石不会挤动已有宝石的位置。走远再回来会生成在同一处。

- **蓝宝石**的地理单位是 **96m 水面格**而不是区块：只有“格心落在这块 64m 区块里”的那个区块会处理该格，所以一格恰好一个区块负责，不会出现相邻区块各撒一颗、两颗挤在同一片湖心的情况；`key` 用格号（`blue:gx:gz`）。格内候选点限定在中央 48m 见方，相邻两格的宝石因此至少隔开 48m。
- **绿宝石**两套生境的 `key` 分别带 `oasis` / `meadow` 前缀（`green:oasis:cx:cz`、`green:meadow:cx:cz`），同一个区块仍然最多一颗；绿洲分支额外要求“绿洲中心所在区块”，保证一块绿洲最多一颗。
- **黄宝石**岩柱分支沿用 `yellow:<岩柱格号>`，沙漠分支用 `yellow:desert:cx:cz`；岩柱分支只由“岩柱所在区块”产出，沙漠分支会先把周围 9.6m 内的岩柱全部排除。

黑宝石分两步判定，先确认“有没有积雪”，再确认“算不算一座山”：

1. **积雪**：`chunkTop()` 在区块内做 5×5 粗采样（约 13m 一个点），取积雪值 `height + detail * 4` 最大的候选；只有它离雪线不到 5m 时才 `peakInChunk()` 继续“上山”，从 6.4m 一路细化到 1.6m。最终候选 ≥ 40 就说明这块区块里确实有地形着色的白色覆盖。
2. **山头**：`isSummit()` 与 3×3 区块互比粗采样最高点，只有其中最高的那块才算山头。一座山不论横跨多少区块，都只由最高峰所在区块产出，因此一座山最多一颗黑宝石，山腰/山脚不会各自冒一颗。
3. **概率**：山头再通过 `seed ^ 盐值 + 山头区块坐标` 掷 1/2（`GEM_RULES.black.chance = 0.5`），命中才在细化后的峰顶生成。随机流只由山头区块决定，走开再回来结果不变。

- 之前用 600m 山格 + 7×7（100m 步长）找峰顶，会严重低估高度：山脊波长只有约 154m，采样点常常落在半山腰，明明有白光却判定“没到雪线（< 40m）”。实测 seed 774477 在 3.2km 范围内 60 块积雪区块**一颗黑宝石都没有**；改成按区块判定后再按山头去重，覆盖率恢复的同时密度也降下来了。
- 采样落在区块的半开区间 `[center - 32, center + 32)` 内，相邻区块不会抢到同一点。
- 成本：普通区块 25 次高度采样就被粗筛掉；积雪区块约 52 次高度 + 52 次细噪声 ≈ 0.14–0.26ms，山头比较只读已缓存的 `chunkTop()`。按每次扫描 10 个新地块的预算，走进雪山时最坏多花约 2.6ms。
- 粗采样与峰顶结果分别按 `seed:cx:cz` 做 LRU 缓存（2048 项），反复加载同一区块只算一次。
- 光柱颜色来自 `GemDefinition.pillarColor`，黑宝石设成纯黑（`0x000000`），其余宝石不填、沿用 `glow`；光晕仍是暗紫，保证宝石本体在白雪山上有对比度。

红 / 紫 / 冰晶 / 日耀 / 荧光石是**动态**的（依赖动物、天气与昼夜），位置不写入存档，也不需要确定性；只有“被收走了几颗”记在背包里。

### 拾取钩子

`GemManager` 不认识背包，只接收 `Game` 注入的两个回调（`GemManagerHooks`）：

- `isTaken(key)`：`spawnSite()` 在生成前问一次，固定宝石的站点被收走过就直接跳过，走远再回来不会复活；
- `onCollect(kind, key)`：拾取动画播完后回调，由 `Game.collectGem()` 写进 `Inventory`、记录 `GemCodex`、刷新 HUD 与提示，并 refresh 已打开的背包 / 图鉴面板。

### 渲染与性能

每颗宝石 = 1 个按形状创建的几何体（`createGemShape()` 依据 `GEM_DEFINITIONS[kind].shape` 生成：八面体、二十面体、四面体、十二面体、`LatheGeometry` 双锥 / 钻石切面 / 六棱晶体、细分二十面体球、四棱冰锥、挤出的五角星，最大外径都对齐到 0.92m）+ 1 个 `Sprite` 光晕（除荧光石外加色混合）+ 1 根开口圆柱光柱（`MeshBasicMaterial`，Canvas 贴图、普通透明混合、`fog: false`、`toneMapped: false`）。几何体按种类各建一份，`dispose()` 时统一释放。同时最多十余颗，因此不做实例化（实例化反而无法逐颗换材质）。

荧光石独占一套材质：本体是 `toNonIndexed()` 之后写 `color` 顶点属性的 80 面二十面体球（`MeshBasicMaterial({ vertexColors: true, toneMapped: false })`，每面 `setHSL(face * 0.618 % 1, ...)` 取色），光晕与光柱用两张 Canvas 彩虹贴图（24 段色环 + 径向 / 竖向 alpha），因此不依赖每帧改颜色也不会被 ACES 色调映射压成白色。光晕之所以用普通透明混合而不是加色混合：加色会把一圈颜色相加成白色，多色就没了。

光柱贴图同时带竖向和横向渐变：竖向从柱顶往下 30% 处开始透明、到最高点前完全消失；横向把圆柱左右边缘擦成透明，因此普通透明混合下也不会出现硬边管子。之前用加色混合时，近距离光柱会被天空颜色冲成一片白（黄色、钻石尤其明显），换成普通混合后颜色能保留下来。

柱高 120m、半径 0.92m（直径约为宝石的两倍）。柱高选择 120m：太低不像“直冲天际”，300m 则玩家在 300m 外也看不到柱顶，渐隐永远看不见；120m 在 200m 外就能看到柱顶淡出（相机竖直 FOV 70°，屏幕顶端约在水平向上 32°）。

`GemManager` 为一个场景 `Group`（`name = 'gems'`），`dispose()` 时释放几何、贴图与所有材质。

### 扩展方式：新增一种宝石

1. `config/gems.ts`：在 `GemKind`、`GemShape`、`GEM_DEFINITIONS`、`GEM_KINDS` 中添加条目（形状、颜色、光晕色、`maxActive`、规则文案）；需要新轮廓时在 `createGemShape()` 里补一个 `case`，并在 `ui/gemIcon.ts` / `styles/inventory.css` 补一个剪影类名；
2. 固定宝石：在 `gems/sites.ts` 的 `SALTS` 里加独立盐值 + 在 `GEM_RULES` 里加概率 + 在 `findSite` 里加一条生境规则；站点 key 用 `kind:cx:cz`；
3. 动态宝石：在 `GEM_DYNAMIC` 加参数，并在 `GemManager` 里加一个 `updateXxx()`（可参考 `updateRed` / `updatePurple`）；若是天气 / 昼夜驱动的，把种类加进 `DYNAMIC_GEM_KINDS`，它就会自动从固定站点扫描与 `taken` 白名单里排除；
4. 若需要新的外观，在 `GemManager` 构造里补材质；尺寸 / 光柱参数统一在 `GEM_VISUALS`；
5. 补 `tests/gems/gems.test.ts`：外观约束 + 新规则的地形断言 + 站点可复现性。

## 14. 背包与拾取

宝石不按键拾取：走近就收，收藏过程是“飞进身体”的动画，结果落到一份可存档的背包里。

### 分层

```text
inventory/Inventory.ts   纯逻辑：按种类计数 + 已收走的固定站点 key + toSave / fromSave
        │                                            （不依赖 DOM / three.js，可单测）
app/Game.ts              collectGem()：写背包 → 刷新 HUD → 弹提示 → 面板打开时 refresh
        │                registerSection({ key: 'inventory' })：让背包进入存档 sections
ui/InventoryPanel.ts     背包面板：固定 6×4 空格子 + 每种宝石的形状图标 + 数量角标
        │
gems/GemManager.ts       拾取判定 + 动画，结束时通过 hooks.onCollect 回调
```

### 数据模型

```ts
interface InventoryData {
  gems?: Partial<Record<GemKind, number>>;  // 每种宝石的数量，缺省视为 0
  taken?: string[];                          // 已经收走的固定宝石站点 key
}
```

- 计数上限 9999 / 种类，`fromSave` 用 `Math.floor` + 夹紧，`Infinity` / `NaN` / 负数都被压回合法区间；
- `taken` 最多 4000 项，只接受**静态**站点 key（`kind:cx:cz`）；`DYNAMIC_GEM_KINDS`（`red` / `purple` / `glow` / `frost` / `sun`）这些动态前缀一律丢弃，避免收过一颗紫宝石就永久锁死这个系统；
- 空背包 `toSave()` 返回 `undefined`，存档里不会多出 `sections.inventory`。

### 面板格子（`InventoryPanel`）

- 固定 `SLOT_COLUMNS = 6` / `SLOT_ROWS = 4`，共 24 格——**空格子也要画出来**，`refresh()` 永远铺满 24 个，只是没东西的格子标 `is-empty`（虚线框、更暗的底色）；窄屏时 `--bag-columns` 由 CSS 媒体查询降到 4 列。
- 每格画的是这颗宝石的**形状**：`SHAPE_CLASS` 把 `GemShape` 映射成 `bag-gem--octahedron / icosahedron / tetrahedron / dodecahedron / bipyramid / brilliant / crystal / orb / shard / star`，各自一条 `clip-path` 剪影。
- 颜色不写死在 CSS：`slot()` 用宝石主色现算三段渐变写进 `--gem-light / --gem-color / --gem-dark`，辉光取 `--gem-glow`（光晕色）；荧光石没有单一主色，走 `conic-gradient` 彩虹 + 球面高光，因此不设这几个变量。
- 数量在右下角的小角标里（`×N` 只出现在 `title` 悬浮提示里），`bag-item` 类名保留给调试脚本按品类找格子。

### 宝石合成（2 合 1）

```text
config/gemSynthesis.ts   配方表 + 获取难度层级（只描述数据，不依赖 Inventory）
gems/GemSynthesis.ts     synthesizeGem()：先 spend 2 颗，再 add 1 颗；失败不动库存
ui/InventoryPanel.ts     背包下半部分的合成列表：实时数量、禁用态、结果提示
app/Game.ts              synthesizeGems()：刷新 HUD、图纸可用数量并静默存档
```

- 难度层级：`日耀 / 荧光` → `红 / 紫` → `黄 / 蓝` → `绿 / 冰晶` → `钻石` → `黑`；每条配方都必须从低层走向高层，测试会逐条校验；
- 两条支线最终汇到钻石：`32 日耀 → 1 黑`、`32 荧光 → 1 黑`。这样既给常见宝石一个长期去处，也避免 10 级直链把顶级宝石抬到 512 颗；
- `synthesizeGem()` 只在 `Inventory.spend()` 成功后才 `add()`，库存不足时返回 `no-stock` 且不产生任何改动；
- 合成不新增存档段：结果直接是背包里的数量变化，随 `sections.inventory` 一起落盘；`Game` 在成功后调用 `save.saveLocal()`；
- 面板每次 `refresh()` 都会先重画配方数量，再按旧签名决定是否重建 24 个收纳格，因此合成后数量与按钮禁用态立即同步。

### 拾取判定与动画（`GEM_COLLECT`）

1. **碰到**：以玩家胸口 `state.y + GEM_VISUALS.centerHeight`（0.93m，与宝石中心同高）为基准，水平 1.4m、垂直 1.3m 以内算碰到；用水平 + 垂直两个容差而不是球体距离，跳水 / 游泳时的高度差不会隔空吸走宝石。
2. **起手**：记录宝石当时的 `startX/Y/Z`，立刻隐藏光柱（120m 的光柱缩进胸口会很难看），`collectTime = 0`。
3. **每帧**：`progress = collectTime / duration`（0.6s），`eased` 用 smoothstep；缩放 `1 → endScale(0.18)`，位置朝玩家胸口插值，再叠加 `sin(π·eased) · arc(0.45m)` 的向上弧线（实测拱起约 0.25m），自转加速到 10 弧度/秒，光晕同步缩小到 15%。
4. **落点**：目标组 Y 取 `chestY - centerHeight * scale`，因为宝石网格在组内本身抬高了 `centerHeight`，所以缩放后宝石中心正好落在胸口而不是脚下。
5. **结束**：`progress >= 1` 时从场景移除该组、释放它的实例，再回调 `onCollect(kind, key)`；“宝石消失”和“写进背包”在同一帧发生。

已经进入动画的宝石会被扫描回收、红宝石跟随、水位重算统统跳过（`collectTime !== undefined` 就 continue），否则飞一半被回收等于白收。

### 存档与 UI

- 背包在 `Game` 装配 `SaveService` 之后 `registerSection({ key: 'inventory', capture, restore })`，数据落在 `SaveData.sections.inventory`，`SAVE_VERSION` 不用改，旧存档缺少该段时就是空背包；
- 载入 / 导入存档后 `Game.runSaveAction()` 统一同步 HUD 数量与面板内容（`syncInventoryUi()`），因为 `taken` 也一起变了；调试接口 `loadGame()` / `importSaveText()` 也走同一个 `syncInventoryUi()`，避免出现“背包有了、HUD 还是 0”；
- `GemManager.dropTakenSites()` 在同步时顺手把场景里已经属于 `taken` 的固定宝石摘掉，否则导入一份“收过这颗”的存档后，那颗宝石还会站在原地；
- HUD 新增「宝石：N 颗」与 toast（1.8s 后自动隐藏），提示文案是「收进背包：钻石 +1」，只报这一颗、不带累计数量；背包面板按 `B` 或底部按钮打开；
- 覆盖层互斥：`openBagPanel()` 先自己进入打开状态，再关掉存档面板 / 图鉴 / 大地图 / 天穹，最后 `setOverlayMode(true)` + `exitPointerLock()`；`releaseOverlayInput()` 会等背包也关掉才重新锁定鼠标，`Esc` 顺序是 合成台 → 背包 → 图鉴 → 相册 → 存档 → 天穹 → 大地图。

### 扩展方式：新增一个收纳品类

1. `Inventory` 目前按 `GEM_KINDS` 计数，新品类需要在 `entries()` 与 `fromSave` 的白名单里同步；
2. `ui/InventoryPanel.ts` 的 `slot()` 用 `GEM_DEFINITIONS[kind]` 取名字、主色与形状，新品类只要在 `SHAPE_CLASS` 里登记一个剪影类名就能自动适配；
3. 存档格式不变（`sections.inventory` 仍是 `{ gems, taken }`），若需要新结构（例如物品实例而不是计数），在 section 值里加 `version` 并由 `fromSave` 自行降级。

## 15. 功能合成解锁

开局即可行走、跳跃与查看背包，地图、视角与 `F` 自动前进也始终可用，其余功能都靠宝石图纸合成解锁。这一层刻意拆成「配置 → 纯逻辑 → UI → 应用门控」，因为图纸与数值是最常改的部分。

### 分层

```text
config/unlocks.ts       图纸（layout 字符网格）、难度梯度、默认能力、新手礼包、独立存档键
        │               buildFeatureSpec() 解析出 cols / rows / cells / needs / total
unlock/UnlockSystem.ts  纯逻辑：草稿、预留、摆放校验、合成校验、解锁状态、toSave / fromSave
unlock/UnlockStore.ts   独立 localStorage 槽位（不依赖世界种子）
        │
ui/CraftPanel.ts        图纸标签（CRAFT_FEATURE_ORDER）、槽位网格、拖拽 / 点击摆放、形状粒子特效
app/Game.ts             applyUnlocks() 把解锁状态门控到输入 / 工具栏 / 速度 / 天气 / 面板 / 地图雷达
```

### 数据模型

```ts
interface FeatureSpec {
  id: FeatureId;              // walk / jump / bag（默认能力）+ speed1..7 / album / sprint / codex / time / weather / view / radar / sky / save
  label: string; summary: string;
  layout: string[];           // 例：['gyg', ...] / ['y.g', '.d.', 'g.y']，'.' 为留白；默认能力为空数组
  cols: number; rows: number;
  cells: FeatureCell[];       // 行优先展开，含留白格（kind === null）
  needs: GemNeed[];           // 按 GEM_KINDS 顺序汇总的种类与数量
  total: number;              // 需要摆放的宝石总数
}

interface UnlockSaveData {   // sections.unlock，同时也是独立槽位的内容
  unlocked?: FeatureId[];     // 已启用（合成完成或调试解锁）；默认能力不写入
  completed?: FeatureId[];    // 合成完成（界面保留完成态光效）
  drafts?: Record<string, (GemKind | null)[]>;
  starterGranted?: boolean;   // 新手礼包是否已发放
  debug?: boolean;            // 是否用过调试一键解锁（放行调试传送）
}
```

- `FEATURE_ORDER` 包含全部 19 项（含默认能力），`CRAFT_FEATURE_ORDER = FEATURE_ORDER.filter(!isDefaultFeature)` 才是合成台的 16 项；测试断言两者差集正好等于 `DEFAULT_UNLOCKED_FEATURES`；
- `UnlockSystem` 的 `unlockedIds` 初始化与 `reset()` 都会先放入 `DEFAULT_UNLOCKED_FEATURES`，因此 `walk / jump / bag` 永远处于已解锁态，但不会出现在 `toSave().unlocked` 里，`unlockAll()` 也跳过它们；

- `draft` 长度固定等于 `cells.length`（含留白格），留白格永远不放宝石；
- **跨草稿预留**：`reserved(kind, except?)` 汇总所有未解锁功能草稿里占用的数量，`available(kind, inventory, except?)` 用它算“还能摆几颗”，避免两份草稿共用同一颗宝石后突然报库存不足；
- 合成只校验**种类计数**（`describeMismatch()` 按 `GEM_KINDS` 逐项比较），形状由 `layout` 决定；
- 成功时 `inventory.spend()` 扣宝石、写入 `unlocked + completed`、删掉草稿；失败（没摆满 / 种类不符 / 库存不足）**不动库存**。

### 门控点（`Game.applyUnlocks()` 与 `Game.gateIntent()`）

| 能力 | 门控方式 |
| --- | --- |
| 行走 / 跳跃 | **默认解锁**，`gateIntent()` 只透传 `forward / strafe / jump`，不再清零 |
| 奔跑 | `gateIntent()` 把 `run` 置为 `isUnlocked('sprint') && intent.run`，`Player` 本身完全不知道解锁这回事 |
| 速度 1–7 档 | `UnlockSystem.speedLimit()` 取已解锁档位的最大倍率，`setSpeedScale()` 夹紧到 `[0.5, limit]`；`SpeedControl.setLimits()` 同步滑杆 `min / max`、禁用态与提示 |
| 背包 / 存档 / 时间 / 第三人称 / 相册 / 图鉴 | 各 `open*()` / `set*()` 入口先用 `blockedByUnlock()` 判断，命中就 `hud.announce()` 提示去合成台，不进入打开状态（背包默认解锁，这条门控恒为放行） |
| 相册（`K` 键） | `requestPhoto()` 同样先 `blockedByUnlock('album')`，未解锁时只提示，不置 `photoRequest`；工具栏相册按钮由 `applyUnlocks()` 调 `Toolbar.setLocked('album')` 变暗 |
| 天穹视角 | `skyView.setUnlocked()`：未解锁时把 `#skyOpen` / `#skyBigOpen` 的 `hidden` 置真（`hud.css` 里 `[hidden]` 覆盖作者的 `display:block`），并 `close()` + `update()` 提前返回；解锁后才出现缩略图与按钮 |
| 宝石雷达 | `Game.refreshRadar()` 每 0.25s 一次：解锁时把 `gems.getSightings()` 交给 `minimap.setGems()` 与 `bigMap.setGems()`，未解锁时传 `null` 清空光点；解锁状态变化时 `applyUnlocks()` 立即刷新 |
| 天气控制 | `WeatherControl.setLocked()` 与原有的沙漠遮挡（`desertBlocked`）合并成一个 `blocked` getter |
| 调试传送（去沙漠 / 去绿洲） | 只在 `unlock.debugUnlocked` 为真时放行 |
| 工具栏按钮 | `Toolbar.setLocked()` 加 `is-locked` 类 + `aria-disabled`（**不用 `disabled`**，这样点击仍能触发提示），并重新排布“更多” |
| 触屏摇杆 / 跳跃键 | 默认解锁，`applyUnlocks()` 只移除 `is-locked` 类（`touch.css` 里的变暗样式因此不再触发） |

### 摆放与粒子特效（`CraftPanel`）

- 拖拽：宝石条是 `draggable` 的 chip，`dragstart` 同时写 `text/plain` 与 `application/x-wild-gem`；槽位用事件委托处理 `dragover / dragleave / drop`（`is-drop-target` 高亮）；
- 点击：先点宝石 chip 进入“安装模式”，再点空槽放置；点已填槽取回；
- `refresh()` 每次重建网格（留白格 `is-void` 隐藏、空格显示淡色宝石剪影 `craft-ghost`、填错种类加 `is-wrong`），并对比上一份快照 `last{id, filled, status}`：
  - 刚好摆满 → `playEffect('charge')`；
  - 刚好从非 completed 变成 completed → `playEffect('craft')`；
- `playEffect()` 用 `getBoundingClientRect()` 把每格中心换算成 `#craftFx` 内的坐标，沿相邻格（含斜向）之间每 6–9px 插值补点，让粒子轨迹**勾出图纸形状的轮廓**；`burst()` 生成 `span.craft-particle`，用 CSS 变量（`--p-x / --p-y / --p-color / --p-size / --p-duration / --p-delay`）驱动 `@keyframes craft-particle-fly`，上限 320 颗防止 DOM 堆积；
- 完成态由 CSS 常驻：`craft-grid.is-completed` 给槽位 `craft-cell-complete` 呼吸光 + 外围 `craft-aura` 金色光晕，1.3 / 1.7 秒后清理粒子但保留光效。

### 存档与合并

1. 启动时先读独立槽位 `endless-wild-unlocks-v1`（`UnlockStore`），`fromSave()` 整体替换；
2. 再 `registerSection({ key: 'unlock', restore: mergeFromSave })`：世界存档恢复走**合并**（只增不减、草稿以当前为准、`starterGranted / debug` 取或），因为完整存档可能比独立槽位旧；
3. `grantStarterGems()` 在续档之后判断：`starterGranted` 已为真就直接返回，背包非空只补标记，否则按 `STARTER_GEMS` 发放；
4. `persistUnlocks()` 把合并后的进度写回独立槽位；合成成功、调试解锁、背包变化后都会调用 `applyUnlocks()` + 持久化，并静默 `save.saveLocal()` 让世界存档也跟上；
5. `fromSave / mergeFromSave` 都走 `validateDrafts()`：留白格上的宝石、超出库存的宝石、已解锁功能的草稿会被丢弃，坏存档不会凭空生成宝石。

### 测试与扩展

- `tests/unlock/unlock.test.ts` 覆盖：图纸可解析且 `needs / total / cells` 一致、16 张可合成图纸形状互不相同、难度总数只增不减（4→24）、速度 7 档逐级加码、默认能力（`DEFAULT_UNLOCKED_FEATURES` 与 `CRAFT_FEATURE_ORDER` 的差集）初始化即解锁且不写进存档、宝石雷达大量消耗蓝 / 绿 / 黄、前两档速度不含沙漠 / 绿洲的蓝绿黄、除黑宝石外每种宝石至少出现在 5 张图纸里、摆放的六种拒绝分支、跨草稿预留、四种合成结果、速度上限取最高档、存档往返与合并语义、独立槽位的坏数据降级；
- 新增一项功能：在 `FEATURE_SEEDS` 里加一张图纸（`layout` 决定形状与需求）→ 在 `FeatureId` 登记 → 若它是开局能力，同时加进 `DEFAULT_UNLOCKED_FEATURES`（它就不会出现在 `CRAFT_FEATURE_ORDER` 与解锁存档里）→ 在 `Game.applyUnlocks()` 里给它的能力加一条门控 → 若要速度档位，在 `SPEED_FEATURE_PRESETS` 里补倍率。UI 与存档格式都不需要改。

## 16. 里程碑、旅途相册与宝石图鉴

三个系统都刻意保持“无状态副作用”：木牌只读地形采样，相册只存一张压缩缩略图，图鉴只记首次发现，刷新后行为完全一致。

### 里程碑路牌

```text
config/world   ROAD_WIDTH / 道路高度 / 桥面系数
      │
world/milestones.ts     纯函数：500m 间距、区间序号（向下取整）、木牌文字
world/MilestoneSigns.ts 按玩家 z 补建 / 卸载 ±700m 内的木牌，检测跨越
app/Game.ts             update() 取返回值，用 Hud.announce 播报
```

- 序号 `milestoneIndexAt(z) = floor(z / 500)` 表示“位于哪两个路牌之间”；跨越发生在 `index` 变化且跨度为 1 时，真正越过的那块取 `max(前一块, 新一块)`，正反方向都对；
- 传送、载入存档、换世界会让 `index` 一次跳很多，`|delta| !== 1` 时直接丢弃，不刷屏；
- 木牌位置：`roadX(z) ± (ROAD_WIDTH / 2 + 1.3)`（植被从路缘 1.5m 外才开始生成，因此不会长在树里），高度取 `max(groundAt, roadHeight)`；桥面（`bridge > 0.3`）跳过；
- 牌面几何是两块背对背的四边形合并成的单个 `BufferGeometry`，背面 UV 左右翻转，正反两面文字都不镜像，一次绘制完成；
- 贴图按序号缓存 12 张，超出后优先释放不在场景里的那一张；`CanvasTexture` 与 `MeshLambertMaterial` 一起释放，长途旅行不会累积 canvas；
- 牌面用同一张画布同时作为 `map` 与 `emissiveMap`，夜里仍有 28% 自发光，不会变成黑块；
- 木牌不属于区块流式系统：它只依赖地形高度函数，和区块加载 / 卸载互不影响。

### 旅途相册

```text
input/Keyboard         K → take-photo
app/Game.ts            photoRequest = true → 下一帧 render 后 capturePhoto()
album/Album.ts         纯数据：上限 16 张、按 id 删除、toSave / fromSave 校验
ui/AlbumPanel.ts       3 列网格、大图、删除
save/SaveService       sections.album
```

- **为什么不在按键时立刻截图**：`WebGLRenderer` 没有开 `preserveDrawingBuffer`，画布内容在浏览器合成后就不再可靠；把截图放在 `viewport.render()` 之后、同一帧任务内执行，`drawImage` 才能拿到真实像素，同时避免为一张照片牺牲整局的渲染性能；
- 截图流程：主画布 → 480px 宽的 2D canvas → `toDataURL('image/jpeg', 0.62)`，HUD / 面板等 DOM 天然不入镜；
- 数据：种子、坐标、朝向、时刻、天气、地貌、自动标题（`天气 · 地貌 · 时刻`）与缩略图；单张约 15–20KB，最多 16 张；
- 校验：缩略图必须是以 `data:image/` 开头的字符串且长度受限，所有数字必须有限，文本截断到 120 字符，重复 `id` 跳过；任何一项不合法只丢这一张，不影响整段存档；
- 删除与新增都会静默 `save.saveLocal()`，照片随世界存档一起导入导出；
- 相册需要先合成「旅途相册」才解锁：`K` 键走 `requestPhoto()` 的门控，未解锁时只提示去合成台；面板打开时退出 Pointer Lock，并在 `releaseOverlayInput()` 里与其它覆盖层一起参与“全部关闭后才恢复锁定”的判断。

### 宝石图鉴

```text
codex/GemCodex.ts       纯数据：首次发现记录、累计数量、toSave / fromSave 校验
ui/CodexPanel.ts        两列卡片、未发现剪影、首次时间 / 种子 / 坐标
app/Game.ts             collectGem() 记录；registerSection({ key: 'codex' })
```

- 首次拾取时写入 `{ kind, firstAt, seed, x, z, count }`；之后再拾取同类只把 `count + 1`，首次地点不会被覆盖；
- `list()` 按 `GEM_KINDS` 固定顺序返回全部条目，未发现时 `entry` 为 `null`，面板据此画黑色剪影并保留出现条件提示；
- `fromSave` 只接受已知 `GemKind`、有限数字与正数量，重复条目取第一条；空图鉴 `toSave()` 返回 `undefined`，不写空段；
- 首次发现时 HUD 播报「图鉴新增（N/10）」，普通重复拾取仍只报「+1」；图鉴需要先合成「宝石图鉴」才解锁，未解锁时工具栏按钮变暗、`openCodexPanel()` 只提示；
- 面板刷新有签名短路：内容没变不重建 DOM，打开状态与拾取回调共用同一个 `refresh()`；
- 调试接口：`window.__wild.codexEntries()` / `codexState()` / `openCodexPanel()` / `closeCodexPanel()` / `isCodexPanelOpen()`。




