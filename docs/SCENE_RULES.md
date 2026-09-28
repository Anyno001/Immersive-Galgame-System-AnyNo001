# 场景规则草案

场景规则负责把正文、shujuku 数据和上一轮状态解析为当前视觉状态。

## 正文时空栏正则

用户可配置正则预设，例如：

```json
{
  "format": "igs_preset_v1",
  "type": "scene-regex-preset",
  "name": "时空栏解析",
  "data": {
    "location": "<地点>([\\s\\S]*?)</地点>",
    "time": "<时间>([\\s\\S]*?)</时间>",
    "weather": "<天气>([\\s\\S]*?)</天气>",
    "speaker": "^([^：:]+)[：:]",
    "emotion": "<情绪>([\\s\\S]*?)</情绪>"
  }
}
```

## 背景规则

```json
{
  "id": "school-night-rain",
  "match": {
    "location": ["学校", "教室"],
    "time": ["夜晚"],
    "weather": ["雨"]
  },
  "background": "indexeddb://igs-assets/background/school_night_rain.webp",
  "priority": 100
}
```

背景场景可配置多个别名。指令中的场景名先匹配主名称，再匹配该场景的别名；命中后继续使用同一套背景、时间和天气子层，不创建重复场景。

## 角色规则

```json
{
  "character": "玉子",
  "emotion": "害羞",
  "sprite": "indexeddb://igs-assets/tamako/blush.webp",
  "avatar": "indexeddb://igs-assets/tamako/avatar-blush.webp",
  "position": "right"
}
```

角色可配置多个别名，例如主名称「爱丽丝」添加别名「爱丽」。`[igs-char:爱丽|平和|…]` 与 `[igs-char:爱丽丝|平和|…]` 共用同一套情绪立绘。别名命中后，立绘位置仍使用主名称「爱丽丝」的 `spriteLayouts` 键，不产生第二套位置数据。

场景预设必须一并保存和恢复角色别名；旧预设缺少别名字段时按空映射处理。

## 生图切换

- 检测到生图段：切换到生图层。
- 生图段消失：回到背景+立绘。
- `生图+头像` 开启时：生图作为背景，当前说话人显示头像。

## 视觉模式

- `off`：关闭视觉层，仅保留文本流程。
- `text-only`：不显示背景/立绘，只显示对话 UI。
- `default-background`：未命中规则时显示默认背景。
- `background-character`：背景 + 立绘分层展示。
- `generated-only`：检测到生图段时只显示生图层。
- `generated-first`：优先生图，生图段消失后回到背景 + 立绘。
- `generated-with-avatar`：生图层开启时用头像显示当前说话人。
- `mixed-overlay`：生图作为背景，立绘继续保留。

## 数据优先级

场景解析优先按用户配置决定。默认建议：

1. 当前楼层显式标签或正文时空栏。
2. shujuku 表格里的时间、天气、地点和角色状态。
3. 上一轮场景状态。
4. 默认背景和默认角色立绘。

## 环境效果

- `weather` 可映射到雨、雪、雾、晴天、阴天等效果。
- `time` 可映射到白天、傍晚、夜晚 tint。
- 环境效果只影响 IGS 舞台，不修改 SillyTavern 聊天楼层正文或样式。

## 线上交流标签

```
[igs-chat:会话标题]
[igs-chat-time:昨天 22:14]
[igs-msg:发送者|消息内容]
[igs-msg:发送者|消息内容|类型]
[igs-chat-end]
```

- 类型栏可填 图片 / 语音 / 表情包 / 撤回（或 img / voice / sticker / recall），省略即文字消息；撤回的内容可留空。

- 一段聊天单独成页；「阅读器 → 演出 → 线上交流」开启时渲染为左右气泡，关闭时降级为「发送者：内容」文字页。
- 缺 `[igs-chat-end]` 时遇到 `igs-scene` / `igs-char` / `igs-thought` / `igs-img` 或楼层末自动收口；孤立的 `[igs-msg]` 隐式开启无标题会话，遇到旁白即收口；显式会话内的旁白显示为居中注释。
- 发送者属于「系统角色」词池（如 系统、【系统】）时显示为居中提示条；整段只有系统发送者时按系统角色旁白显示，不开聊天页。
- 发送者按联系人主名、联系人别名、场景预设角色别名依次归约；气泡左右只由设置决定，不由正文决定。
- 开启时聊天标签规则追加进注入提示词，不依赖场景素材开关。
