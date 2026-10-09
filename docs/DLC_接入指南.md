# IGS DLC 接入指南：对话框皮肤与演出标签

本指南写给想给 IGS（沉浸式 Galgame 系统）做扩展包的作者。你写一段独立的酒馆助手脚本，就能：

- 加一套**对话框皮肤**：出现在「设置 › 阅读器 › 对话框风格」下拉和开场「世界风格」页。
- 加一个**演出标签** `[igs-fx:dlc-xxx]`：AI 写进正文后，阅读器翻到那一页时播放你的动画；设置页有它的开关，开着时 IGS 会把你写的用法说明告诉 AI。

不需要改 IGS 仓库，也不需要构建。接口版本号是 `IGS.api.version`（当前为 `1`），以后只增不减。

完整可运行的示例：[dlc-sample/sakura-dlc.js](dlc-sample/sakura-dlc.js)（一套樱花皮肤加两个花瓣演出）。建议先把它贴进酒馆助手跑起来，再照着改。

---

## 1. 最小骨架

```js
(function () {
  'use strict';
  // IGS 挂在酒馆主窗口上；酒馆助手脚本跑在自己的 iframe 里，所以要用 parent。
  const host = (() => { try { if (window.parent && window.parent.document) return window.parent; } catch (_) {} return window; })();

  function setup(IGS) {
    if ((IGS.api.version || 0) < 1) return console.warn('IGS 版本太旧，没有 DLC 接口');
    IGS.api.uiSkins.register({ /* 皮肤，见第 2 节 */ });
    IGS.api.stageFx.register({ /* 演出，见第 3 节 */ });
  }

  // 排进队列：IGS 还没启动时等它启动后执行；已经启动则立即执行。先装后装都可以。
  (host.IGS_DLC = host.IGS_DLC || []).push(setup);

  // 脚本被关掉或页面刷新时注销自己。
  window.addEventListener('pagehide', () => {
    const api = host.IGS && host.IGS.api;
    if (api) { api.uiSkins.unregister('dlc-你的皮肤'); api.stageFx.unregister('dlc-你的演出'); }
  });
})();
```

- 阅读器已经打开时登记也会立刻生效，不用刷新。
- `register` 返回 `{ ok, warnings }`。字段写错时，IGS 会在浏览器控制台打印 `[IGS DLC] …` 警告：错的那一项被忽略，其余照常生效。**开发时请打开 F12 控制台**。

### 命名规则

- 皮肤的 `id`、演出的 `kind` 都**必须以 `dlc-` 开头**，只用小写字母、数字和连字符，最长 44 个字符。例如 `dlc-sakura`、`dlc-petals`。
- 演出的 `kind` 不能以 `-end` 结尾，`-end` 留给区间标签收尾用。
- 同名再次登记会覆盖旧的定义。DLC 只能新增，不能改内置皮肤和内置演出。

---

## 2. 对话框皮肤 `IGS.api.uiSkins`

