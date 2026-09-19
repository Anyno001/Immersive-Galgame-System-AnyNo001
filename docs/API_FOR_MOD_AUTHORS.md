# 二创作者 API 草案

Immersive Galgame System 的二创 API 面向会写 JS 的作者。Mod 默认从对应能力页导入，不提供独立总 Mod 管理页。

## 全局对象

```js
window.IGS
window.ImmersiveGalgameSystem
```

## Mod 文件

```js
export default {
  id: 'example.image-provider',
  name: '示例生图插件',
  version: '1.0.0',
  type: 'image-provider',
  permissions: ['imageProvider'],
  setup(api) {
    api.imageProviders.register({
      id: 'example-provider',
      label: 'Example Provider',
      async detect() {
        return true;
      },
      async generate(request) {
        return { url: request.prompt };
      },
    });
  },
};
```

## 能力分组

```js
IGS.api.imageProviders.register(provider);
IGS.api.imageProviders.unregister(id);
IGS.api.imageRequestBuilders.register(builder);
IGS.api.actions.register(action);
IGS.api.components.register(component);
IGS.api.choiceComponents.register(component);
IGS.api.sceneRules.register(rule);
IGS.api.themePresets.register(preset);
IGS.api.uiSkins.register(preset);
IGS.api.backgroundPacks.register(pack);
IGS.api.characterPacks.register(pack);
IGS.api.promptPresets.register(preset);
```

## 常见可扩展内容

- 生图 provider：新增或适配插图/生图插件。
- 生图 request builder：为 NAI、ComfyUI、GPT 图像、banana 等模型提供专属请求构建。
- provider 配置预设：保存选择器、轮询、优先级和按钮匹配规则。
- UI Skin：提供完整换皮 CSS、布局槽位和可被设置页控制的 `settingsSchema`。
- 可选组件：新增对话框、工具栏、状态块、画廊等 UI 组件。
- 选项组件：新增 Immersive Galgame System 选项浮窗样式和交互。
- 动作：给按钮、快捷键或组件提供可调用行为。
- 场景规则：根据正文、shujuku 数据或自定义状态切换背景、立绘和环境效果。
- 资源包：提供背景、立绘、头像和默认匹配规则。
- 提示词预设：提供生图模板、变量替换和 provider 参数映射。
- 工作流预设：提供 ComfyUI 等工作流型 provider 的可切换配置。

## 权限

默认本地 Mod 不需要联网。只有确实要访问外部服务时才声明 `network`。

危险权限：

- `sendMessage`
- `writeShujuku`
- `network`

导入时必须展示危险权限。
