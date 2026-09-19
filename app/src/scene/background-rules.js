export function matchBackgroundRule(scene, rules = []) {
    const candidates = rules
        .filter((rule) => matchesRule(scene, rule.match || {}))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    return candidates[0] || null;
}

function matchesRule(scene, match) {
    return ['location', 'time', 'weather'].every((key) => {
        if (!match[key] || !match[key].length) return true;
        return match[key].includes(scene[key]);
    });
}
