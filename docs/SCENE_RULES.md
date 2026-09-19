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
