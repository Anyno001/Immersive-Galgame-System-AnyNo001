const FX_STAGE_ID = 'igs-fx-stage';
const FX_FRONT_ID = 'igs-fx-front';

function make(doc, className) {
    const node = doc.createElement('div');
    node.className = className;
    return node;
}

// 后层在立绘之后（随震动一起动），前层在对话层之后；两层都不拦截点击。
export function ensureFxLayers(root) {
    const motion = root && root.querySelector && root.querySelector('#igs-stage-motion');
    const doc = root && root.ownerDocument;
    if (!motion || !doc || typeof doc.createElement !== 'function') return null;
    let stage = motion.querySelector(`#${FX_STAGE_ID}`);
    if (!stage) {
        stage = make(doc, 'igs-fx-layer igs-fx-stage-layer');
        stage.id = FX_STAGE_ID;
        stage.appendChild(make(doc, 'igs-fx-letterbox-bar is-top'));
        stage.appendChild(make(doc, 'igs-fx-letterbox-bar is-bottom'));
        stage.appendChild(make(doc, 'igs-fx-flashback-grain'));
        const sprite = motion.querySelector('#igs-sprite');
        if (sprite && sprite.parentNode === motion) motion.insertBefore(stage, sprite.nextSibling);
        else motion.appendChild(stage);
    }
    let front = motion.querySelector(`#${FX_FRONT_ID}`);
    if (!front) {
        front = make(doc, 'igs-fx-layer igs-fx-front-layer');
        front.id = FX_FRONT_ID;
        const dialogLayer = motion.querySelector('#igs-dialog-layer');
        if (dialogLayer && dialogLayer.parentNode === motion) motion.insertBefore(front, dialogLayer.nextSibling);
        else motion.appendChild(front);
    }
    return { motion, stage, front, doc };
}

export function findFxLayers(root) {
    const motion = root && root.querySelector && root.querySelector('#igs-stage-motion');
    if (!motion) return null;
    return { motion, stage: motion.querySelector(`#${FX_STAGE_ID}`), front: motion.querySelector(`#${FX_FRONT_ID}`), doc: root.ownerDocument };
}
