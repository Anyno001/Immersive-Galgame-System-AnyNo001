import { readCharacterDnaView } from '../../scene/character-dna.js';
import { currentCgContext } from './cg-character-bindings.js';
import { checkPromptTask, checkPromptOutput, checkPromptRecipe, promptTaskForSlot } from '../../schemas/prompt-recipe.js';
import { checkCharacterMeta } from '../../schemas/character-meta.js';
import { referenceCanvasCenter } from '../../media/cg-reference-canvas.js';
import { inheritImageTaskLease } from '../image-task-runtime.js';

// 诊断只带字段路径和数值索引，不包含衣装正文、身份资料或写词回复。
const fail = (reason = 'DNA_TEMPLATE_BINDING', field = 'promptRecipe', where = {}) => ({
    ok: false, reason, diagnostics: { phase: 'binding', field, ...where },
    error: `一致性绑定校验失败：${where.slotId !== undefined ? `slotid ${where.slotId} ` : ''}`
        + `${where.captionIndex !== undefined ? `Char ${where.captionIndex} ` : ''}${field} 不符合本次任务；原图保持不变`,
});
const checkedFailure = (result, field, where = {}) => ({ ...result,
    ...fail(result.reason || 'DNA_TEMPLATE_BINDING', field, where) });
const whereOf = (slotId, captionIndex) => ({ slotId,
    ...(Number.isInteger(captionIndex) && { captionIndex }) });

