import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from '../src/vendor/fflate.js';
import { importModelZip, resolveModelBackup, inspectModelFiles, importModelFolder, prepareModelPackage, exportModelZip, resolveModelResource, safeModelPath, LIVE2D_LIMITS } from '../src/visual/igs-ui/live2d-model-store.js';
import { normalizeLive2dConfig, resolveLive2dBinding } from '../src/visual/igs-ui/live2d-config.js';
import { renderLive2dLibrary } from '../src/visual/igs-ui/live2d-panel.js';
import { renderCharacterAssetList } from '../src/visual/igs-ui/settings-fields.js';
const enc = x => new TextEncoder().encode(typeof x === 'string' ? x : JSON.stringify(x));
function fixture() { return { '角色/a.model3.json': enc({ Version:3, FileReferences:{ Moc:'a.moc3', Textures:['tex/图.png'], Expressions:[{Name:'smile',File:'face.json'}], Motions:{TapBody:[{File:'move.json'}]} } }), '角色/a.moc3':enc('MOC3'), '角色/tex/图.png':enc('png'), '角色/face.json':enc({}), '角色/move.json':enc({}) }; }
test('live2d-import: compressed ZIP preserves unicode folders and discovers manifest', () => {
    const source = importModelZip(zipSync(fixture(), {level:6})); assert.deepEqual(source.manifests,['角色/a.model3.json']);
    const pkg = prepareModelPackage(source, source.manifests[0], 'test-id'); assert.equal(pkg.metadata.cubism,'3/4'); assert.deepEqual(pkg.metadata.expressions,['smile']); assert.equal(pkg.metadata.motions.TapBody[0].index,0); assert.equal(Object.keys(pkg.files).length,5);
});
test('live2d-import: Cubism2 buildData.asset includes motions, sound and physics', () => {
    const files = { 'buildData.asset':enc({model:'m.moc',textures:['t.png'],physics:'p.json',motions:{idle:[{file:'a.mtn',sound:'a.mp3'}]},expressions:[{name:'f01',file:'f.json'}]}),...Object.fromEntries(['m.moc','t.png','p.json','a.mtn','a.mp3','f.json'].map(n=>[n,enc('{}')])) };
    const pkg=prepareModelPackage(inspectModelFiles(files),'buildData.asset','two'); assert.equal(pkg.metadata.cubism,'2'); assert.equal(Object.keys(pkg.files).length,7);
});
test('live2d-import: folder import uses relative paths and offers multiple entries', async () => {
    const files = fixture(); files['角色/b.model3.json']=files['角色/a.model3.json'];
    const source=await importModelFolder(Object.entries(files).map(([name,bytes])=>({name:name.split('/').pop(),webkitRelativePath:name,size:bytes.length,arrayBuffer:async()=>bytes})));
    assert.equal(source.manifests.length,2); assert.equal(prepareModelPackage(source,'角色/b.model3.json','b').entry,'角色/b.model3.json');
});
test('live2d-import: missing textures fail before persistence', () => {
    const files=fixture();delete files['角色/tex/图.png']; assert.throws(()=>prepareModelPackage(inspectModelFiles(files),'角色/a.model3.json','broken'),/缺少.*1.*文件/);
});
test('live2d-import: rejects absolute, traversal, script URL and ambiguous paths', () => {
    for(const p of ['../x','/x','C:\\x','https://example.com/x','a/../x','a\0b']) assert.throws(()=>safeModelPath(p));
    for(const p of ['../../x','https://example.com/x','data:a','/x','%2e%2e/%2e%2e/x','tex%2fimage.png']) assert.throws(()=>resolveModelResource('a/model.json',p));
    assert.equal(resolveModelResource('a/model.json','../shared/图.png'),'shared/图.png');
    assert.equal(resolveModelResource('a/model.json','tex/%E5%9B%BE.png'),'a/tex/图.png');
});
test('live2d-import: ZIP traversal and normalized duplicate names rejected', () => {
    assert.throws(()=>importModelZip(zipSync({'../evil':enc('x')})),/不安全/);
    assert.throws(()=>inspectModelFiles({...fixture(),'角色/./a.moc3':enc('other')}),/重复/);
});
test('live2d-import: byte budget is checked before reading a huge folder', async () => {
    let read=false;await assert.rejects(()=>importModelFolder([{name:'large',size:LIVE2D_LIMITS.fileBytes+1,arrayBuffer:()=>{read=true;}}]),/过大/); assert.equal(read,false);
});
test('live2d-import: malformed ZIP, invalid JSON and texture-only input fail cleanly', () => {
    assert.throws(()=>importModelZip(enc('not a zip'))); assert.throws(()=>inspectModelFiles({'x.json':enc('{broken'),'texture.png':enc('x')}),/没有找到/);
});
test('live2d-import: exports model files plus mapping and imports a portable backup', () => {
    const pkg=prepareModelPackage(inspectModelFiles(fixture()),'角色/a.model3.json','portable');const moods={'开心':{expression:'smile',motion:'TapBody',index:0},'*':{}};
    const source=importModelZip(exportModelZip(pkg,'爱音',{moods,layout:{scale:120,posX:40}}));assert.equal(source.backup.name,'爱音');assert.deepEqual(source.backup.moods,moods); assert.equal(source.backup.layout.scale,120);
    const next=prepareModelPackage(source,source.backup.entry,'new-id');assert.deepEqual(next.files,pkg.files);assert.equal(source.backup.runtime,undefined);
});
test('live2d-import: local model binding stays separate from URL and static slots', () => {
    const c=normalizeLive2dConfig({bindings:{角色:{modelId:'local-test',modelName:'角色.zip',moods:{开心:{motion:'TapBody',index:0}}}}});const b=resolveLive2dBinding(c,'角色','开心'); assert.equal(b.modelId,'local-test');assert.equal(b.url,undefined);assert.equal(b.action.motion,'TapBody');
    assert.throws(()=>normalizeLive2dConfig({bindings:{x:{modelId:'../../bad'}}}));
});
test('live2d-import: material library renders safe import/edit entries without a reader', () => {
    const c=normalizeLive2dConfig({bindings:{'<script>':{modelId:'id',modelName:'<img>',moods:{开心:{}}}}});const html=renderLive2dLibrary(c,'<卡名>');assert.match(html,/data-live2d-library/);assert.match(html,/igs-settings-section igs-source-filter/);assert.match(html,/data-action="live2d-edit:"/);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;img&gt;'));assert.match(html,/1 个差分/);
});
test('live2d-import: static character rows do not duplicate the model library entry', () => {
    const html=renderCharacterAssetList({'爱音':{默认:'https://example.com/a.png'}}, { isOpen: () => true });
    assert.ok(!html.includes('live2d-edit:'));
    assert.match(html, /爱音/);
    assert.match(html, /scene-toggle-mood:/);
});

