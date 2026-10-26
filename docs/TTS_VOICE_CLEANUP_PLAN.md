# 台词朗读：人声净化、响度统一与 BGM 让位计划

状态：未实施（2026-10-26 定稿）。基于 v0.37.22。

## 背景

用户反馈：部分 TTS 模型的输出带轻微回音或沙沙底噪；BGM、环境音与人声的配比不稳。目前接口来源的人声链只有 增益 → 听筒带通 / 声像 → 贴耳·隔墙滤镜 → 总线（`app/src/visual/igs-ui/voice-bark.js` `buildBarkChain`，约 409 行），没有任何清理；不同模型、不同声音的响度差别很大；朗读时场景声压到 55%（`tts.js` `TTS_DUCK_RATIO`），读完 300 ms 回升（`scene-audio.js` `UNDUCK_MS`），句与句之间 BGM 一起一伏。

## 范围

只处理**接口来源**的朗读音频（有解码后的 AudioBuffer）。系统语音（speechSynthesis）拿不到音频数据，不在本计划内。语气音（voice-bark）不改。

## 1. 人声净化开关

- 新设置 `readerSettings.tts.cleanup`，布尔，默认 `true`。放在朗读设置「高级」折叠里（`settings-host-render.js` `renderTtsControls` 的高级分组），文案「人声净化」，副说明一句：「减弱底噪与混响拖尾」。在 `normalizeTtsSettings`（`tts.js` 约 196 行）里规范化。
- 开关作用于下面 2、3 两项；第 4 项响度统一不受开关影响，始终开启。

## 2. 去底噪（滤波，实时节点）

在 `buildBarkChain` 里，当 plan 带 `cleanup: true` 且非听筒（`phone` 为假）时，在增益之后插入：

- 高通 `highpass` 80 Hz，Q 0.7：去掉低频嗡声。
- 高架 `highshelf` 7500 Hz，-4 dB：压嘶声、沙沙声。

`decideTts` 返回的 plan 增加 `cleanup` 字段（取自设置）。听筒模式本来就有带通，不重复插。参数写成常量放在 voice-bark.js 顶部常量区，不内联魔法数。

## 3. 减轻混响拖尾（离线处理解码后的样本）

模型自带的混响无法真正去除，只做**向下扩展（downward expander）**压低字间与句尾的弱信号，残响和底噪会明显变弱：

- 位置：`tts.js` 约 1590 行 `const decoded = requests.map(...)`，在 `decodeAudioData` 得到 buffer 之后、交给 `play` 之前处理（参照 `voice-bark.js` `stretchSamples` 约 330 行的离线处理写法，新 buffer 用 `context.createBuffer` 生成，每个声道分别处理）。
- 算法：10 ms 窗计算包络（RMS），对每个样本求增益：
  - 包络高于阈值：增益 1；
  - 低于阈值：按比例 1:2 向下扩展，最低压到 -18 dB，不做硬门限（防止字尾被切断）；
  - 阈值取整段音频 RMS 峰值以下 30 dB（自适应，不同模型输出电平不同）；
  - 增益曲线用 attack 5 ms / release 80 ms 平滑，避免咔哒与呼吸感。
- 导出纯函数 `cleanupSamples(samples, sampleRate, options)`，便于在 node 测试里直接喂 Float32Array。
- 缓存的是接口原始字节（`apiCache` / Cache Storage），处理在解码后进行，开关切换无需清缓存。

## 4. 响度统一（离线，始终开启）

- 同在第 3 项的位置：计算整段（去掉静音段后）的 RMS，换算成增益使其接近目标 -20 dBFS RMS；增益限制在 0.5–2.5 倍，并按样本峰值保证不超过 -1 dBFS（峰值限制优先）。
- 增益直接乘进样本（或作为额外 GainNode 放在 `buildBarkChain` 增益前，二选一，推荐乘进样本以免影响试听路径）。
- 分段请求（`requestSegments`）时，同一句的各段使用**第一段算出的增益**，避免段与段之间音量跳变。
- 用户设置的总音量、角色音量、心里话比例仍在此之后相乘，语义不变。

## 5. BGM 让位保持

- 读完后场景声继续保持压低约 800 ms 再回升，连续朗读时不再一起一伏。
- 实现：`tts.js` `finish`（约 866 行）里 `job.releaseDuck()` 改为延迟 800 ms 调用；新一句开始时（`duckSceneAudio` 再次被调用）旧的释放照常进行，嵌套计数由 `scene-audio.js` 的 `duckRatios` 保证，不会出现提前回升。
- 取消/停止朗读（关阅读器、`stopTts`）时立即释放，不等 800 ms。
- 常量 `TTS_DUCK_HOLD_MS = 800` 放在 `TTS_DUCK_RATIO` 旁。

## 测试（定向，不跑全量）

在 `app/tests/tts.test.js` 补行为用例：

1. `cleanupSamples`：构造「1 kHz 正弦 0.5 s + -40 dB 噪声 0.5 s」，处理后噪声段 RMS 至少下降 10 dB，正弦段 RMS 变化 < 1 dB。
2. 响度统一：两段电平相差 12 dB 的输入，处理后 RMS 差 < 2 dB；峰值不超过 -1 dBFS。
3. `normalizeTtsSettings({}).cleanup === true`；`cleanup: false` 时 plan 不带净化、链里不插滤波节点。
4. 让位保持：用假的 `duckSceneAudio` 记录释放时间，finish 后 800 ms 内未释放；`stopTts` 立即释放。

跑：`node --test tests/tts.test.js tests/tts-standard.test.js tests/chat-layer-tts.test.js tests/audio-bus.test.js`，再 `npm.cmd run build`，确认 bundle 里能 grep 到 `cleanupSamples`。

## 约束

- 遵守仓库 CLAUDE.md：升 patch、同步 README / bootstrap / package.json / dist / loader，打 `vX.Y.Z` tag。
- 文件行尾 LF（Edit 后 `sed -i 's/\r$//'`）。
- 设置文案书面、简短；不写内联样式。
- 处理在主线程，一句台词通常 < 10 s 音频，计算量可接受；若单段超过 30 s，跳过第 3 项只做第 4 项。
- 真实酒馆与手机未验收时在 README 写明。
