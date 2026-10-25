# 无尽山野（Endless Wild）

一个用 **TypeScript + Three.js + Vite** 重写的无限程序化探索小游戏。向前走，世界会在你脚下生成：森林、河流、湖泊、山坡与雪山，昼夜交替，沿路还有路灯、桥与固定房屋；飞鸟、游鱼、兔子、蛇、牛、鹿会在周围活动。按 `M` 可以打开 3km 范围大地图。

原始版本是根目录下单个 `index.html`（744 行、全部逻辑内联）。本仓库把它拆分成了可维护、可测试、可构建的现代前端工程；原文件完整保留在 [`legacy/index.original.html`](legacy/index.original.html) 作为对照。

![游戏画面](docs/preview.png)

夜间会自动点亮路灯、浮现星空：

![夜间画面](docs/night-preview.png)

## 技术栈

- **TypeScript 5.6（strict）**：`noUnusedLocals`、`noUnusedParameters`、`verbatimModuleSyntax` 全开。
- **Vite 5.4**：本地 dev / 生产 build / preview。
- **Three.js 0.186.1**：升级到当前最新版，配合 `@types/three@0.186.0`；新版要求 WebGL 2，启动时会做能力检测。
- **Vitest 2.1**：纯逻辑单元测试。
- 无前端框架，HUD 与触摸控件全部是原生 DOM + CSS。

## 快速开始

要求 Node.js >= 20（开发时使用 Node 24）。

```bash
# 安装依赖（推荐 pnpm；项目内含 pnpm-lock.yaml）
pnpm install

# 本地开发，热更新
pnpm dev
# → http://127.0.0.1:5173/

# 类型检查 + 生产构建
pnpm build

# 本地预览构建产物
pnpm preview
# → http://127.0.0.1:4173/

# 只做类型检查 / 运行单元测试
pnpm typecheck
pnpm test
```

使用 npm 也可以：

```bash
npm install
npm run dev
npm run build
npm run preview
```

> 本机全局 npm 源仍是已停用的旧 taobao 源（证书过期），因此项目内 `.npmrc` 固定使用官方源。pnpm 11 默认禁止依赖执行安装脚本，`pnpm-workspace.yaml` 已显式允许 `esbuild` 的 postinstall。

## 操作

| 输入 | 行为 |
| --- | --- |
| `W A S D` / 方向键 | 前后左右移动 |
| 点击画面 / 鼠标 | 锁定视角环顾；也支持按住拖拽 |
| `Shift` | 奔跑 |
| `空格` | 跳跃 |
| `F` | 沿道路自动前进 |
| `-` / `=` | 减速 / 加速移动（预设档位） |
| `T` | 加速时间流逝 |
| `V` | 切换第一 / 第三人称 |
| `M` / 点击小地图 | 打开 / 关闭 3km 大地图 |
| `Esc` | 关闭大地图 / 释放鼠标 |
| 触屏 | 左下摇杆移动、右侧按钮跳跃、空白处拖动视角 |

### 速度系统

- 倍率范围为 **0.5×–7×**，同时缩放水平移动速度（走路 / 奔跑 / 游泳）与跳跃初速，重力保持不变；
- `-` / `=` 在预设档位 **0.5× / 1× / 1.5× / 2× / 3× / 4× / 5× / 6× / 7×** 间切换；
- 底部操作栏的滑杆可在范围内连续微调，右侧实时显示当前倍率；
- 自动前进的转向速率也随倍率提高，避免高速时在弯道切出路面；
- 调试接口：`window.__wild.getSpeed()` / `window.__wild.setSpeed(2)`。

## 大地图

按 `M` 或点击右上角小地图，可以打开以玩家为中心的大地图：

- 显示范围 **3.0 km × 3.0 km**，正好是当前小地图（300m）的 **10 倍长宽 / 100 倍面积**
- 北向上，包含道路、地形色、湖泊河流、500m 网格、1km 比例尺和玩家朝向
- 打开时冻结游戏模拟，避免看地图时角色继续移动
- 地形在打开时按行分片生成（512×512，每片约 12ms），带进度提示，不阻塞输入

![大地图](docs/bigmap.png)

## 房屋与野生动物

- **房屋是固定景物**：由 `seed + 区块坐标` 确定性生成，选址要求房屋周围 16m 内基本平坦、干燥，不能压在水面或道路上；离开再回来仍是同一栋房子，并带碰撞。
- **动物按合理地形生成**：
  - 鸟：空中盘旋、振翅、缓慢转向；
  - 鱼：只生成在水里，在水面下游动；
  - 兔子：走走停停、短距离蹦跳，玩家靠近会快速逃走；
  - 蛇：低伏蛇行，受惊后加速；
  - 牛：只选平坦开阔地，长时间吃草、慢慢移动；
  - 鹿：开阔林地活动，警觉范围更大、逃得更快。
