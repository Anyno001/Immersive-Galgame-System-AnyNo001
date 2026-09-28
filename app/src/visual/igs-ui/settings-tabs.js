const BASIC_TAB_TEMPLATE = `
<div class="igs-settings-grid">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">通用</div>
    {{openModeField}}
    <div class="igs-settings-row">{{settingsToggles}}</div>
  </div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">标签解析</div>
    {{filterToggle}}
    <div class="igs-settings-sub"{{filterHidden}}>
      <div class="igs-settings-section">{{filterOptionToggles}}</div>
      <div class="igs-source-filter-grid">
        {{textIncludeField}}
        {{textExcludeField}}
        <div class="igs-settings-full">{{imageIncludeField}}</div>
        <div class="igs-settings-full">{{htmlCardField}}</div>
      </div>
    </div>
  </div>
  <div class="igs-source-filter igs-body-format">
    <div class="igs-source-filter-title">正文格式化</div>
    {{regexToggle}}
    <div class="igs-settings-sub"{{regexHidden}}>
      <div class="igs-source-filter-grid">
        {{regexPatternField}}
        {{regexFlagsField}}
        <div class="igs-settings-full">{{regexReplacementField}}</div>
      </div>
      <div class="igs-settings-row">
        <button class="igs-settings-action" data-action="reset-virtual-regex" type="button">恢复默认</button>
        <button class="igs-settings-action" data-action="test-virtual-regex" type="button">测试当前楼层</button>
      </div>
      <div class="igs-settings-preview" data-result="virtual-regex">{{regexPreview}}</div>
    </div>
  </div>
</div>
`.trim();

const IMAGE_TAB_TEMPLATE = `
<div class="igs-image-settings">
  <div class="igs-image-subtabs" role="tablist" aria-label="生图设置分类">{{imageSubTabs}}</div>
  <div class="igs-image-subpane">{{imageSubPane}}</div>
</div>
`.trim();

const IMAGE_OTHER_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="other">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">图像来源</div>
    {{imageModeField}}
    <div class="igs-settings-sub"{{extensionHidden}}>{{adapterField}}</div>
    <div class="{{apiGroupClass}}"{{apiHidden}}>
      {{endpointField}}{{apiKeyField}}
      <div class="igs-settings-full">{{modelField}}</div>
      {{sizeField}}{{stepsField}}{{samplerField}}{{timeoutField}}
      {{pollIntervalField}}{{pollAttemptsField}}
      <div class="igs-settings-full">{{promptPrefixField}}</div>
      <div class="igs-settings-result igs-settings-full" data-result="image-models">{{imageModelsMessage}}</div>
    </div>
    <div class="igs-settings-row"><button class="igs-settings-action" data-action="test-image" type="button">{{imageTestActionLabel}}</button></div>
    <div class="igs-settings-result" data-result="image">{{imageTestHelp}}</div>
  </div>
</div>
`.trim();

const IMAGE_LOGS_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="logs">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">生图日志</div>
    <div class="igs-source-filter-note">记录自动插图与素材补全每一步的进度和失败原因（副 LLM 请求、NAI 请求、跳过原因）。</div>
    <div class="igs-source-filter-grid">{{imageLogRetainDaysField}}{{imageLogMaxEntriesField}}</div>
    <div class="igs-settings-row">
      <button class="igs-settings-action" data-action="image-log-refresh" type="button">刷新</button>
      <button class="igs-settings-action" data-action="image-log-copy" type="button">复制全部</button>
      <button class="igs-settings-action" data-action="image-log-clear" type="button">清空日志</button>
    </div>
    <div class="igs-settings-result" data-result="image-log">{{imageLogStatus}}</div>
    <div class="igs-image-log-list" data-image-log-list>{{imageLogList}}</div>
  </div>
</div>
`.trim();

