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
| 11 | 提交渲染 | `Viewport.render` |

开始界面阶段仍在跑同一循环，只是跳过玩家移动，并让相机缓慢自转；世界会提前预生成附近区块。

大地图打开时 `Game.update` 直接返回：玩家、昼夜、区块流式加载和 3D 渲染全部冻结，只保留 `BigMap` 自己的地形分片采样定时器。

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

- `chunks: Map<"cx,cz", ChunkView>`：64m 地形区块，半径 4，按“距离 + 面朝方向”排序。
- `roads: Map<segmentIndex, RoadView>`：40m 道路段，比区块范围略宽。

每帧构建预算：

- 已开始探索：2 个区块 / 1 个道路段；
- 开始界面：4 个区块 / 2 个道路段。

超出半径 + 边距的区块会立即移出场景并释放本区块独有的 GPU 资源；共享几何体与共享材质不释放。

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
4. 大地图每次打开采样 512×512 ≈ 26 万个点，按 12ms 分片生成；参数在 `config/ui.ts`。
5. 所有静态植被与动物都走 InstancedMesh；不要为每棵树 / 每只动物单独建 Mesh。
6. 动物不做持久化和玩家碰撞，离开距离直接销毁并重新随机生成。
7. Three.js 单独分包，业务改动不会让浏览器重新下载引擎。

## 9. 大地图

`ui/BigMap.ts` 在打开时做一次静态快照，范围固定为玩家中心 ±1500m：

- **范围**：3000m × 3000m，等于小地图的 10 倍长宽；
- **底图**：`TerrainColoring.sampleMapColor` 采样到 512×512 的 `ImageData`，每片 12ms，用 `setTimeout` 让出主线程；
- **覆盖层**：世界坐标对齐的 500m 网格、沿 `roadX(z)` 采样的道路、中心玩家箭头、1km 比例尺、N 指北；
- **暂停语义**：打开地图时 `Game` 退出 Pointer Lock、禁用输入并停止模拟；关闭时恢复输入并重新请求 Pointer Lock；
- **状态**：`bigMapGeneration` token 负责取消被关闭或重新打开的上一次生成。

调参入口在 `config/ui.ts`：`BIG_MAP_RANGE_METERS`、`BIG_MAP_TEXTURE_SIZE`、`BIG_MAP_FRAME_BUDGET_MS`、`BIG_MAP_GRID_METERS`。

## 10. 房屋与野生动物

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
| 鸟 | 12 | body + 左右翼，3 个 InstancedMesh | 空中盘旋、振翅、缓慢转向 |
| 鱼 | 10 | 1 个 InstancedMesh | 只在水面下，随机游动 |
| 兔子 | 8 | 1 个 InstancedMesh | 停走 + 蹦跳，玩家靠近逃跑 |
| 蛇 | 5 | 1 个 InstancedMesh | 低伏蛇行 + 侧向摆动，受惊加速 |
| 牛 | 4 | 1 个 InstancedMesh | 只生成在平坦开阔地，长时间吃草 |
| 鹿 | 4 | 1 个 InstancedMesh | 开阔林地，警觉范围大，快速逃跑 |

生成点由 `wildlife/spawn.ts` 在玩家周围采样：陆地动物检查水面与坡度，鱼检查水深，鸟只看高度。动物不记录路径：

- 距玩家超过各物种的 `despawnRadius` 后直接从数组移除；
- 数量不足时按 `spawnInterval` 在玩家周围重新生成新的个体；
- 通过 `config/wildlife.ts` 统一调整速度、停走时长、逃跑半径、数量与距离。

调试接口 `window.__wild.wildlifePopulation()` 和 `window.__wild.wildlifeSightings()` 可查看当前数量与位置。