- **性能优先**：鸟只用 3 个 `InstancedMesh`（身体 + 左右翼），鱼和每种地面动物各 1 个；动物不记录行走路径、不做玩家碰撞，走离玩家一定距离直接销毁，回来重新在合理地点随机生成。

![固定房屋](docs/house.png)

![草地上的牛](docs/wildlife.png)

## 目录结构

```
.
├─ index.html                     # 仅保留 DOM 骨架，逻辑从 src/main.ts 进入
├─ public/favicon.svg
├─ src/
│  ├─ main.ts                     # 启动入口与顶层错误兜底
│  ├─ app/
│  │  └─ Game.ts                  # 依赖装配、主循环顺序、UI 状态同步
│  ├─ core/
│  │  ├─ GameLoop.ts              # requestAnimationFrame 循环 + 长帧限幅
│  │  └─ dom.ts                   # 必需的 DOM 元素 / 2D 上下文获取
│  ├─ config/                     # 所有可调参数集中在这里
│  │  ├─ world.ts                 # 区块、道路、种子
│  │  ├─ terrain.ts               # 山地、丘陵、河流、湖泊的振幅 / 频率 / 阈值
│  │  ├─ wildlife.ts              # 动物数量、速度、停走、逃跑与销毁距离
│  │  ├─ render.ts                # 相机、雾、天空、水、云
│  │  ├─ player.ts                # 移动、跳跃、相机跟随
│  │  ├─ input.ts                 # 鼠标 / 触摸灵敏度
│  │  ├─ ui.ts                    # HUD / 小地图 / 大地图参数
│  │  └─ daynight.ts              # 昼夜速度
│  ├─ math/                       # 无框架依赖的纯函数
│  │  ├─ random.ts                # xorshift32 + 区块哈希
│  │  ├─ noise.ts                 # 可复现二维 simplex 噪声
│  │  ├─ scalar.ts                # clamp / lerp / smoothstep
│  │  └─ angle.ts
│  ├─ world/                      # 世界模型与网格生成
│  │  ├─ World.ts                 # 世界采样门面
│  │  ├─ NoiseFields.ts           # 9 层噪声的固定创建顺序
│  │  ├─ TerrainSurface.ts        # 山地、湖泊、河流、森林场
│  │  ├─ RoadTrack.ts             # 道路中心线 / 路面高度 / 桥判定
│  │  ├─ TerrainColoring.ts       # 顶点色与小地图配色
│  │  ├─ Biomes.ts
│  │  ├─ seed.ts                  # URL / localStorage / 随机种子
│  │  ├─ spawn.ts                 # 沿道路寻找干燥、开阔、平缓的出生点
│  │  ├─ landmarks/Houses.ts      # 固定房屋的选址与低模几何
│  │  ├─ WorldMaterials.ts        # 共享材质
│  │  ├─ assets/                  # 植被、道路设施的低模几何体
│  │  └─ streaming/
│  │     ├─ ChunkMeshBuilder.ts   # 地形顶点位移 + 顶点色 + 植被
│  │     ├─ VegetationScatter.ts  # 区块内确定性撒点
│  │     ├─ RoadMeshBuilder.ts    # 弯曲路面、桥、栏杆、路灯
│  │     ├─ WorldStreamer.ts      # 区块 / 道路段的加载与卸载
│  │     └─ types.ts
│  ├─ render/                     # 与玩法无关的渲染基础设施
│  │  ├─ Viewport.ts              # Renderer / Scene / Camera
│  │  ├─ instancing.ts            # InstancedMesh 批量提交
│  │  ├─ geometry/                # 几何体合并、顶点色烘焙
│  │  ├─ textures/roadTexture.ts  # Canvas 生成的土路贴图
│  │  └─ environment/             # 光照、天空、星空、水、云、昼夜快照
│  ├─ systems/
│  │  └─ DayNightCycle.ts         # 时刻推进 → 光照快照
│  ├─ player/                     # 玩家领域
│  │  ├─ Player.ts                # 纯数值物理与状态
│  │  ├─ Hero.ts                  # 第三人称角色与走路动画
│  │  └─ CameraRig.ts             # 第一 / 第三人称相机
│  ├─ input/                      # 键盘、鼠标、触摸 → 统一输入
│  │  ├─ Keyboard.ts
│  │  ├─ PointerLook.ts
│  │  ├─ TouchControls.ts
│  │  ├─ InputManager.ts
│  │  ├─ pointerLock.ts
│  │  └─ types.ts
│  ├─ ui/                         # DOM HUD
│  │  ├─ Hud.ts
│  │  ├─ Minimap.ts
│  │  ├─ BigMap.ts                # 3km 大地图：分片采样 + 道路/网格/标记
│  │  ├─ StartScreen.ts
│  │  ├─ Toolbar.ts
│  │  ├─ SpeedControl.ts           # 速度倍率：档位按钮 + 滑杆
│  │  └─ format.ts
│  ├─ styles/                     # 按职责拆分的 CSS
│  │  ├─ base.css
│  │  ├─ hud.css
│  │  ├─ controls.css
│  │  ├─ overlays.css
│  │  ├─ touch.css
│  │  ├─ bigmap.css
│  │  ├─ responsive.css
│  │  └─ main.css                 # 只做 @import 汇总
│  └─ types/global.d.ts           # window.__wild 调试接口
├─ tests/                         # Vitest 单元测试
│  ├─ math/
│  ├─ ui/
│  └─ world/
├─ docs/ARCHITECTURE.md           # 分层、主循环、确定性约定、扩展指南
├─ legacy/index.original.html     # 原始单文件版本（仅作参考，不参与构建）
├─ vite.config.ts
├─ vitest.config.ts
└─ tsconfig.json
```