// 原 CG 提示词随图保留；写词只按裁剪结构筛选局部元素及参考关系。
export function consistencyPromptTask(record, characters, assets, plans, appearances) {
    const recipe = record.promptRecipe;
    if (!checkPromptRecipe(recipe, recipe?.caption).ok || !recipe
        || recipe.bindings.length !== characters.length
        || recipe.bindings.some((b) => b.kind !== 'named')) return fail('cg-binding-incomplete', 'record.promptRecipe');
    const correcting = appearances !== undefined;
    if (correcting && (!Array.isArray(appearances) || appearances.length !== characters.length
        || characters.some(c => appearances.filter(a => a.characterKey === c.characterKey).length !== 1)))
        return fail('DNA_TEMPLATE_BINDING', 'appearance.characters');
    const context = currentCgContext(record, assets).map(c => {
        if (!correcting) return c;
        const selected = appearances.find(a => a.characterKey === c.characterKey);
        if (!selected?.outfit?.name || !selected.outfit.description?.trim()) return null;
        return { ...c, outfit: structuredClone(selected.outfit), outfits: [structuredClone(selected.outfit)] };
    });
    if (context.some(c => !c)) return fail('OUTFIT_TEMPLATE_INVALID', 'appearance.outfit');
    const named = characters.map((c) => recipe.bindings.find((b) =>
        b.characterKey === c.characterKey && b.captionIndex === c.captionIndex));
    if (named.some((b) => !b)) return fail('DNA_TEMPLATE_BINDING', 'record.characterMeta');
    const refs = named.map((b, i) => ({ characterKey: b.characterKey, token: `ref${i.toString(36)}`,
        kind: 'reference', framing: correcting ? 'full_body' : 'portrait' }));
    if (refs.some((r) => named.some((b) => b.token === r.token))) return fail('DNA_TEMPLATE_BINDING', 'reference.token');
    for (const b of [...named, ...refs]) {
        const view = readCharacterDnaView(context.find((c) => c.characterKey === b.characterKey)?.dna, b.framing);
        if (!view.ok) return checkedFailure(view, 'dna.views');
    }
    const sourceRows = named.map((b) => ({ ...b,
        centers: record.caption.v4_prompt.caption.char_captions[b.captionIndex].centers }));
    const rounds = plans.map((plan, i) => ({ slotId: i + 2, characterKey: characters[i].characterKey,
        layout: { sourceSize: { width: plan.width, height: plan.height },
            crop: plan.crop, work: plan.work, reference: plan.reference,
            ...(plan.referenceContent && { referenceContent: plan.referenceContent }) },
        size: plan.size, rows: named.flatMap((b) => {
            const centers = sourceRows.find((r) => r.token === b.token).centers
                .map(p => referenceCanvasCenter(plan, p)).filter(Boolean);
            return centers.length ? [{ ...b, centers }] : [];
        }).concat({ ...refs[i], centers: [{
            x: ((plan.referenceContent || plan.reference).x + (plan.referenceContent || plan.reference).width / 2) / plan.size.width,
            y: ((plan.referenceContent || plan.reference).y + (plan.referenceContent || plan.reference).height / 2) / plan.size.height,
        }] }) }));

    const expected = rounds;
    const promptTask = { version: 1, mode: 'dna_template', purpose: 'consistency',
        ...((correcting || recipe.outfitMode) && { outfitMode: correcting ? 'template' : recipe.outfitMode }),
        characters: [...named, ...refs].map(({ kind, characterKey, token, framing }) =>
            ({ kind, characterKey, token, framing })),
        slots: expected.map((s) => ({ slotId: s.slotId, tokens: s.rows.map((r) => r.token),
            ...(correcting && { identityMode: 'appearance_correction' }) })) };
    const checked = checkPromptTask(promptTask, context);
    if (!checked.ok) return checkedFailure(checked, 'promptTask');
    return { ok: true, promptTask: checked.value, characterContext: context, expected,
        targetCharacters: characters.map(c => ({ ...structuredClone(c),
            ...(correcting && { outfit: structuredClone(context.find(a => a.characterKey === c.characterKey).outfit) }) })),
        description: correcting ? consistencyTargetDescription(record, recipe) : [
            '根据本张 CG 随图保存的原提示词和本次裁剪布局，派生 promptTask.slots 指定的局部模板。只保留裁剪画面中剩下的元素，其他内容尽量逐字复用原提示词，仅补必要的局部描述和参考关系。只输出本轮，不生成全图提示词，不参考剧情正文、聊天历史或世界书，不生成 DNA，不新增人物。',
            '允许修改的唯一范围：该轮 characterKey 对应目标的稳定身份特征，仅对照其已保存 DNA 中明确强调且参照图支持的外貌和标志细节校正；DNA 是身份权威，参照图只辅助匹配。未知、矛盾或画外特征不猜测，不为追求相似度重新设计人物。',
            '身份校正限于有依据的脸型与五官、发色发型、瞳色、肤色、角、尾巴、翅膀、非人耳及标志饰品等；逐项核对保存 DNA 与原图可见依据，不能只顾五官而遗漏关键非人特征或饰品，也不能把它们当衣装随换装删除。不强行补出画外或被遮挡的尾翼、不改变其姿态、位置或接触关系。不把参照图的服装、姿态、表情、视线方向、背景、光照或画风迁移到 CG。只校正不一致之处，已经一致的特征保持。',
            '保姿优先于身份相似度：即使 DNA 描述了体型、身高或身体比例，也不得据此重塑原 CG 的身体轮廓、骨架、肢体长度或躯干比例，不移动头部、手脚和接触点，不改变人物占画面的大小。身份细节与原姿势、遮挡或接触关系冲突时保留原 CG，不追求立绘姿态。',
            '裁剪内保留元素尽量沿用原 CG 提示词：衣装颜色、款式、材质与配件，表情、视线、姿势、动作、身体朝向、位置、尺度、遮挡、互动和接触关系；画面内其他人物、马匹等动物、道具、缰绳、建筑及局部背景仍使用原有描述。光影、画风和整体色调沿用原词；画外元素和不适用的全图构图描述从局部模板省略，不为了完整复述原词而重新画入。',
            '本轮输出清单的 characterKey 是目标；layout.sourceSize/crop 是原图裁剪依据，work/reference 是工作区与辅助图区域。根据原词、原角色位置及裁剪结构筛选局部元素，不把粗裁剪区视为整块重设计许可。只输出清单指定的角色，画外内容不强行移入；没有位置依据的物件不猜测位置，不声称看过图片。',
            '每个工作轮次独立用于实际重绘，从随图保存的原词与裁剪布局派生。保留元素的姿势、动作、身体朝向、表情、视线、遮挡和互动接触关系尽量复用原提示词，不笼统省略成仅身份与衣装或保持原姿势。只对局部裁剪确实需要的描述作最小调整，不重写整份动态描述。',
            '只反推动作、表情、互动与局部环境；复用原 named 的角色 token 和景别，Char 恰有自身 <<dna:token>> 一次，负向可引用自身 <<dna_uc:token>> 一次。不重写身份正文，不输出 meta_identity、meta_signature、identity_mode、meta_correction_identity、meta_correction_uc 或 meta_dna_*。reference 使用本次清单的独立身份 token，不生成替代 DNA，不套用普通 CG 的身份旁路。',
            '具名人物的 meta_outfit_name 逐字照抄本次 outfit.name。衣装模板模式下，meta_outfit_description 保留本图索引和竖线，值留空以引用本次冻结说明，不重抄全文；若填写非空值，须与 outfit.description 逐字一致，包括尾部标点、权重和触发词。非衣装模板任务仍逐字照抄说明，空值保持为空。这些资料来自原 CG 衣装快照，不是参照立绘衣装；不改写、不翻译、不补全。衣装模板 Char 只用衣装槽，其他任务才保真写原衣装，不迁移参照图衣装。',
            ...(recipe.outfitMode === 'template' ? ['每份写 outfit_mode: template；named Char 恰写本人的 <<outfit:token>> 一次，再写本图动态。reference 与所有 UC 不使用衣装占位。衣装名称使用本次 outfit.name，不另选新衣装或参照图服装。'] : []),
            '以本次输出清单的 captionIndex 作为本图 Char 的零基索引，从 0 连续编号。每个 meta_* 字段都写为 字段名: captionIndex | 值，包括 meta_key、meta_token、meta_frame。例如索引0须写 meta_key: 0 | 输入角色键、meta_token: 0 | 输入token、meta_frame: 0 | 输入景别，不能只写值。slotid、原图角色序号和 token 中的数字都不是本图索引。同一 characterKey 的 named 与 reference 是两个独立 Char，各用自己的索引和 token；每个字段恰好一次，不在图末重复汇总。',
            '参考关系只写进对应 reference 的 char 英文自然语言：辅助人像对应本轮目标，仅比较脸、头发及可见稳定身份细节；主工作区保留原 CG 动作、衣装和环境，不采用参考立绘的姿态、表情、服装、背景或画风。Scene 只描述原 CG 裁剪内的共同画面，不写技术分区。reference 是 meta_kind 的取值，不是字段名；不输出 reference:、reference_uc:、额外参考说明段落或独立 reference inset 行，也不把该技术标签写进正文。',
            '参考 Char 使用输入的独立 reference token 和 portrait 景别，只引用身份占位符及简洁可见状态，不复述外貌，不要求相框、描边、展示卡、衣装或新背景。参考 Char 仍写 char 和 char_uc；在自己的索引各写一次 meta_kind、meta_key、meta_token、meta_frame、meta_outfit_name、meta_outfit_description，所有值均以 索引 | 开始，衣装两项在竖线后留空；不得复制 named 的衣装或索引。辅助图不是剧情里的第二个人。',
            '辅助人像不改变最终 CG 的构图；不得额外要求 panel、frame、border、split screen、collage 或装饰边线。将新增相框、金色边框、装饰边线、分栏、拼贴及重复剧情人物等伪影排除项写入工作轮次 scene_uc，不排除本轮必需的辅助人像；保留原 CG 中实际存在的物件，不把真实建筑或道具误当技术边界删除。',
            '每份严格绑定该 slots 的全部 token；景别照抄输入。所有动态文字、质量、UC 在本次完成，不输出画师串。',
            '本张 CG 保存的原提示词（筛选局部元素并尽量复用原措辞，身份和衣装使用原 token）：\n'
                + JSON.stringify(record.promptEdited ? record.prompt?.caption || record.prompt || record.caption : recipe.caption),
        ].join('\n') };
}

