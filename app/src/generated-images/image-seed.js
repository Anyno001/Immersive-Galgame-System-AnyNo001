export const isImageSeed = value => Number.isInteger(value) && value >= 0 && value <= 4294967295;

export function resolveImageSeed(value, random = Math.random) {
    return isImageSeed(value) ? value : Math.floor(random() * 4294967295);
}
