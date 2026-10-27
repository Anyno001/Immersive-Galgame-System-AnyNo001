// 写词即存的角色资料记录：丢弃对应图片时按记录还原，只还原之后没再被改过的部分。
import { normalizeCharacterDna } from './character-dna.js';

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// library 是角色所属的那一份库（本卡或全局）；返回新字段补丁，不原地改。
export function revertProfileWrite(library = {}, write) {
    if (!write || typeof write.character !== 'string' || !write.character) return { changed: false, patch: {} };
    const name = write.character;
    const patch = {};
    let dna = false, outfit = '';
    if (write.dna && same(normalizeCharacterDna(library.characterDna?.[name]), normalizeCharacterDna(write.dna.after))) {
        const next = { ...library.characterDna };
        if (write.dna.before) next[name] = structuredClone(write.dna.before);
        else delete next[name];
        patch.characterDna = next;
        dna = true;
    }
    const created = write.outfit;
    const entry = created && library.characterOutfits?.[name]?.[created.name];
    // 只删本次新建、之后没挂图也没改过的衣装；已经挂了图的说明这件衣服被用上了。
    if (entry && same(entry, created.entry)) {
        const outfits = { ...library.characterOutfits[name] };
        delete outfits[created.name];
        patch.characterOutfits = { ...library.characterOutfits, [name]: outfits };
        if (created.wardrobeKey && same(library.wardrobe?.[created.wardrobeKey], created.wardrobe)) {
            const wardrobe = { ...library.wardrobe };
            delete wardrobe[created.wardrobeKey];
            patch.wardrobe = wardrobe;
        }
        outfit = created.name;
    }
    return { changed: dna || Boolean(outfit), dna, outfit, patch };
}