```js
IGS.api.uiSkins.register({
  id: 'dlc-sakura',
  label: '樱花信笺',
  base: 'illustrated',
  inherit: 'cute-pink',
  worldviews: ['modern'],
  accent: '#e88aa8',
  sfx: 'paper',
  frame: { /* 三片素材框，见 2.2 */ },
  typography: { /* 字体与颜色，见 2.3 */ },
  css: `/* 额外样式，见 2.4 */`,
});
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | `dlc-` 开头，见上文命名规则。用户的选择按这个 id 存档。 |
| `label` | 是 | 显示名，最多 20 字。下拉里显示为「樱花信笺 · DLC」。 |
| `base` | 否 | `illustrated`：固定高度的插画框，和「植物咖啡」「超可爱粉」等内置皮肤一样，支持高度缩放、自适应高度和手机端缩小姓名牌。`glass`：沿用「磨砂玻璃」的布局，只换样式。给了 `frame` 时默认是 `illustrated`，否则默认是 `glass`。 |
| `inherit` | 否 | 周边样式向哪套内置皮肤借，见 2.1。默认：插画类借 `day-minimal`，玻璃类借 `default`。 |
| `worldviews` | 否 | 出现在哪些世界观的推荐皮肤里（开场「世界风格」页）。可选值：`modern` 现代、`ancient` 古代、`fantasy` 西幻、`scifi` 科幻、`apocalypse` 末日、`taisho` 大正、`magic` 魔法、`horror` 恐怖。不填时只出现在「其他」里。 |
| `accent` | 否 | 主色。用于开场主界面的横线和选中态，同时作为 `ctx.accent` 传给演出。 |
| `sfx` | 否 | 界面音效的音色家族：`glass` `paper` `wood` `metal` `soft` `digital` `dread`。不填时跟随 `inherit` 那套。 |
| `frame` | 否 | 三片素材框，见 2.2。不给的话，框的外观全靠你自己的 `css`。 |
| `typography` | 否 | 姓名牌和正文的字体、颜色，见 2.3。 |
| `css` | 否 | 额外 CSS，见 2.4。 |

### 2.1 周边样式借用（`inherit`）

一套完整的皮肤除了对话框，还要配好十几处跟随皮肤变化的界面：选项气泡、状态栏和情绪标签、提示弹窗、物品获得卡片、战斗演出、过场标题卡、点击等待标记、文字特效主色、漫画符号配色、聊天层配色、界面音效。

你不用逐个去写，用 `inherit` 指定一套风格接近的内置皮肤即可，IGS 会把那套的这些样式复制一份，作用到你的皮肤上。你自己的 `css` 排在借来的样式**之后**，想改哪处直接覆盖就行。

另外，右上角工具栏的颜色和底板是从你的对话框实际底色、字色算出来的，不需要专门配。

可以借的内置皮肤：

| id | 名称 | id | 名称 |
|---|---|---|---|
| `gradient-veil` | 渐变黑幕 | `warm-picturebook` | 温暖绘本 |
| `default` | 磨砂玻璃 | `fairy-tale` | 童话小镇 |
| `western-classic` | 西欧古典 | `day-minimal` | 日间简约 |
| `elegant-european` | 优雅欧式 | `black-white-manga` | 黑白漫画 |
| `magic-academy` | 魔法星夜 | `cute-pink` | 超可爱粉 |
| `retro-japanese` | 复古日式 | `scifi-holo` | 全息投影 |
| `qinglv-shanshui` | 青绿山水 | `wasteland-rust` | 废土锈铁 |
| `adventure-journey` | 冒险旅途 | `horror-gore` | 血色噩梦 |
| `plant-coffee` | 植物咖啡 | `horror-psych` | 褪色病历 |

只借周边样式，不借对话框本体，所以不会出现两套几何叠在一起的情况。

### 2.2 三片素材框（`frame`）

这是最省事的做法：准备一张横向的对话框图和一张姓名牌图，两端是不能拉伸的花纹，中间是可以横向拉伸的纯色。IGS 会生成整套骨架：

- 高度和正文安全区；
- 姓名牌的位置；
- 高度缩放，以及开启自适应高度时两端跟着等比缩小；
- 手机窄屏下姓名牌缩到 82%；
- 素材加载失败时的兜底。

```js
frame: {
  height: 200,                         // 对话框显示高度（px），60–480
  image: 'https://cdn.jsdelivr.net/gh/你/仓库@v1.0.0/dialog.png',
  slice: [120, 120],                   // 素材里左、右两端花纹的原始像素宽度
  left: 120, right: 120,               // 显示时两端的宽度（一般与 slice 相同；素材是 2 倍图就填一半）
  text: { top: 34, speakerTop: 42, right: 60, bottom: 30, left: 60 },  // 正文安全区内边距；speakerTop = 有姓名时的上边距
  plate: {
    image: 'https://…/name.png',
    slice: [40, 40], left: 40, right: 40,   // 同上，姓名牌两端
    height: 50, lineHeight: 50,             // 姓名牌高度与行高
    x: 40,                                  // 离对话框左边的距离
    rise: 26,                               // 高出对话框上沿的距离
    padding: '0 34px', minWidth: 140,
  },
},
```

**怎么量尺寸**：把素材放进任意看图软件，量出两端花纹到可拉伸区域的像素宽度，填进 `slice`。素材的高度就是 `height`，除非你要缩放显示。正文安全区用来让文字避开花纹。

- 图片地址只接受 `https:`、`data:`、`blob:`。推荐把素材放在 GitHub 仓库，用 jsDelivr 的链接：`https://cdn.jsdelivr.net/gh/用户名/仓库@标签/路径.png`，带上版本标签可以避开缓存。
- 素材 4 秒内加载不出来时，对话框会自动换成纯色兜底，保证文字可读。
- `frame` 里任何一项不合格，整个 `frame` 都会被忽略，皮肤退回 `glass`，控制台会说明是哪一项。

### 2.3 字体与颜色（`typography`）

```js
typography: {
  nameFont: '"ZCOOL KuaiLe","Microsoft YaHei",sans-serif',  // 姓名牌
  textFont: '…', thoughtFont: '…', narrationFont: '…',      // 正文 / 心里话 / 旁白
  nameColor: '#ffffff', textColor: '#5d3a4a', thoughtColor: '#c65f86', narrationColor: '#8a6a78',
  nameAlign: 'center',                                      // left / center / right
}
```

- **姓名牌**是皮肤的成套设计：始终使用你给的字体、颜色和对齐，不跟随用户在主题页自选的文字。
- **正文**的字体和颜色是默认值，用户在主题页改过的设置会优先。
- 没给的项沿用 `inherit` 那套的排版。
- 字体要能在用户电脑上找到：写常见字体作为后备，或者在 `css` 里写 `@font-face`，地址同样只接受 https。

