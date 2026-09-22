const BASIC_TAB_TEMPLATE = `
<div class="igs-settings-grid">
  {{openModeField}}
  <div class="igs-settings-section">{{settingsToggles}}</div>
</div>
`.trim();

const REGEX_TAB_TEMPLATE = `
<div class="igs-settings-grid">
  <div class="igs-source-filter">
    <div>
      <div class="igs-source-filter-title">标签解析</div>
      <div class="igs-source-filter-note">先筛出 IGS 正文和图片来源；严格解析未命中时阅读器仍会使用兜底文本打开。</div>
    </div>
    <div class="igs-settings-row">{{filterToggles}}</div>
    <div class="igs-settings-row">{{untaggedToggle}}</div>
    <div class="igs-source-filter-grid">
      {{textIncludeField}}
      {{textExcludeField}}
      <div class="igs-settings-full">{{imageIncludeField}}</div>
    </div>
  </div>
  <div class="igs-source-filter igs-body-format">
    <div>
      <div class="igs-source-filter-title">正文格式化</div>
      <div class="igs-source-filter-note">对标签解析后的正文执行正则替换；不修改酒馆楼层原文。</div>
    </div>
    <div class="igs-settings-row">{{regexToggle}}</div>
    <div class="igs-source-filter-grid">
      {{regexPatternField}}
      {{regexFlagsField}}
      <div class="igs-settings-full">{{regexReplacementField}}</div>
    </div>
    <div class="igs-settings-row">
      <button class="igs-settings-action" data-action="reset-virtual-regex" type="button">恢复默认正文替换</button>
      <button class="igs-settings-action" data-action="test-virtual-regex" type="button">测试当前楼层</button>
    </div>
    <div class="igs-settings-preview" data-result="virtual-regex">{{regexPreview}}</div>
  </div>
</div>
`.trim();

const IMAGE_TAB_TEMPLATE = `
<div class="igs-settings-grid">
  {{imageModeField}}
  {{adapterField}}
  <div class="{{apiGroupClass}}">
    {{endpointField}}
    {{apiKeyField}}
    {{modelField}}
    {{sizeField}}
    {{stepsField}}
    {{samplerField}}
    {{timeoutField}}
    {{pollIntervalField}}
    {{pollAttemptsField}}
    {{promptPrefixField}}
  </div>
  <div class="igs-settings-full">
    <div class="igs-settings-result" data-result="image-models">{{imageModelsMessage}}</div>
  </div>
  <div class="igs-settings-full">
    <button class="igs-settings-action" data-action="test-image">{{imageTestActionLabel}}</button>
    <div class="igs-settings-result" data-result="image">{{imageTestHelp}}</div>
  </div>
</div>
`.trim();

const READER_TAB_TEMPLATE = `
<div class="igs-reader-settings">
  <div class="igs-reader-subtabs" role="tablist" aria-label="阅读器设置分类">{{readerSubTabs}}</div>
  <div class="igs-reader-subpane">{{readerSubPane}}</div>
</div>
`.trim();

const READER_DISPLAY_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="display">
  {{fontSizeField}}
  {{dialogWidthField}}
  {{dialogHeightField}}
  {{glassOpacityField}}
  {{imageCountField}}
  {{inputScaleField}}
  {{imgModeField}}
  {{imgBrightnessField}}
  <div class="igs-settings-section igs-settings-full">{{readerToggles}}</div>
  {{nsfwVeilLevelField}}
  {{statusHudSection}}
</div>
`.trim();

const READER_OPTIONS_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="options">
  <div class="igs-source-filter igs-settings-full">
    <div>
      <div class="igs-source-filter-title">选项气泡</div>
      <div class="igs-source-filter-note">在最后一页点击对话框空白处显示选项（取自数据库「选项 / 选项表 / 行动选项 / 检定建议表」表的文本列），再点空白处隐藏。需安装数据库插件。</div>
    </div>
    <div class="igs-source-filter-grid">
      {{optionFontSizeField}}
      <div class="igs-settings-section">{{optionBubbleToggle}}{{optionBubbleWidthToggle}}</div>
    </div>
    <div class="igs-settings-row">{{optionBubblePositionField}}{{optionBubbleActionField}}</div>
  </div>
</div>
`.trim();

const READER_TOOLBAR_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="toolbar">
  {{toolbarScaleField}}
  {{toolbarDockField}}
  <div class="igs-settings-section igs-settings-full">{{pinnedButtonsField}}</div>