const IMAGE_AUTO_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="auto">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">自动插图</div>
    {{autoNsfwField}}
    <div class="igs-settings-sub" data-image-feature="nsfw"{{autoNsfwHidden}}>
      <div class="igs-source-filter-grid">{{autoNsfwCountField}}</div>
    </div>
    {{autoInterludeField}}
    <div class="igs-settings-sub" data-image-feature="interlude"{{autoInterludeHidden}}>
      <div class="igs-source-filter-grid">{{autoInterludeProbabilityField}}{{autoInterludeMaxField}}</div>
    </div>
  </div>
  <div class="igs-source-filter" data-image-feature="assets">
    <div class="igs-source-filter-title">素材补全（需开启场景素材模式）</div>
    <div class="igs-source-filter-grid">
      {{autoAssetSpriteField}}{{autoAssetBackgroundField}}
      {{autoAssetStrictField}}{{autoAssetMaxField}}
      {{autoAssetSpriteSizeField}}{{autoAssetBackgroundSizeField}}
    </div>
    <div class="igs-settings-sub">
      <div class="igs-settings-full">{{autoAssetBackgroundTemplateField}}</div>
      <div class="igs-settings-full">{{autoAssetBackgroundNegativeTemplateField}}</div>
      <div class="igs-settings-full">{{autoAssetSpriteTemplateField}}</div>
      <div class="igs-settings-full">{{autoAssetSpriteNegativeTemplateField}}</div>
      <div class="igs-settings-full">{{autoAssetNsfwExtraField}}</div>
    </div>
  </div>
  <div class="igs-source-filter" data-image-feature="llm"{{autoSharedHidden}}>
    <div class="igs-source-filter-title">副 LLM · 生成标签</div>
    <div class="igs-source-filter-grid">
      {{autoLlmSourceField}}{{autoLlmContextField}}
    </div>
    <div class="igs-settings-sub"{{autoLlmApiHidden}}>
      <div class="igs-source-filter-grid">
        {{autoLlmEndpointField}}{{autoLlmKeyField}}
        {{autoLlmModelField}}
      </div>
    </div>
    <details class="igs-settings-sub" data-image-feature="llm-prompts"{{autoLlmPromptsOpen}}>
      <summary>副 LLM 提示词（系统提示词，清空即恢复内置）</summary>
      <div class="igs-settings-full">{{autoLlmPromptIllustrationField}}</div>
      <div class="igs-settings-full">{{autoLlmPromptIllustrationSoftField}}</div>
      <div class="igs-settings-full">{{autoLlmPromptAssetField}}</div>
      <div class="igs-settings-full">{{autoLlmPromptAssetSoftField}}</div>
    </details>
  </div>
  <div class="igs-source-filter" data-image-feature="nai"{{autoSharedHidden}}>
    <div class="igs-source-filter-title">NovelAI · 生成图片</div>
    <div class="igs-source-filter-grid">
      {{autoNaiTransportField}}{{autoNaiKeyField}}
      {{autoNaiModelField}}{{autoNaiSizeField}}
      {{autoNaiStepsField}}{{autoNaiScaleField}}
      {{autoNaiSamplerField}}
      <div class="igs-settings-full">{{autoNaiArtistField}}</div>
      <div class="igs-settings-full">{{autoNaiNegativeField}}</div>
    </div>
  </div>
</div>
`.trim();

const READER_TAB_TEMPLATE = `
<div class="igs-reader-settings">
  <div class="igs-reader-subtabs" role="tablist" aria-label="阅读器设置分类">{{readerSubTabs}}</div>
  <div class="igs-reader-subpane">{{readerSubPane}}</div>
</div>
`.trim();

const READER_DIALOG_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="dialog">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">风格</div>
    {{dialogSkinField}}
    {{gradientVeilFields}}
    <div class="igs-settings-row">{{statusLineToggle}}</div>
  </div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">尺寸</div>
    <div class="igs-source-filter-grid">
      {{dialogWidthField}}
      {{classicDialogWidthPercentField}}
      {{skinDialogScaleField}}
      {{dialogHeightField}}
      {{inputScaleField}}
    </div>
  </div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">背景</div>
    <div class="igs-source-filter-grid">
      {{glassOpacityField}}
      {{dialogBgOpacityField}}
      {{dialogBgField}}
    </div>
    <div class="igs-settings-row">{{backdropFilterToggle}}</div>
  </div>
</div>
`.trim();

