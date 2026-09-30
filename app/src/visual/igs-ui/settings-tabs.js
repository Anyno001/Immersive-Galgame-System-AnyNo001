const BASIC_TAB_TEMPLATE = `
<div class="igs-settings-grid">
  {{performancePresetBar}}
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">通用</div>
    {{openModeField}}
    <div class="igs-settings-row">{{settingsToggles}}</div>
    <div class="igs-settings-row">
      <button class="igs-settings-action" data-action="settings-export-all" type="button">导出全部设置</button>
      <button class="igs-settings-action" data-action="settings-import-all" type="button">导入设置</button>
    </div>
    <div class="igs-source-filter-note">导出文件不含 API Key；导入时保留本机已填的 Key。</div>
  </div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">标签解析{{resetBasicSourceFilter}}</div>
    {{filterToggle}}
    <div class="igs-settings-sub"{{filterHidden}}>
      <div class="igs-source-filter-grid">
        {{textIncludeField}}
        {{textExcludeField}}
      </div>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="source-filter"{{advancedFilterOpen}}>
        <summary>高级：图片标签、HTML 卡片与注释处理</summary>
        <div class="igs-settings-section">{{filterOptionToggles}}</div>
        <div class="igs-source-filter-grid">
          <div class="igs-settings-full">{{imageIncludeField}}</div>
          <div class="igs-settings-full">{{htmlCardField}}</div>
        </div>
      </details>
    </div>
  </div>
  <div class="igs-source-filter igs-body-format">
    <div class="igs-source-filter-title">正文格式化</div>
    {{regexToggle}}
    <div class="igs-settings-sub"{{regexHidden}}>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="virtual-regex"{{advancedRegexOpen}}>
        <summary>高级：查找表达式与替换文本</summary>
        <div class="igs-source-filter-grid">
          {{regexPatternField}}
          {{regexFlagsField}}
          <div class="igs-settings-full">{{regexReplacementField}}</div>
        </div>
        {{regexExtraRules}}
      </details>
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

const IMAGE_SOURCE_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="source">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">图像来源</div>
    {{imageSourceField}}
    <div class="igs-source-filter-note">{{imageSourceNote}}</div>
    <div class="igs-settings-sub" data-image-source="nai"{{sourceNaiHidden}}>
      <div class="igs-source-filter-grid">
        {{autoNaiKeyField}}
        {{autoNaiModelField}}{{autoNaiSizeField}}
        <div class="igs-settings-full">{{autoNaiArtistField}}</div>
      </div>
      <div class="igs-settings-result" data-result="nai-models">{{autoNaiModelsMessage}}</div>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="nai"{{advancedNaiOpen}}>
        <summary>高级：连接方式与采样参数</summary>
        <div class="igs-source-filter-grid">
          {{autoNaiTransportField}}{{autoNaiEndpointField}}
          {{autoNaiStepsField}}{{autoNaiScaleField}}
          {{autoNaiSamplerField}}
          <div class="igs-settings-full">{{autoNaiNegativeField}}</div>
        </div>
      </details>
    </div>
    <div class="igs-settings-sub" data-image-source="extension"{{sourceExtensionHidden}}>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="extension"{{advancedExtensionOpen}}>
        <summary>高级：识别范围与等待时间</summary>
        <div class="igs-source-filter-grid">{{adapterField}}{{pollIntervalField}}{{pollAttemptsField}}</div>
      </details>
    </div>
    <div class="igs-settings-row"><button class="igs-settings-action" data-action="test-image" type="button">{{imageTestActionLabel}}</button><button class="igs-settings-action" data-action="open-dbgen-settings" type="button"{{sourceDbgenHidden}}>打开数据库生图插件设置</button></div>
    <div class="igs-settings-result" data-result="image">{{imageTestHelp}}</div>
  </div>
</div>
`.trim();

