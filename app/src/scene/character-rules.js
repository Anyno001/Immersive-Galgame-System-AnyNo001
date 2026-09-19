export function matchCharacterRule(scene, rules = []) {
    const speaker = scene.speaker || '';
    const emotion = scene.emotion || '';

    return (
        rules.find((rule) => rule.character === speaker && rule.emotion === emotion) ||
        rules.find((rule) => rule.character === speaker && rule.emotion === 'default') ||
        rules.find((rule) => (rule.aliases || []).includes(speaker) && rule.emotion === emotion) ||
        rules.find((rule) => rule.character === 'default') ||
        null
    );
}
