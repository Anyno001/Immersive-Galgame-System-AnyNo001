import { prepareCharacterCaption } from '../../src/generated-images/character-caption.js';
import { promptFromCaption, storedPromptFromResult } from '../../src/generated-images/generation-prompt.js';
import { promptSnapshotFromBody, prefixFinalArtist } from '../../src/generated-images/final-caption.js';
import { resolveCharacterAppearance } from '../../src/scene/character-appearance.js';
import { consistencyAppearanceAudit } from '../../src/generated-images/illustration/cg-consistency-appearance.js';

// 通过真实准备入口产生资料，测试不手工伪造内部快照结构。
export function provenanceFixture() {
    const caption = {
        v4_prompt: { caption: { base_caption: 'quiet studio', char_captions: [
            { char_caption: '<<dna:rA7>> stands in a blue coat.', centers: [{ x: 0.23, y: 0.51 }] },
        ] } },
        v4_negative_prompt: { caption: { base_caption: '', char_captions: [
            { char_caption: '<<dna_uc:rA7>>' },
        ] } },
    };
    const views = Object.fromEntries(['full_body', 'half_body', 'portrait', 'partial'].map((view) =>
        [view, { subject: 'Alice, 1.2::silver hair::', negative: '' }]));
    const characterMeta = { version: 1, characters: [{ characterKey: 'Alice', captionIndex: 0 }] };
    const prepared = prepareCharacterCaption({ caption, characterMeta,
        promptRecipe: { version: 1, mode: 'dna_template', caption, bindings: [
            { kind: 'named', characterKey: 'Alice', captionIndex: 0, token: 'rA7', framing: 'full_body' },
        ] }, characterContext: [{ characterKey: 'Alice', dna: { version: 2, views } }],
    });
    if (!prepared.ok) throw new Error(prepared.reason);
    const artist = { positivePrompt: 'artist:test', negativePrompt: '' };
    const wireCaption = prefixFinalArtist(prepared.caption, artist);
    const body = { model: 'nai-diffusion-4-5-full', action: 'generate', parameters: wireCaption };
    const result = { ...prepared, prompt: promptFromCaption(prepared.caption),
        sentPrompt: promptSnapshotFromBody(body, artist) };
    return { ...result, prompt: storedPromptFromResult(result), characterMeta };
}


export function characterViewsFixture(subject = 'Alice, an adult woman with silver hair and blue eyes,') {
    return Object.fromEntries(['full_body', 'half_body', 'portrait']
        .map((frame) => [frame, { subject, negative: 'extra fingers' }]));
}

// 写词替身遵守真实任务的 slot/token 绑定；发送仍由实际 Adapter 校验、展开。
export function characterWriteFixture(request, { subject, scene = 'One woman stands in soft light.', action = 'wears a red hoodie and smiles.', outfitDescription = 'wears a red hoodie' } = {}) {
    const task = request.promptTask;
    const slots = task.slots || [{ slotId: 1, tokens: task.characters.map((c) => c.token) }];
    const captions = slots.map(({ slotId, tokens }) => {
        const characters = task.characters.filter((c) => tokens.includes(c.token));
        const clothing = c => {
            const source = request.characterContext.find(x => x.characterKey === c.characterKey);
            const current = source?.outfit;
            const saved = source?.outfits?.find(o => o.name === current?.name);
            if (current?.name === '' && current.description?.trim()
                && current.description === source?.dna?.defaultAppearance) return { name: '', description: '' };
            return { name: current?.name || '日常',
                description: current?.name && (current.description || saved?.description)
                    ? '' : outfitDescription };
        };
        const dynamic = task.outfitMode === 'template' ? 'and smiles.' : action;
        const caption = {
            v4_prompt: { caption: { base_caption: scene, char_captions: characters.map((c) => ({
                char_caption: `<<dna:${c.token}>> ${task.outfitMode === 'template' ? `<<outfit:${c.token}>> ` : ''}${dynamic}`, centers: [{ x: 0.5, y: 0.5 }],
            })) } },
            v4_negative_prompt: { caption: { base_caption: 'blurry', char_captions: characters.map((c) => ({
                char_caption: `<<dna_uc:${c.token}>>`,
            })) } },
        };
        const bindings = characters.map((c, captionIndex) => ({ kind: 'named', ...c, captionIndex }));
        const savedViews = (c) => request.characterContext.find((x) => x.characterKey === c.characterKey)?.dna?.views;
        const candidates = characters.filter((c) => !['full_body', 'half_body', 'portrait']
            .every((frame) => savedViews(c)?.[frame]?.subject?.trim()));
        return { slotId, caption, promptRecipe: { version: 1, mode: 'dna_template', caption, bindings,
            ...(task.outfitMode && { outfitMode: task.outfitMode }) },
            characterMeta: { version: 1, characters: characters.map((c, captionIndex) => ({
                characterKey: c.characterKey, captionIndex, identityAnchor: '', signatureDetails: '',
                outfit: task.outfitMode === 'template' ? clothing(c)
                    : { name: '日常', description: 'A red hoodie.' },
                centers: [{ x: 0.5, y: 0.5 }], positionExplicit: true,
            })) },
            ...(task.purpose === 'sprite' && candidates.length && { dnaCandidates: { version: 1,
                characters: candidates.map((c) => ({ characterKey: c.characterKey, views: Object.fromEntries(
                    Object.entries(characterViewsFixture(subject)).map(([frame, view]) =>
                        [frame, savedViews(c)?.[frame]?.subject?.trim() ? savedViews(c)[frame] : view])) })) } }),
        };
    });
    return { ok: true, ...captions[0], captions };
}