</div>
`.trim();

const READER_THEME_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="theme">
  <div class="igs-source-filter igs-settings-full">
    <div class="igs-source-filter-grid">
      {{dialogSkinField}}
      {{classicDialogWidthPercentField}}
    </div>
  </div>
  <div class="{{themeGroupClass}}">
    <div>
      <div class="igs-source-filter-title">对话主题</div>
      <div class="igs-source-filter-note">{{themeNote}}</div>
    </div>
    <div class="{{themeAdvancedClass}}" style="display:flex;flex-direction:column;gap:12px">
      <div class="igs-source-filter">
        <div class="igs-source-filter-title">角色名</div>
        <div class="igs-settings-row">{{nameFontField}}{{nameColorField}}{{nameAlignField}}</div>
      </div>
      <div class="igs-source-filter">
        <div class="igs-source-filter-title">台词</div>
        <div class="igs-settings-row">{{textFontField}}{{textColorField}}{{textAlignField}}</div>
      </div>
      <div class="igs-source-filter">
        <div class="igs-source-filter-title">旁白</div>
        <div class="igs-settings-row">{{narrationFontField}}{{narrationColorField}}{{narrationAlignField}}</div>
      </div>
      <div class="igs-source-filter">
        <div class="igs-source-filter-title">心里话</div>
        <div class="igs-settings-row">{{thoughtFontField}}{{thoughtColorField}}{{thoughtAlignField}}</div>
      </div>
      <div class="igs-source-filter">
        <div class="igs-source-filter-title">分隔线</div>
        <div class="igs-settings-row">{{dividerField}}{{dividerColorField}}</div>
      </div>
      <div class="igs-source-filter">
        <div class="igs-source-filter-title">对话框背景</div>
        <div class="igs-settings-row">{{dialogBgField}}{{dialogBgOpacityField}}{{glassOpacityField}}</div>
      </div>
    </div>
  </div>
</div>
`.trim();

const SCENE_TAB_TEMPLATE = `
<div class="igs-scene-settings">
  <div class="igs-settings-section">{{sceneToggle}}</div>
  <div class="igs-scene-settings-subtabs" role="tablist" aria-label="场景设置分类">{{sceneSettingsSubTabs}}</div>
  <div class="igs-scene-settings-subpane">{{sceneSettingsSubPane}}</div>
</div>
`.trim();

const SCENE_RULES_TEMPLATE = `
<div class="igs-settings-grid" data-scene-settings-pane="rules">
  <div class="{{sceneGroupClass}}">
    <div class="igs-source-filter igs-settings-full">
      <div>
        <div class="igs-source-filter-title">格式规则注入</div>
        <div class="igs-source-filter-note">开启后将通过酒馆 API 向 AI 注入以下系统提示，让 AI 输出 [igs-scene:] 等标签。</div>
      </div>
      {{promptRuleField}}
      <div class="igs-settings-row">
        <button class="igs-settings-action" data-action="reset-prompt-rule" type="button">恢复默认提示词</button>
        <button class="igs-settings-action" data-action="save-prompt-rule" type="button">保存提示词</button>
      </div>
      <div class="igs-settings-result" data-result="prompt-rule">{{promptRuleStatus}}</div>
    </div>
  </div>
</div>
`.trim();

const SCENE_ASSETS_TEMPLATE = `
<div class="igs-settings-grid" data-scene-settings-pane="assets">
  <div class="{{sceneGroupClass}}">
    <div class="igs-source-filter igs-settings-full">
      <div>
        <div class="igs-source-filter-title">场景素材</div>
        <div class="igs-source-filter-note">使用 [igs-scene:场景|时间|天气|可选标签] 切换场景，第四栏填写 NSFW 时隐藏人物视觉并启用暗角柔焦帷幕；[igs-char:角色|情绪|对白] 标记对白，[igs-thought:角色|情绪|心里话] 标记心理描写。扫描图优先显示。</div>
      </div>
      {{scenePresetBar}}
      {{sceneSubTabs}}
      {{sceneSubPane}}
    </div>
  </div>
</div>
`.trim();

export const SCENE_SETTINGS_SUBTAB_DEFS = Object.freeze([
    ['rules', '规则'],
    ['assets', '素材'],
]);

export const READER_SUBTAB_DEFS = Object.freeze([
    ['display', '显示'],
    ['options', '选项'],
    ['toolbar', '工具栏'],
    ['theme', '主题'],
]);

export const SETTINGS_TAB_DEFS = Object.freeze([
    ['basic', '基础'],
    ['regex', '正文替换'],
    ['image', '图像'],
    ['scene', '场景'],
    ['reader', '阅读器'],
]);

export function normalizeSceneSettingsSubTab(subTab) {
    const normalized = String(subTab || 'rules').trim();
    return SCENE_SETTINGS_SUBTAB_DEFS.some(([id]) => id === normalized) ? normalized : 'rules';
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

export function normalizeReaderSubTab(subTab) {
    const normalized = String(subTab || 'display').trim();
    return READER_SUBTAB_DEFS.some(([id]) => id === normalized) ? normalized : 'display';
}

export function getReaderSubTabTemplate(subTab) {
    switch (normalizeReaderSubTab(subTab)) {
        case 'options':
            return READER_OPTIONS_TEMPLATE;
        case 'toolbar':
            return READER_TOOLBAR_TEMPLATE;
        case 'theme':
            return READER_THEME_TEMPLATE;
        case 'display':
        default:
            return READER_DISPLAY_TEMPLATE;
    }
}

export function getSettingsTabTemplate(tab) {
    switch (tab) {
        case 'basic':
            return BASIC_TAB_TEMPLATE;
        case 'regex':
            return REGEX_TAB_TEMPLATE;
        case 'image':
            return IMAGE_TAB_TEMPLATE;
        case 'scene':
            return SCENE_TAB_TEMPLATE;
        case 'reader':
            return READER_TAB_TEMPLATE;
        default:
            return BASIC_TAB_TEMPLATE;
    }
}
