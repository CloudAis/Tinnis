# Tinnis · 沿线小镇

一条地方铁路，三座慢慢生长的小镇。日式微缩景观三维铁路经营游戏，当前完成 **第 1 阶段：工程初始化与基础场景**。

## 启动

需要 Node.js 24+（本环境 24.19.0 / npm 11.9.0），支持 WebGL2 的浏览器。

```sh
cd /workspace/Tinnis
npm ci
npm run dev
```

开发服务器监听 `0.0.0.0:5173`。在其他电脑克隆时，进入对应仓库目录即可。`.nvmrc` 固定本阶段运行版本；`.npmrc` 将 npm 缓存放在仓库内的忽略目录，避免云环境主目录不可写。

## 当前可以做什么

- 观察汐港、青溪、枫泉与海岸、河流、山谷、稻田和温泉。所有模型程序化生成，资源无需联网获取。
- 旋转、平移、缩放、全景复位；点击 A/B/D 候选站位或聚落卡片，查看站位资料并定位。A/B 初期可建，B 预留两个会让泊位，D 第 7 阶段解锁。此阶段不含正式建造、列车、客流或收入。
- 暂停、继续、1/2/4 倍时间；查看日期时间和初始资金 100000。
- 每 15 秒自动保存；通过右上角「存档」手动保存、读取、导入和导出 JSON。保存地图标识、相机、时钟、资金、聚落等级和选择状态。存档位于当前浏览器/站点的 localStorage，清理浏览器数据前请导出备份。

| 操作 | 电脑 | 触屏 |
| --- | --- | --- |
| 旋转 | 左键拖动 | 一指拖动 |
| 平移 | 右键拖动 | 双指拖动 |
| 缩放 | 滚轮 / 右侧 ＋ − | 双指捏合 / ＋ − |
| 选择/取消 | 点击候选站；Esc 或空地取消 | 点击候选站；点击空地取消 |
| 暂停 | Space / 底栏按钮 | 底栏按钮 |
| 全景 | Home / 右侧房屋按钮 | 右侧房屋按钮 |

相机有俯角、距离和平移边界。切到后台时冻结模拟，不补算后台时间；严重卡顿时限制追赶步数。资金入口按稳定事件 ID 幂等记账，本阶段不会产生运营费用。

## 验证

```sh
npm run check        # TypeScript
npm test             # 7 组规则/存档测试
npm run build        # 类型检查 + dist 发行包
npm run test:e2e     # 先 build；自动启动独立预览服务，实际运行 Chromium
npm audit            # 依赖安全检查
```

浏览器脚本默认使用 `/usr/bin/chromium`；其他系统可设置 `CHROMIUM_PATH`。它执行桌面操作、真双指输入、保存重载、JSON 导入导出和断网重载，共 9 组检查，并自动清理测试浏览器/预览进程。截图、下载存档和性能报告输出到忽略目录 `artifacts/`。附加 `?diagnostics=1` 可通过 `window.__ALONGLINE__.snapshot()` 获取只读状态/绘制诊断；正常界面不显示调试数据。

## 离线发行

```sh
npm run build
npm run preview       # 预览 dist，默认端口 4173
# 或使用本地已有的静态服务器，不需要 Node 依赖：
python3 -m http.server 8080 --directory dist
```

整个 `dist/` 即离线发行目录，可以复制或压缩分发。请通过静态 HTTP 服务打开，不使用 `file://`。Three.js、脚本、样式和图标均随包分发，无 CDN、远程字体或运行时 API。生产版首次成功访问后用 service worker 缓存完整发行资源，支持离线重载；service worker 需要 HTTPS 或 localhost。开发模式不注册缓存，避免影响热更新。

## 结构与后续开发

```text
src/config.ts          集中可调参数
src/world/             地图、稳定 ID、确定性种子、世界状态
src/simulation/        固定步长时钟、幂等资金入口
src/render/            复用模型、静态批处理、景观、相机与选择
src/ui/                原生 DOM 交互、响应式布局
src/storage/           schema v1 存档校验与序列化
tests/                 规则测试、实际 Chromium 验收
```

约定见 [AGENTS.md](AGENTS.md)，完整规格和十阶段计划见 [PLAN.md](PLAN.md)，实际完成项、验证证据、性能边界和下一阶段入口见 [PROGRESS.md](PROGRESS.md)。