// 隔离模型端口的资料回文；生产解析器负责拒收和模板组装。
export function spriteDataReply(request, options = {}) {
    if (request.outputs.format === 'expression-fragments') {
        const rows = request.outputs.rows || request.promptTask.slots.map(slot => ({ slotId: slot.slotId,
            characterKey: request.promptTask.characters.find(c => c.token === slot.tokens[0]).characterKey }));
        return rows.slice().reverse().map(row => [`slotid: ${row.slotId}`, `character: ${row.characterKey}`,
            `expression: ${row.slotId === 1 ? 'smiling eyes, upturned mouth' : 'furrowed brows, tense lips'}`,
            'expression_uc: distorted mouth'].join('\n')).join('\n---\n');
    }
    const written = characterWriteFixture(request, options);
    options.transformWritten?.(written, request);
    return written.captions.slice().reverse().map(entry => {
        const binding = entry.promptRecipe.bindings[0];
        const source = request.characterContext.find(c => c.characterKey === binding.characterKey);
        const header = [`slotid: ${entry.slotId}`, `character: ${binding.characterKey}`];
        const outfit = entry.characterMeta.characters[0].outfit;
        const saved = source.outfits?.find(o => o.name === outfit.name);
        const candidate = entry.dnaCandidates?.characters[0];
        return header.concat([
            `outfit_name: ${outfit.name}`,
            `outfit_description: ${outfit.description || saved?.description || source.outfit?.description || ''}`,
            ...(candidate ? Object.entries(candidate.views).flatMap(([frame, view]) => [
                ...(view.subject !== undefined ? [`dna_${frame}: ${view.subject}`] : []),
                `dna_uc_${frame}: ${view.negative || ''}`]) : []),
            ...(request.promptTask.purpose === 'sprite' && source.dna?.personality === undefined
                ? [`personality: ${options.personality ?? ''}`] : []),
        ]).join('\n');
    }).join('\n---\n');
}


// UI 采用 fixture 仍经过实际任务校验、身份展开和定稿快照入口。
export async function spriteAdoptionFixture(name = 'Alice', dna = {}, characterContext) {
    const { characterPromptTask } = await import('../../src/generated-images/illustration/character-prompt-task.js');
    const { spriteAdoptionEvidence } = await import('../../src/scene/character-identity.js');
    const task = characterPromptTask(characterContext || [{ characterKey: name, dna }], 'sprite', 'half_body', [[name]]);
    const entry = characterWriteFixture(task, { subject: `${name}, an adult with silver hair,` }).captions[0];
    const input = { ...task, ...entry };
    const prepared = prepareCharacterCaption(input);
    if (!prepared.ok) throw new Error(prepared.reason);
    const sentPrompt = promptSnapshotFromBody({ model: 'nai-diffusion-5-full', action: 'generate',
        parameters: prepared.caption }, null);
    return { id: 'sprite-candidate', imageId: 'sprite-candidate', type: 'sprite', name,
        status: 'temp', dataUrl: 'data:image/png;base64,AAAA', revision: 1,
        ...prepared, ...spriteAdoptionEvidence(input, prepared), characterMeta: entry.characterMeta,
        sentPrompt, prompt: storedPromptFromResult({ ...prepared, sentPrompt,
            prompt: promptFromCaption(prepared.caption) }) };
}

