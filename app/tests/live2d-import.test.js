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
const finishedBinding = () => ({ format:'igs-live2d',version:1,name:'爱音',entry:'角色/a.model3.json',moods:{'喜悦':{expression:'smile',motion:'TapBody',index:0},'开心':{expression:'smile'},'旧自定义':{motion:'TapBody',index:0},'*':{expression:'smile'}},layout:{scale:120,posX:40,posY:105} });
function finishedFiles(binding = finishedBinding()) { return {...fixture(),'igs-live2d-binding.json':enc(binding)}; }
function wrapFiles(files, prefix) { return Object.fromEntries(Object.entries(files).map(([path,bytes])=>[prefix+'/'+path,bytes])); }
function folderFiles(files) { return Object.entries(files).map(([path,bytes])=>({name:path.split('/').pop(),webkitRelativePath:path,size:bytes.length,arrayBuffer:async()=>bytes})); }