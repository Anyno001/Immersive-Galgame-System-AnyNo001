# map-gen 模块契约

程序生成地图底图。纯计算加 Canvas 绘制，不访问宿主、不读写数据库、不联网、不引入位图素材。

## 入口

- `buildMapGenInput({ chatId, tableUid, parentId, salt, parentName, points, theme?, themeTexts? })`：把地图面板已排好位置的指针（含自动排位点，0–1 归一化）转成生成输入。
  - `seed` 由 `MAP_GEN_VERSION + chatId + tableUid + parentId + salt` 哈希得出：同一对话、同一层、同一 `salt` 永远是同一张图；换对话即换城市。
  - `key` 额外覆盖地点签名（id、名称、类别、坐标）、世界观、尺度和尺寸，用作缓存键。
  - `scale` 为 `city` 或 `interior`；面板只为 `city` 生成底图，`interior`（楼层、房间）保持中性坐标平面。
- `buildMarkerLightsInput(points, width, height)`：外部底图没有生成数据时，只在指针周围点灯。
- `createMapBasemapGenerator({ doc, budgetMs, timeoutMs, cacheSize, scale, schedule, now, createCanvas })`：
  - `request(input)` 返回共享的任务条目 `{ status: pending|ready|failed, result: { url, lightsUrl, width, height }, error, promise }`；同一 `key` 不会重复开工。
  - 工作按 `budgetMs`（默认 10ms）切片、通过 `schedule` 交还宿主事件循环；超过 `timeoutMs`（默认 8s）判失败。不依赖 Worker，酒馆 CSP 下也能运行。
  - LRU 保留最近 `cacheSize`（默认 4）张，淘汰和 `dispose()` 时 `revokeObjectURL`。
- `generateCityScene(input)` / `generateCitySteps(input)`：几何生成，输出纯数据 `MapScene`，可 `JSON.stringify`：
  - 水系 `sea / rivers / lakes / ponds`；道路 `mainRoads`（`kind: arterial | link`）、`streets`、`lanes`（田间小路）、`paths`（园路）、`rails`、`bridges`；
  - 用地 `ground { cols, rows, zone[], urban[] }`（8px 一格：水、沙滩、公园、神社林、野林、城区、郊区、村落、田野），以及 `fields / parking / courts`；
  - `buildings`（`kind: house | flat`，`level` 为楼层数）、`trees`（`tone` 4 为点缀色）、`landmarks`、`cars`、`boats`、`lights`。
- 生成分层（`city.js` 只做编排）：`city-grid.js` 两级栅格（8px 标记 + 2px 占位）；`city-roads.js` 张量场与流线追踪；`city-lots.js` 沿街地块、车与船；`city-green.js` 公园、树林与行道树。
- 渲染分层：`render-canvas.js` 地面、水、道路、投影、建筑、树冠与收尾；`render-landmarks.js` 地标、球场、停车场、车船小件。
- `renderCitySteps(ctx, scene, options)` / `renderLightSteps(ctx, lights, w, h, options)`：分阶段绘制底图与夜间灯光图（黑底光斑，以 `screen` 叠加）。
- `resolveMapLighting({ time, weather, defaultHour })`：时段关键帧线性插值；支持 `HH:MM`、`下午3点` 与五档时段词；天气沿用 `weather-fx-runtime` 的类型规则。

## 保证

- 确定性：禁止 `Math.random`；每个子系统、每条道路、每个街区各用独立的 `fork(label)` 子流，新增地点只影响其附近。
- 地点优先：非水域指针不落水、连入主路网、周围留净空；水域指针（海、湖、河）塑造地形；沙滩、码头类地点落在岸上。
- 路网：主干道与街道都是同一张张量场的流线（场只由种子与水系决定），全城朝向连续、交叉近似直角；主干道可架桥跨河，但不横穿湖海；街道在河堤处停下，不伸进水面；断头路就近接成 T 字路口。
- 建筑与植被：建筑只沿街排布，精确占位（不叠压、不落水、不压堤）；城区强度决定建筑密度，郊区/村落稀疏并配院树，公园、神社林、野林与田野保证大面积绿色。公园园路从街道断点出发、按最小生成树连成弯曲小径，不画环形步道。
- 升级算法或画风时必须加 `MAP_GEN_VERSION`，让旧种子与缓存失效。

## 不做

- 不画场所尺度（校园内部）与室内平面图；不按主题替换建筑形态，只替换配色（`themes.js`）。
- 不持久化生成结果；每次打开阅读器首次生成约 0.2–1.2 秒，之后命中内存缓存。