### 2.4 额外 CSS（`css`）

每一条选择器都**必须**以下面两种之一开头：

```css
#igs-overlay[data-igs-dialog-skin="dlc-sakura"] …
.igs-dialog[data-igs-dialog-skin="dlc-sakura"] …
```

- 支持 `@media`、`@supports`、`@container`，各一层。
- `@keyframes` 的名字必须以 `dlc-` 开头。
- 不合格的规则整条丢弃，控制台会说明原因：选择器越界、碰到 `body` / `html` / `.mes`、使用 `@import`、图片不是 https / data / blob。

**可以用的 DOM 结构**（都在 `#igs-overlay` 里面）：

| 选择器 | 是什么 |
|---|---|
| `#igs-overlay` | 阅读器根节点，皮肤 id 写在它的 `data-igs-dialog-skin` 上 |
| `.igs-dialog`（`#igs-dialog`） | 对话框本体 |
| `.igs-dialog[data-igs-has-speaker="1"]` | 有说话人时 |
| `.igs-dialog[data-igs-narration="1"]` | 旁白页 |
| `.igs-dialog[data-igs-text-type="thought"]` | 心里话页（另有 `dialogue` / `narration` / `system`） |
| `.igs-speaker`（`#igs-speaker`） | 姓名牌 |
| `.igs-text`（`#igs-text`） | 正文 |
| `#igs-dialog-bar` | 对话框底部的快捷按钮栏 |
| `.igs-option-bubble` | 选项气泡 |
| `#igs-status-hud`、`.igs-hud-emotion` | 左上状态栏、情绪标签 |
| `#igs-toast` | 提示弹窗 |
| `#igs-ctrl-bar` | 右上角工具栏 |
| `#igs-overlay[data-igs-skin-fallback]` | 素材加载失败、用了兜底时 |

**常用 CSS 变量**（写在 `#igs-overlay[data-igs-dialog-skin="你的id"]{…}` 里）：

| 变量 | 作用 |
|---|---|
| `--igs-cw-color` | 点击等待标记的颜色 |
| `--igs-tfx-accent`、`--igs-tfx-glow` | 文字特效（`{效果:文字}`）的主色与光晕 |
| `--igs-dlc-accent` | 你给的 `accent`，IGS 自动写入，自己的 CSS 里可以直接用 |

---

## 3. 演出标签 `IGS.api.stageFx`

```js
IGS.api.stageFx.register({
  kind: 'dlc-petals',
  label: '樱花飘落',
  mode: 'instant',
  layer: 'front',
  lifeMs: 2600,
  prompt: '浪漫、告白或离别的瞬间，在那句正文前写 [igs-fx:dlc-petals]',
  css: `.dlc-petal{…} @keyframes dlc-petal-fall{…}`,
  play(ctx) { /* 见 3.2 */ },
});
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `kind` | 是 | `dlc-` 开头，即标签名。 |
| `label` | 是 | 设置页开关的名字，最多 20 字。 |
| `play(ctx)` | 是 | 播放函数，见 3.2。 |
| `mode` | 否 | `instant`（默认）：一次性，播放 `lifeMs` 后 IGS 自动收掉。`range`：区间常驻，从开始标签那一页起，到 `-end` 标签那一页为止。 |
| `layer` | 否 | `front`（默认）：对话框之上。`stage`：对话框之下、立绘之上。 |
| `lifeMs` | 否 | 瞬时演出的时长，200–15000 毫秒，默认 2400。 |
| `prompt` | 否 | 告诉 AI 什么时候用，最多 200 字。不写的话，AI 不知道有这个标签，只能靠你自己在预设或世界书里教它。 |
| `css` | 否 | 演出样式。选择器必须以 `.dlc-` 开头，可以带 `#igs-overlay ` 前缀；`@keyframes` 的名字以 `dlc-` 开头。 |

### 3.1 标签写法

```text
[igs-fx:dlc-petals]                 瞬时，无参数
[igs-fx:dlc-petals|多|快]            瞬时，带参数（最多 6 个，用 | 分隔）
[igs-fx:dlc-sakura-wind|浓]          区间开始
……这几段正文期间一直在播……
[igs-fx:dlc-sakura-wind-end]         区间结束
```

- 标签写在它作用的那句正文**之前**，翻到那一页时播放。
- 每页最多播放 3 个不同的 DLC 瞬时演出；同一个演出在一页里只播一次，同一页重绘不会重播。
- 没登记的、写错的标签会被静默剥掉，不会显示在正文里。
- 区间标签没写 `-end` 时，一直持续到这一楼结束。

### 3.2 `play(ctx)`