// 正式场景与工作轮次分别经过唯一准备入口，避免手工伪造 reference 来源。
export function consistencyProvenanceFixture({ appearanceCorrection = false, appearance = false } = {}) {
    const scene = provenanceFixture();
    const named = scene.promptRecipe.bindings[0];
    const reference = { ...named, kind: 'reference', token: 'ref0', captionIndex: 1, framing: 'portrait' };
    const identity = appearanceCorrection ? { identityMode: 'appearance_correction' } : {};
    const outfitMode = appearance ? { outfitMode: 'template' } : {};
    const outfit = { name: 'Coat', description: 'wears a blue coat' };
    const metadata = structuredClone(scene.characterMeta);
    const bindings = [named, reference].map(b => ({ ...b,
        ...(appearanceCorrection && { correction: { subject: 'Alice with 1.2::silver hair:: and a $5 star hair clip,',
            negative: 'wrong hair color' } }) }));
    const caption = structuredClone(scene.promptRecipe.caption);
    caption.v4_prompt.caption.base_caption = 'Alice retains her pose in a quiet studio.';
    caption.v4_prompt.caption.char_captions.push({ char_caption: '<<dna:ref0>> is an identity reference portrait.',
        centers: [{ x: 0.9, y: 0.5 }] });
    caption.v4_negative_prompt.caption.char_captions.push({ char_caption: '<<dna_uc:ref0>>' });
    if (appearance) {
        caption.v4_prompt.caption.char_captions[0].char_caption = `<<dna:${named.token}>> <<outfit:${named.token}>> stands.`;
        metadata.characters[0].outfit = outfit;
    }
    const characterContext = [{ characterKey: named.characterKey, dna: scene.dnaSnapshot.characters[0].profile,
        ...(appearance && { outfit }) }];
    const round = prepareCharacterCaption({ caption, characterMeta: metadata, characterContext,
        promptRecipe: { version: 1, mode: 'dna_template', caption, bindings, ...identity, ...outfitMode },
        promptTask: { version: 1, mode: 'dna_template', purpose: 'consistency', characters: [named, reference], ...identity, ...outfitMode } });
    if (!round.ok) throw new Error(round.reason);
    const sentPrompt = promptSnapshotFromBody({ model: 'nai-diffusion-5-full', action: 'infill',
        parameters: prefixFinalArtist(round.caption, scene.sentPrompt.artist) }, scene.sentPrompt.artist);
    let audit;
    if (appearance) {
        const url = 'igs-gen:wardrobe-source';
        const selected = resolveCharacterAppearance({ characterKey: named.characterKey, requestedOutfit: outfit.name,
            purpose: 'consistency', sceneAssets: {
                characterOutfits: { [named.characterKey]: { Coat: { wardrobe: 'coat', moods: { 平和: url } } } },
                wardrobe: { coat: { prompt: outfit.description } },
            }, imageAvailability: { [url]: { status: 'available', revision: 3 } } });
        if (!selected.ok) throw new Error(selected.reason);
        audit = consistencyAppearanceAudit({ selections: [{ ...selected, requirementSource: 'historical-snapshot',
            reference: selected.referenceImage }], confirmations: [], scope: { scopeKey: 'card:A',
            owners: [{ characterKey: named.characterKey, ownerKey: 'card:A' }] } }, named.characterKey, false);
    }
    return { version: 1, rounds: [{ slotId: 2, characterKey: named.characterKey,
        promptRecipe: round.promptRecipe, dnaSnapshot: round.dnaSnapshot, sentPrompt,
        ...(appearance && { outfitSnapshot: round.outfitSnapshot, appearance: audit }) }] };
}
