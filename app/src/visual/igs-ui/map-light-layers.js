// 光照 / 天气叠加层：位于底图与指针之间，只改画面观感，不拦截点击。
const noiseLayer = (seed, freq, shade, alphaRow) => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'><filter id='n' x='0' y='0' width='100%' height='100%'>`
        + `<feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='4' seed='${seed}' stitchTiles='stitch'/>`
        + `<feColorMatrix values='0 0 0 0 ${shade} 0 0 0 0 ${shade} 0 0 0 0 ${shade} ${alphaRow}'/></filter>`
        + `<rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
    return `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
};

const CLOUD_IMAGE = noiseLayer(7, '0.0035 0.005', 0.12, '0 0 0 -2.6 1.3');
const FOG_IMAGE = noiseLayer(11, '0.0022 0.003', 1, '0 0 0 1.5 -0.25');

export const MAP_LIGHT_LAYER_STYLE_TEXT = `
#igs-map-panel .igs-map-light{position:absolute;left:0;top:0;width:100%;height:100%;z-index:1;pointer-events:none;}
#igs-map-panel .igs-map-light-tint{mix-blend-mode:multiply;}
#igs-map-panel .igs-map-light-warm{mix-blend-mode:soft-light;}
#igs-map-panel .igs-map-light-gray{mix-blend-mode:multiply;}
#igs-map-panel .igs-map-light-dust{mix-blend-mode:multiply;}
#igs-map-panel .igs-map-light-snow{background:rgba(236,242,252,1);mix-blend-mode:screen;}
#igs-map-panel .igs-map-light-lamps{display:block;mix-blend-mode:screen;object-fit:fill;}
#igs-map-panel .igs-map-light-clouds{background-image:${CLOUD_IMAGE};background-size:800px 450px;mix-blend-mode:multiply;animation:igs-map-drift 180s linear infinite;}
#igs-map-panel .igs-map-light-fog{background-image:${FOG_IMAGE};background-size:800px 450px;animation:igs-map-drift 260s linear infinite reverse;}
#igs-map-panel .igs-map-world.is-lit::before{background:rgba(10,12,16,.04);}
#igs-map-panel .igs-map-weather{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;transition:background-color .12s ease-out;}
#igs-map-panel .igs-map-weather .igs-fx-canvas{position:absolute;left:0;top:0;width:100%;height:100%;}
#igs-map-panel .igs-map-weather.igs-fx-lightning-active{background-color:rgba(236,240,255,.28);}
@keyframes igs-map-drift{from{background-position:0 0;}to{background-position:800px 225px;}}
@media (prefers-reduced-motion:reduce){#igs-map-panel .igs-map-light-clouds,#igs-map-panel .igs-map-light-fog{animation:none;}}
`;

const attr = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// ownTimeArt：底图自带分时段美术（如 map-demo 全套）时不再调色与点灯，只保留天气。
export function mapLightLayersHtml(lighting, options = {}) {
    if (!lighting) return '';
    const layers = [];
    const graded = !options.ownTimeArt;
    if (graded && lighting.tint) layers.push(`<div class="igs-map-light igs-map-light-tint" style="background:${lighting.tint}"></div>`);
    if (graded && lighting.warm) layers.push(`<div class="igs-map-light igs-map-light-warm" style="background:linear-gradient(135deg,${lighting.warm},transparent 85%)"></div>`);
    if (lighting.gray) layers.push(`<div class="igs-map-light igs-map-light-gray" style="background:${lighting.gray}"></div>`);
    if (lighting.dust) layers.push(`<div class="igs-map-light igs-map-light-dust" style="background:${lighting.dust}"></div>`);
    if (lighting.snow) layers.push(`<div class="igs-map-light igs-map-light-snow" style="opacity:${lighting.snow}"></div>`);
    if (graded && lighting.lights > 0.02 && options.lightsUrl) {
        layers.push(`<img class="igs-map-light igs-map-light-lamps" src="${attr(options.lightsUrl)}" alt="" draggable="false" style="opacity:${lighting.lights}">`);
    }
    if (lighting.clouds) layers.push(`<div class="igs-map-light igs-map-light-clouds" style="opacity:${lighting.clouds}"></div>`);
    if (lighting.fog) layers.push(`<div class="igs-map-light igs-map-light-fog" style="opacity:${lighting.fog}"></div>`);
    return layers.join('');
}

export function mapBasemapFilter(lighting, options = {}) {
    return lighting && !options.ownTimeArt ? lighting.filter : '';
}