const IMAGE_LOGS_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="logs">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">生图日志</div>
    <div class="igs-source-filter-note">出图失败时，可以在这里查看原因。</div>
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
  <div class="igs-source-filter-note">{{imageContentNote}}</div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">剧情 CG</div>
    {{autoNsfwField}}
    <div class="igs-settings-sub" data-image-feature="nsfw"{{autoNsfwHidden}}>
      <div class="igs-source-filter-grid">{{autoNsfwCountField}}</div>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="nsfw"{{advancedNsfwOpen}}>
        <summary>高级：NSFW 附加提示词</summary>
        <div class="igs-settings-full">{{autoAssetNsfwExtraField}}</div>
      </details>
    </div>
    {{autoInterludeField}}
    <div class="igs-settings-sub" data-image-feature="interlude"{{autoInterludeHidden}}>
      <div class="igs-source-filter-grid">{{autoInterludeProbabilityField}}{{autoInterludeMaxField}}</div>
    </div>
  </div>
  <div class="igs-source-filter" data-image-feature="assets">
    <div class="igs-source-filter-title">素材（未登记的人物与场景）</div>
    <div class="igs-source-filter-note"{{assetSceneWarnHidden}}>需要先在「素材」页开启场景素材模式，下面的开关才会生效。</div>
    <div class="igs-source-filter-grid">{{autoAssetSpriteField}}<button type="button" class="igs-settings-action" data-action="open-character-dna" title="在素材 → 角色立绘中编辑角色 DNA">管理角色 DNA</button>{{autoAssetBackgroundField}}</div>
    <div class="igs-settings-sub" data-image-feature="asset-options"{{autoAssetOptionsHidden}}>
      <div class="igs-source-filter-grid">
        {{autoAssetMaxField}}{{autoAssetStrictField}}
        {{autoAssetSpriteSizeField}}{{autoAssetBackgroundSizeField}}
      </div>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="asset-templates"{{advancedAssetTemplatesOpen}}>
        <summary>高级：素材提示词模板</summary>
        <div class="igs-settings-full">{{autoAssetBackgroundTemplateField}}</div>
        <div class="igs-settings-full">{{autoAssetBackgroundNegativeTemplateField}}</div>
        <div class="igs-settings-full">{{autoAssetSpriteTemplateField}}</div>
        <div class="igs-settings-full">{{autoAssetSpriteNegativeTemplateField}}</div>
      </details>
    </div>
  </div>
  <div class="igs-source-filter" data-image-feature="item-images">
    <div class="igs-source-filter-title">物品图（背包与获得物品演出）</div>
    <div class="igs-source-filter-note">背包图标可选「生图」或「SVG」。</div>
    <div class="igs-source-filter-grid">{{itemImageFields}}</div>
  </div>
  <div class="igs-source-filter" data-image-feature="llm"{{autoSharedHidden}}>
    <div class="igs-source-filter-title">副 LLM · 规划画面与标签</div>
    <div class="igs-source-filter-note">{{autoLlmNote}}</div>
    <div class="igs-source-filter-grid">
      {{autoLlmSourceField}}{{autoLlmContextField}}
    </div>
    <div class="igs-settings-sub"{{autoLlmApiHidden}}>
      <div class="igs-source-filter-grid">
        {{autoLlmEndpointField}}{{autoLlmKeyField}}
        {{autoLlmModelField}}
      </div>
      <div class="igs-settings-result" data-result="llm-models">{{autoLlmModelsMessage}}</div>
    </div>
    <details class="igs-settings-sub igs-settings-advanced" data-image-feature="llm-prompts" data-advanced="llm-prompts"{{autoLlmPromptsOpen}}>
      <summary>高级：副 LLM 系统提示词（清空即恢复内置）</summary>
      <div class="igs-settings-full">{{autoLlmPromptIllustrationField}}</div>
      <div class="igs-settings-full">{{autoLlmPromptIllustrationSoftField}}</div>
      <div class="igs-settings-full">{{autoLlmPromptAssetField}}</div>
      <div class="igs-settings-full">{{autoLlmPromptAssetSoftField}}</div>
    </details>
    <details class="igs-settings-sub igs-settings-advanced" data-advanced="llm-jailbreak"{{advancedJailbreakOpen}}>
      <summary>高级：自定义附加词（头部 / 尾部）</summary>
      <div class="igs-settings-full">{{autoLlmJailbreakHeadField}}</div>
      <div class="igs-settings-full">{{autoLlmJailbreakTailField}}</div>
    </details>
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
    <div class="igs-source-filter-title">风格{{resetReaderDialogStyle}}</div>
    {{dialogSkinField}}
    {{gradientVeilFields}}
    <div class="igs-settings-row">{{statusLineToggle}}</div>
  </div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">尺寸{{resetReaderDialogSize}}</div>
    <div class="igs-source-filter-grid">
      {{dialogWidthField}}
      {{classicDialogWidthPercentField}}
      {{skinDialogScaleField}}
      {{dialogHeightField}}
    </div>
    <details class="igs-settings-sub igs-settings-advanced" data-advanced="dialog-size"{{advancedDialogSizeOpen}}>
      <summary>高级：输入框高度</summary>
      <div class="igs-source-filter-grid">{{inputScaleField}}</div>
    </details>
  </div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">背景{{resetReaderDialogBackground}}</div>
    <div class="igs-source-filter-grid">
      {{glassOpacityField}}
      {{dialogBgOpacityField}}
      {{dialogBgField}}
    </div>
    <details class="igs-settings-sub igs-settings-advanced" data-advanced="dialog-background"{{advancedDialogBackgroundOpen}}>
      <summary>高级：模糊滤镜</summary>
      <div class="igs-settings-row">{{backdropFilterToggle}}</div>
    </details>
  </div>