const READER_TEXT_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="text">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">排版</div>
    <div class="igs-source-filter-grid">
      {{fontSizeField}}
      {{dialogFontWeightField}}
    </div>
  </div>
  <div class="igs-source-filter igs-text-style">
    <div class="igs-source-filter-title">文字样式</div>
    <div class="igs-source-filter-note"{{themeNoteHidden}}>开启「场景」素材模式后可自定义</div>
    <div class="igs-settings-group"{{themeHidden}}><div class="igs-settings-subhead">角色名</div><div class="igs-settings-row">{{nameFontField}}{{nameColorField}}{{nameAlignField}}</div></div>
    <div class="igs-settings-group"{{themeHidden}}><div class="igs-settings-subhead">台词</div><div class="igs-settings-row">{{textFontField}}{{textColorField}}{{textAlignField}}</div></div>
    <div class="igs-settings-group"{{themeHidden}}><div class="igs-settings-subhead">旁白</div><div class="igs-settings-row">{{narrationFontField}}{{narrationColorField}}{{narrationAlignField}}</div></div>
    <div class="igs-settings-group"{{themeHidden}}><div class="igs-settings-subhead">心里话</div><div class="igs-settings-row">{{thoughtFontField}}{{thoughtColorField}}{{thoughtAlignField}}</div></div>
    <div class="igs-settings-group"{{themeHidden}}><div class="igs-settings-subhead">系统角色</div>{{systemRoleFields}}</div>
    <div class="igs-settings-group"{{dividerHidden}}><div class="igs-settings-subhead">分隔线</div><div class="igs-settings-row">{{dividerField}}{{dividerColorField}}</div></div>
  </div>
</div>
`.trim();

const READER_PERFORMANCE_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="performance">
  <div class="igs-source-filter"><div class="igs-source-filter-title">打字机</div>{{typewriterToggle}}{{typewriterControls}}</div>
  <div class="igs-source-filter"><div class="igs-source-filter-title">震动</div>{{stageShakeToggle}}{{stageShakeSettings}}</div>
  <div class="igs-source-filter"><div class="igs-source-filter-title">线上交流</div>{{chatShowToggle}}{{chatShowSettings}}</div>
  <div class="igs-source-filter"><div class="igs-source-filter-title">天气</div>{{weatherFxToggle}}{{weatherFxSettings}}</div>
  <div class="igs-source-filter"><div class="igs-source-filter-title">场景演出</div><div class="igs-settings-section">{{performanceToggles}}</div>{{nsfwVeilLevelField}}</div>
</div>
`.trim();

const READER_INTERFACE_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="interface">
  <div class="igs-source-filter"><div class="igs-source-filter-title">背景图</div><div class="igs-source-filter-grid">{{imgModeField}}{{imgBrightnessField}}{{imageCountField}}</div></div>
  <div class="igs-source-filter"><div class="igs-source-filter-title">状态栏</div>{{statusHudSection}}</div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">选项气泡</div>
    {{optionBubbleToggle}}
    <div class="igs-settings-sub"{{optionBubbleHidden}}>
      <div class="igs-source-filter-grid">{{optionFontSizeField}}{{optionBubbleWidthToggle}}</div>
      {{optionBubblePositionField}}
      {{optionBubbleActionField}}
    </div>
  </div>
  <div class="igs-source-filter"><div class="igs-source-filter-title">工具栏</div><div class="igs-source-filter-grid">{{toolbarScaleField}}{{toolbarDockField}}</div>{{pinnedButtonsField}}</div>
</div>
`.trim();

const SCENE_TAB_TEMPLATE = `
<div class="igs-scene-settings">
  <div class="igs-settings-row">{{sceneToggle}}</div>
  <div class="igs-scene-settings-content"{{sceneHidden}}>
    <div class="igs-scene-settings-subtabs" role="tablist" aria-label="场景设置分类">{{sceneSettingsSubTabs}}</div>
    <div class="igs-scene-settings-subpane">{{sceneSettingsSubPane}}</div>
  </div>
</div>
`.trim();

const SCENE_RULES_TEMPLATE = `
<div class="igs-settings-grid" data-scene-settings-pane="rules">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">格式规则注入</div>
    {{promptRuleField}}
    <div class="igs-settings-row">
      <button class="igs-settings-action" data-action="reset-prompt-rule" type="button">恢复默认提示词</button>
      <button class="igs-settings-action" data-action="save-prompt-rule" type="button">保存提示词</button>
    </div>
    <div class="igs-settings-result" data-result="prompt-rule">{{promptRuleStatus}}</div>
  </div>