| 字段 | 说明 |
|---|---|
| `ctx.doc` | 酒馆主页面的 `document`，用它来 `createElement`，不要用你脚本 iframe 里的 document。 |
| `ctx.layer` | 演出层节点（`#igs-fx-front` 或 `#igs-fx-stage`）。 |
| `ctx.spawn(el, ms?)` | **推荐**：把节点挂到演出层，并交给 IGS 管理。给了 `ms` 就到时移除；不给就跟随这次播放一起收掉。 |
| `ctx.args` | 标签里的参数数组，例如 `['多', '快']`。 |
| `ctx.reduced` | 用户开了「减少动态」时为 `true`。请跳过或换成静态版本。 |
| `ctx.signal` | `AbortSignal`。翻页、离开区间或关闭阅读器时会触发 abort，用来停掉你自己的定时器和监听。 |
| `ctx.kind`、`ctx.mode`、`ctx.pageKey` | 当前标签名、模式、页面键。 |
| `ctx.skin`、`ctx.worldview` | 当前对话框皮肤 id、世界观 id，可以按皮肤换配色。 |
| `ctx.accent` | 当前皮肤的主色：DLC 皮肤取它的 `accent`，否则取对话主题里最鲜艳的颜色。 |

`play` 可以返回一个清理函数，IGS 收掉这次播放时会调用它。

**IGS 帮你做的**：

- 瞬时演出到期、翻页、离开区间、关闭阅读器时，统一调用清理函数，移除 `spawn` 挂上的节点，并触发 `signal`。
- 用户打开设置面板等情况下舞台会暂停，演出层里的 CSS 动画随之暂停。
- `play` 抛错时，IGS 接住错误，在控制台打印警告，并在本次会话里停用这个演出，阅读器照常翻页。

**你要注意的**：

- 用 CSS 动画实现，不要用 `setInterval` 逐帧改样式：CSS 动画省电，而且能跟着舞台一起暂停。
- 自己写的 JS 定时器不会跟着暂停。用了的话，请在 `ctx.signal` 触发 abort 时清掉。
- 节点数量适度：一次几十个以内，手机上也流畅。
- 动画结束后让节点保持透明或移出画面，不要停在画面中间挡住文字。

### 3.3 设置与提示词

- 设置 › 演出 › 事件演出里会多出一行「扩展演出（DLC）」，每个已登记的演出一个开关，默认开启。用户关掉的演出会存档，你的 DLC 下次加载时依然是关着的。
- 开着、并且写了 `prompt` 的演出，会并入发给 AI 的演出说明，标签的语法提示由 IGS 补上。`prompt` 只需要写**什么时候用**，写得具体一些效果更好，比如「告白或离别的瞬间」。

---

## 4. 发布你的 DLC

1. 素材放进 GitHub 仓库，打一个版本标签，例如 `v1.0.0`，然后用 `https://cdn.jsdelivr.net/gh/用户名/仓库@v1.0.0/文件` 引用。
2. 把脚本做成酒馆助手的导入件（`.json`），格式与 IGS 自己的 loader 相同：
   ```json
   { "type": "script", "enabled": true, "name": "樱花信笺 DLC v1.0.0", "id": "dlc-sakura-v1.0.0", "content": "（整段脚本，按 JSON 转义）" }
   ```
3. 用户导入后，在酒馆助手里启用，就能在对话框风格里看到你的皮肤。

**用户没装你的 DLC 时**：存档里的 `dlc-sakura` 原样保留，对话框临时显示为磨砂玻璃，下拉里显示「dlc-sakura（DLC 未加载）」。装回来后自动恢复，用户不用重新选择。

## 5. 排查清单

| 现象 | 看哪里 |
|---|---|
| 下拉里没有我的皮肤 | 控制台有没有 `[IGS DLC]` 报错；`id` 是否以 `dlc-` 开头；脚本里是不是用了 `window.parent` 的 `IGS_DLC`。 |
| 皮肤选上了，但长得像磨砂玻璃 | `frame` 被整体忽略了（控制台会说明是哪一项），或者 `css` 的选择器没带你的 id。 |
| 姓名牌字体不对 | 用户电脑上没有这个字体。补后备字体，或用 `@font-face`。 |
| 标签显示在了正文里 | 不会出现这种情况：不认识的 `[igs-fx:…]` 一律被剥掉。如果演出没播，检查 `kind` 是否已登记、设置里的开关是否开着。 |
| 演出只播第一次 | 同一页重绘不会重播，翻到下一页带同样的标签才会再播。 |
| 关掉脚本后报错 | 在 `pagehide` 里调用 `unregister`，参照第 1 节的骨架。 |

在浏览器控制台查看 IGS 当前登记了什么：

```js
IGS.api.version;
IGS.api.uiSkins.list();
IGS.api.stageFx.list();
```