</div>
`.trim();

const READER_TEXT_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="text">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">排版{{resetReaderTextLayout}}</div>
    <div class="igs-source-filter-grid">
      {{fontSizeField}}
      {{dialogFontWeightField}}
    </div>
  </div>
  <div class="igs-source-filter igs-text-style">
    <div class="igs-source-filter-title">文字样式{{resetReaderTextStyle}}</div>
    <div class="igs-source-filter-note"{{themeNoteHidden}}>开启素材页的场景素材模式后可自定义</div>
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
<div class="igs-settings-grid" data-reader-pane="performance">{{performanceSections}}</div>
`.trim();

const READER_INTERFACE_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="interface">
  <div class="igs-source-filter"><div class="igs-source-filter-title">背景图{{resetReaderInterfaceBackground}}</div><div class="igs-source-filter-grid">{{imgModeField}}{{imgBrightnessField}}{{imageCountField}}</div></div>
  <div class="igs-source-filter"><div class="igs-source-filter-title">状态栏{{resetReaderInterfaceStatusHud}}</div>{{statusHudSection}}</div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">选项气泡{{resetReaderInterfaceOptionBubble}}</div>
    {{optionBubbleToggle}}
    <div class="igs-settings-sub"{{optionBubbleHidden}}>
      <div class="igs-source-filter-grid">{{optionFontSizeField}}{{optionBubbleWidthToggle}}</div>
      {{optionBubblePositionField}}
      {{optionBubbleActionField}}
    </div>
  </div>
  <div class="igs-source-filter"><div class="igs-source-filter-title">工具栏{{resetReaderInterfaceToolbar}}</div><div class="igs-source-filter-grid">{{toolbarScaleField}}{{toolbarDockField}}</div>{{pinnedButtonsField}}</div>
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
    {{promptRuleOutfitHint}}
    {{promptAdvanced}}
  </div>
</div>
`.trim();

const SCENE_ASSETS_TEMPLATE = `
<div class="igs-settings-grid" data-scene-settings-pane="assets">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">预设</div>
    {{scenePresetBar}}
    {{sceneEraToggle}}
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
    ['source', '图像来源'],
    ['auto', '生图内容'],
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
    ['scene', '素材'],
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
    if (subTab === 'other') return 'source';
    return IMAGE_SUBTAB_DEFS.some(([id]) => id === subTab) ? subTab : 'source';
}

export function getImageSubTabTemplate(subTab) {
    const id = normalizeImageSubTab(subTab);
    if (id === 'source') return IMAGE_SOURCE_TEMPLATE;
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