</div>
`.trim();

const SCENE_ASSETS_TEMPLATE = `
<div class="igs-settings-grid" data-scene-settings-pane="assets">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">预设</div>
    {{scenePresetBar}}
  </div>
  <div class="igs-source-filter">
    {{sceneSubTabs}}
    {{sceneSubPane}}
  </div>
</div>
`.trim();

export const SCENE_SETTINGS_SUBTAB_DEFS = Object.freeze([
    ['assets', '素材'],
    ['rules', '规则'],
]);

export const SCENE_SUBTAB_DEFS = Object.freeze([
    ['scenes', '场景素材'],
    ['characters', '角色立绘'],
    ['generated', '生成素材'],
]);

export const IMAGE_SUBTAB_DEFS = Object.freeze([
    ['auto', '自动插图'],
    ['other', '其他生图'],
    ['logs', '日志'],
]);

export const READER_SUBTAB_DEFS = Object.freeze([
    ['dialog', '对话框'],
    ['text', '文字'],
    ['performance', '演出'],
    ['interface', '界面'],
]);

export const SETTINGS_TAB_DEFS = Object.freeze([
    ['basic', '基础'],
    ['reader', '阅读器'],
    ['scene', '场景'],
    ['image', '生图'],
]);

export const SETTINGS_TAB_ALIASES = Object.freeze({
    regex: 'basic',
});

export function normalizeSceneSettingsSubTab(subTab) {
    const normalized = String(subTab || 'assets').trim();
    return SCENE_SETTINGS_SUBTAB_DEFS.some(([id]) => id === normalized) ? normalized : 'assets';
}

export function normalizeSceneSubTab(subTab) {
    const normalized = String(subTab || 'scenes').trim();
    return SCENE_SUBTAB_DEFS.some(([id]) => id === normalized) ? normalized : 'scenes';
}

export function getSceneSettingsSubTabTemplate(subTab) {
    switch (normalizeSceneSettingsSubTab(subTab)) {
        case 'assets':
            return SCENE_ASSETS_TEMPLATE;
        case 'rules':
        default:
            return SCENE_RULES_TEMPLATE;
    }
}

const READER_SUBTAB_ALIASES = Object.freeze({
    display: 'dialog',
    theme: 'text',
    toolbar: 'interface',
    visual: 'interface',
    options: 'interface',
});

export function normalizeReaderSubTab(subTab) {
    const raw = String(subTab || 'dialog').trim();
    const normalized = READER_SUBTAB_ALIASES[raw] || raw;
    return READER_SUBTAB_DEFS.some(([id]) => id === normalized) ? normalized : 'dialog';
}

export function getReaderSubTabTemplate(subTab) {
    switch (normalizeReaderSubTab(subTab)) {
        case 'text':
            return READER_TEXT_TEMPLATE;
        case 'performance':
            return READER_PERFORMANCE_TEMPLATE;
        case 'interface':
            return READER_INTERFACE_TEMPLATE;
        case 'dialog':
        default:
            return READER_DIALOG_TEMPLATE;
    }
}

export function normalizeImageSubTab(subTab) {
    return IMAGE_SUBTAB_DEFS.some(([id]) => id === subTab) ? subTab : 'auto';
}

export function getImageSubTabTemplate(subTab) {
    const id = normalizeImageSubTab(subTab);
    if (id === 'other') return IMAGE_OTHER_TEMPLATE;
    if (id === 'logs') return IMAGE_LOGS_TEMPLATE;
    return IMAGE_AUTO_TEMPLATE;
}

export function getSettingsTabTemplate(tab) {
    switch (SETTINGS_TAB_ALIASES[tab] || tab) {
        case 'image':
            return IMAGE_TAB_TEMPLATE;
        case 'scene':
            return SCENE_TAB_TEMPLATE;
        case 'reader':
            return READER_TAB_TEMPLATE;
        case 'basic':
        default:
            return BASIC_TAB_TEMPLATE;
    }
}
