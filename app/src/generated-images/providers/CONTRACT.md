# generated-images/providers 模块契约

## 职责

- 存放内置生图 provider 适配器。
- 为外部 provider Mod 提供参考实现。
- 将不同 provider 的响应归一化为统一生成结果。
- `st-chatu8-provider.js` 和 `chami-provider.js` 是内置可拆卸 provider 的默认落点。

## Provider 契约

- `detect(context)`
- `generate(request)`
- `poll(task)`
- `extractImages(messageContext)`

## 禁止

- 禁止 provider 直接写入视觉层。
- 禁止 provider 直接持久化大图；图片持久化交给 `media`。
- 禁止默认联网；只有用户导入并启用相关 provider 后才可请求外部服务。
- 禁止关闭 provider 后继续扫描对应 DOM。