## 架构概览

整体是“**纯逻辑内核 + 渲染适配层 + 应用编排层**”的结构：

```text
app/Game.ts
   ├─ 输入  input/  ───────────────┐
   ├─ 玩法  player/ + systems/     │ 每帧输入 → 物理 → 世界流式加载
   ├─ 世界  world/ ── render/      │ → 相机 → 环境 → UI → render
   ├─ 表现  render/ environment/   │
   └─ 界面  ui/ + styles/ ─────────┘
```

- `World`、`Player` 等核心对象不依赖 DOM，便于单测与替换。
- 渲染对象只消费世界数据，不反向修改世界。
- 所有“魔法数字”收敛到 `src/config/`；地形与水体参数在 `src/config/terrain.ts`。
- 河湖使用“低频大特征 + 较高阈值”控制：单个水体更大，但总量和道路穿越次数更少。
- 世界生成由种子唯一决定；区块卸载再加载不会改变内容。
- 共享几何体 / 材质只在 `Game` 生命周期内创建一次，区块销毁时只释放本区块独有的资源。

更详细的主循环顺序、随机数消耗约定和扩展步骤见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 种子与调试

- URL `?seed=123456` 优先，其次 `localStorage` 的 `wild-seed`，最后随机。
- 点击“新世界”会生成新种子并刷新页面。
- 控制台可直接使用：

```js
window.__wild.player          // 玩家状态
window.__wild.world.height    // 世界高度采样
window.__wild.height(x, z)
window.__wild.chunks.size     // 当前已加载区块数
window.__wild.roads.size
window.__wild.camera
window.__wild.setAuto(true)   // 自动前进
window.__wild.getSpeed()      // 当前移动速度倍率
window.__wild.setSpeed(2)     // 设为 2 倍速
window.__wild.getHour()       // 当前时刻
window.__wild.setHour(21)     // 直接调到夜间，方便截图/调光
window.__wild.wildlifePopulation()  // 各类动物当前数量
window.__wild.wildlifeSightings()   // 各类动物当前位置，便于调试
```

`window.__wild` 保留了原始版本的调试入口，方便对比和二次开发。

## 构建与部署

`pnpm build` 会先执行 `tsc --noEmit`，再由 Vite 输出到 `dist/`。`vite.config.ts` 里使用 `base: './'`，因此构建产物可以部署在任意子路径，例如 GitHub Pages、对象存储或现有静态站点目录。

产物结构：

```text
dist/
├─ index.html
├─ favicon.svg
└─ assets/
   ├─ index-*.js        # 业务代码
   ├─ three-*.js        # Three.js 单独分块，便于长期缓存
   ├─ index-*.css
   └─ *.map
```

## 测试

`tests/` 覆盖了与视觉无关但最容易回归的部分：

- 随机数与噪声的可复现性；
- `smoothstep` 的反向边界；
- 世界高度 / 道路贴合的有限性与确定性；
- 河湖占比、道路穿越次数、坡度分布与缓坡占比；
- 出生点是否干燥、开阔、平缓；
- 大地图范围是否确为小地图的 10 倍长宽；
- 固定房屋是否确定性生成、周围平坦且避开水面；
- 种子优先级与回退；
- 昼夜光照与路灯 / 星空；
- HUD 时刻、罗盘格式化。

```bash
pnpm test
```

## 已知边界

- 需要支持 **WebGL 2** 的浏览器（Three.js r163+ 已移除 WebGL 1 支持）；不支持时页面会显示明确的加载失败提示。
- Pointer Lock 需要用户手势，点击“开始探索”或画面后才会生效；部分移动端浏览器不提供。
- 世界生成在主线程同步执行，每帧有构建预算控制；极低端设备上首次进入仍可能有短暂卡顿。