test('live2d-import: material character row explains static suspension without deleting slots', () => {
    const characters = { 爱音: { 默认: 'https://example.com/a.png' } };
    const live2dConfig = normalizeLive2dConfig({ bindings: { 爱音: { modelId: 'local', moods: {} } } });
    const html = renderCharacterAssetList(characters, { live2dConfig });
    assert.match(html, /Live2D 已启用 · 静态差分暂停/);
    assert.equal(characters.爱音.默认, 'https://example.com/a.png');
    assert.ok(!renderCharacterAssetList(characters, { live2dConfig: { ...live2dConfig, enabled: false } }).includes('静态差分暂停'));
});

const finishedBinding = () => ({ format:'igs-live2d',version:1,name:'爱音',entry:'角色/a.model3.json',moods:{'喜悦':{expression:'smile',motion:'TapBody',index:0},'开心':{expression:'smile'},'旧自定义':{motion:'TapBody',index:0},'*':{expression:'smile'}},layout:{scale:120,posX:40,posY:105} });
function finishedFiles(binding = finishedBinding()) { return {...fixture(),'igs-live2d-binding.json':enc(binding)}; }
function wrapFiles(files, prefix) { return Object.fromEntries(Object.entries(files).map(([path,bytes])=>[prefix+'/'+path,bytes])); }
function folderFiles(files) { return Object.entries(files).map(([path,bytes])=>({name:path.split('/').pop(),webkitRelativePath:path,size:bytes.length,arrayBuffer:async()=>bytes})); }
test('live2d-import: finished root package restores every preset, legacy mapping and layout without runtime overrides', () => {
    const binding=finishedBinding();binding.runtime={core2:'https://untrusted.invalid/script.js'};binding.modelId='untrusted';binding.url='https://untrusted.invalid/model.json';
    const source=importModelZip(zipSync(finishedFiles(binding)));const backup=resolveModelBackup(source,binding.entry);
    assert.deepEqual(backup.moods,binding.moods);assert.deepEqual(backup.layout,binding.layout);assert.equal(backup.name,'爱音');assert.equal(source.backups.length,1);
    assert.equal(backup.runtime,undefined);assert.equal(backup.modelId,undefined);assert.equal(backup.url,undefined);assert.equal(resolveModelBackup(source,'missing'),null);
});
test('live2d-import: finished ZIP inside nested unicode folders resolves relative binding entry', () => {
    const source=importModelZip(zipSync(wrapFiles(finishedFiles(),'成品/爱音')));const entry='成品/爱音/角色/a.model3.json';
    assert.equal(source.backup.entry,entry);assert.deepEqual(resolveModelBackup(source,entry).moods,finishedBinding().moods);assert.deepEqual(source.backup.layout,finishedBinding().layout);
    assert.equal(prepareModelPackage(source,entry,'wrapped').metadata.expressions[0],'smile');
});
test('live2d-import: extracted finished folder with webkitdirectory prefix restores complete mappings', async () => {
    const source=await importModelFolder(folderFiles(wrapFiles(finishedFiles(),'已编辑模型')));const backup=resolveModelBackup(source,'已编辑模型/角色/a.model3.json');
    assert.deepEqual(backup.moods,finishedBinding().moods);assert.deepEqual(backup.layout,finishedBinding().layout);assert.equal(backup.name,'爱音');
});
test('live2d-import: multiple finished models select only their own binding', () => {
    const second=finishedBinding();second.name='另一角色';second.moods={'悲伤':{expression:'smile'}};second.layout={scale:80};
    const source=inspectModelFiles({...wrapFiles(finishedFiles(),'A'),...wrapFiles(finishedFiles(second),'B')});
    assert.equal(source.backups.length,2);assert.deepEqual(resolveModelBackup(source,'A/角色/a.model3.json').moods,finishedBinding().moods);
    assert.deepEqual(resolveModelBackup(source,'B/角色/a.model3.json').moods,second.moods);assert.equal(resolveModelBackup(source,'B/角色/a.model3.json').name,'另一角色');
});
test('live2d-import: plain models have no fabricated binding and legacy source lookup remains compatible', () => {
    const source=inspectModelFiles(fixture());assert.equal(source.backup,null);assert.deepEqual(source.backups,[]);assert.equal(resolveModelBackup(source,source.manifests[0]),null);
    const backup=finishedBinding();assert.equal(resolveModelBackup({backup},backup.entry),backup);
});
test('live2d-import: malformed declared binding JSON is rejected rather than silently dropping differences', () => {
    assert.throws(()=>inspectModelFiles({...fixture(),'igs-live2d-binding.json':enc('{bad')}),/不是有效 JSON/);
    assert.throws(()=>inspectModelFiles({...wrapFiles(fixture(),'x'),'x/igs-live2d-binding.json':enc('{bad')}),/不是有效 JSON/);
});
test('live2d-import: unsupported finished formats and versions are rejected', () => {
    for(const change of [{format:'other'},{version:2},{version:'1'}]) assert.throws(()=>inspectModelFiles(finishedFiles({...finishedBinding(),...change})),/格式或版本/);
});
test('live2d-import: missing, unsafe and duplicated finished entries are rejected', () => {
    assert.throws(()=>inspectModelFiles(finishedFiles({...finishedBinding(),entry:''})),/缺少模型入口/);
    assert.throws(()=>inspectModelFiles(finishedFiles({...finishedBinding(),entry:'角色/missing.json'})),/入口不存在/);
    assert.throws(()=>inspectModelFiles(finishedFiles({...finishedBinding(),entry:'../model.json'})),/不安全/);
    const nested={...finishedBinding(),entry:'a.model3.json'};
    assert.throws(()=>inspectModelFiles({...finishedFiles(),'角色/igs-live2d-binding.json':enc(nested)}),/重复差分绑定/);
});
test('live2d-import: malformed mood objects and action names are rejected before UI changes', () => {
    for(const moods of [[],null,{'':{}},{'喜悦':[]},{'喜悦':null},{'喜悦':{expression:4}},{'喜悦':{motion:true}}]) assert.throws(()=>inspectModelFiles(finishedFiles({...finishedBinding(),moods})),/必须是|无效/);
});
test('live2d-import: invalid finished motion indexes and layout values are rejected', () => {
    for(const index of [-1,0.5,'invalid']) assert.throws(()=>inspectModelFiles(finishedFiles({...finishedBinding(),moods:{喜悦:{motion:'TapBody',index}}})),/index/);
    for(const layout of [[],null,{scale:0},{scale:501},{posX:301},{posY:'invalid'}]) assert.throws(()=>inspectModelFiles(finishedFiles({...finishedBinding(),layout})),/必须是|超出范围/);
});
test('live2d-import: binding size budget and prototype-like legacy mood keys are safe', () => {
    assert.throws(()=>inspectModelFiles({...fixture(),'igs-live2d-binding.json':new Uint8Array(1024*1024+1)}),/配置过大/);
    const binding=finishedBinding();binding.moods=JSON.parse('{"__proto__":{"expression":"smile"},"constructor":{}}');
    const backup=inspectModelFiles(finishedFiles(binding)).backup;assert.ok(Object.hasOwn(backup.moods,'__proto__'));assert.equal(Object.getPrototypeOf(backup.moods),Object.prototype);assert.equal({}.expression,undefined);
});
test('live2d-import: re-exporting nested finished package remains portable with exact bindings', () => {
    const source=inspectModelFiles(wrapFiles(finishedFiles(),'成品'));const pkg=prepareModelPackage(source,source.backup.entry,'portable-again');
    const roundtrip=importModelZip(exportModelZip(pkg,source.backup.name,source.backup));assert.deepEqual(roundtrip.backup.moods,finishedBinding().moods);assert.deepEqual(roundtrip.backup.layout,finishedBinding().layout);
    assert.equal(roundtrip.backup.entry,source.backup.entry);assert.ok(!Object.hasOwn(pkg.files,'成品/igs-live2d-binding.json'));
});