function consistencyTargetDescription(record, recipe) {
    return [
        '仅派生本次 outputs 指定的局部一致性模板，不读取剧情正文、历史、世界书，不新增人物或生成永久 DNA。原 CG 提供姿势、表情、视线、位置、尺度、构图、遮挡、互动接触、道具、背景、光影和画风；按裁剪布局保留这些元素并尽量复用其原措辞。',
        '本轮 characterKey 是校正目标。按已选参考立绘的可见身份与本次指定衣装校正，结合所给身份资料；不沿用原 CG 的错误外貌或旧衣装。目标服装取 characterContext.outfit，不叠穿旧服装；Scene 和 Char 中冲突的旧衣装描述改为本次指定衣装。非目标人物保持原动态。',
        '允许发型、脸型、五官及衣装设计带来的必要局部轮廓改变；保留头部与身体位置、尺度、骨架姿态和手脚接触点，不把参考立绘的姿态、表情、视线、背景、光照或画风迁移到 CG。粗裁剪不是分割，区外旧发尾不能自动删除，不擅自扩区。',
        '每份使用本次 slot 的 identityMode: appearance_correction，输出 identity_mode: appearance_correction。每个 named/reference 用独立 token，在自身 Char 恰引用 <<dna:token>> 一次，可在自身 UC 引用 <<dna_uc:token>> 一次；各自输出 meta_correction_identity 和可选 meta_correction_uc。',
        '临时校正主语只提炼保存资料中适用、无矛盾的身份支持，保守表达脸、头发、非人特征及明确标志饰品；不复制完整身体比例或用负面词强制相反身份，不凭空猜参考图片细节，不声称看过图。未知或遮挡不强补；不输出 meta_identity、meta_signature、meta_dna_*，不改永久 DNA。',
        '每份写 outfit_mode: template。named 的 meta_outfit_name 逐字照抄本次 outfit.name；meta_outfit_description 保留本图索引和竖线，值留空以引用本次冻结的 outfit.description，不重抄全文。若填写非空值，须与本次说明逐字一致，包括尾部标点、权重和触发词。正向 Char 恰写本人的 <<outfit:token>> 一次，不复述衣装清单。原 CG 快照仅作历史依据，不是本次目标。',
        'reference 展示完整已保存人物立绘画布，包括可见衣装，不是头像限定。用输入景别、独立 token 和自身连续 captionIndex；参考关系写在 reference 的 char 自然语言中，说明与目标同人且同套有效衣装，不复制服装正文或新增第二份衣装候选。reference 的两项 meta_outfit_* 各写一次空值，正负向都不写衣装占位。',
        '全部 meta_* 使用本图从0连续的 captionIndex | 值，每项恰好一次，角色键、token、景别照抄 outputs.rows，不以 slotid 或原图索引替代。只输出本轮 slot；不输出 reference:、reference_uc: 或独立 reference inset 行。',
        'Scene 只写原图裁剪内共同画面，不写技术分区；排除额外相框、描边、分栏、拼贴和重复剧情人物等伪影，不误删原图真实物件。按本次要求写明质量、动态及 UC，不输出画师。',
        '原 CG 提示词（仅复用仍适用的动态与场景，目标身份及衣装按本次资料）：\n'
            + JSON.stringify(record.promptEdited ? record.prompt?.caption || record.prompt || record.caption : recipe.caption),
    ].join('\n');
}

// 返回顺序不代表轮次；按 slotId/token 对账，衣装只取已校验的冻结快照。
export function checkConsistencyCaptions(written, bundle, characters) {
    if (!written?.ok) return written || fail('consistency-write-failed');
    const entries = written.captions;
    if (!Array.isArray(entries) || entries.length !== bundle.expected.length)
        return fail('DNA_TEMPLATE_BINDING', 'captions.length', {
            expectedCount: bundle.expected.length, actualCount: Array.isArray(entries) ? entries.length : 0 });
    const ids = entries.map((e) => e?.slotId);
    if (new Set(ids).size !== ids.length || bundle.expected.some((e) => !ids.includes(e.slotId)))
        return fail('DNA_TEMPLATE_BINDING', 'captions.slotId');
    const results = [];
    for (const expected of bundle.expected) {
        const entry = entries.find((e) => e.slotId === expected.slotId);
        const bindings = entry.promptRecipe?.bindings;
        if (!Array.isArray(bindings) || bindings.length !== expected.rows.length)
            return fail('DNA_TEMPLATE_BINDING', 'promptRecipe.bindings.length', whereOf(expected.slotId));
        for (const binding of bindings) {
            const where = whereOf(expected.slotId, binding?.captionIndex);
            const row = expected.rows.find((r) => r.token === binding?.token);
            if (!row) return fail('DNA_TEMPLATE_BINDING', 'binding.token', where);
            for (const field of ['kind', 'characterKey', 'framing']) {
                if (row[field] !== binding[field]) return fail('DNA_TEMPLATE_BINDING', `binding.${field}`, where);
            }
        }
        const meta = checkCharacterMeta(entry.characterMeta, entry.caption,
            bundle.characterContext.map((c) => c.characterKey));
        if (!meta.ok) return checkedFailure(meta, 'characterMeta', whereOf(expected.slotId));
        const output = checkPromptOutput({ ...entry, characterMeta: meta.value },
            bundle.promptTask, bundle.characterContext);
        if (!output.ok) return checkedFailure(output, entry.dnaCandidates !== undefined ? 'dnaCandidates' : 'promptRecipe', whereOf(expected.slotId));
        const recipe = output.value.promptRecipe;

        const caption = structuredClone(entry.caption);
        const metadata = [];
        for (const binding of recipe.bindings) {
            const row = expected.rows.find((r) => r.token === binding.token);
            const where = whereOf(expected.slotId, binding.captionIndex);
            const original = (bundle.targetCharacters || characters).find((c) => c.characterKey === binding.characterKey);
            if (binding.kind === 'named') {
                const returned = meta.value.characters.find((c) => c.captionIndex === binding.captionIndex);
                if (!original || !returned) return fail('DNA_TEMPLATE_BINDING', 'characterMeta.binding', where);
                const outfit = recipe.outfitMode === 'template'
                    ? output.value.outfitSnapshot.characters.find(c => c.characterKey === binding.characterKey
                        && c.captionIndex === binding.captionIndex && c.token === binding.token)
                    : returned.outfit;
                if (!outfit) return fail('DNA_TEMPLATE_BINDING', 'characterMeta.binding', where);
                for (const field of ['name', 'description']) {
                    if (outfit[field] !== original.outfit[field])
                        return fail('DNA_TEMPLATE_BINDING', `outfit.${field}`, where);
                }
                metadata.push({ ...structuredClone(original), captionIndex: binding.captionIndex,
                    identityAnchor: '', signatureDetails: '', centers: structuredClone(row.centers),
                    positionExplicit: true });
            }
            caption.v4_prompt.caption.char_captions[binding.captionIndex].centers = structuredClone(row.centers);
        }
        metadata.forEach((c) => { delete c.region; });
        const selected = promptTaskForSlot(bundle.promptTask, entry.slotId);
        if (!selected.ok) return checkedFailure(selected, 'promptTask.slotId', whereOf(expected.slotId));
        const input = { slotId: entry.slotId, caption,
            promptRecipe: { ...recipe, caption }, promptTask: selected.value,
            characterContext: bundle.characterContext, characterMeta: { version: 1, characters: metadata } };
        results.push(inheritImageTaskLease(entry, input));
    }
    return { ok: true, rounds: results };
}
