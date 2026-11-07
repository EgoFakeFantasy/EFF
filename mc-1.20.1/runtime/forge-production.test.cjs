'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {relativeLibrary,validateProduction}=require('./forge-production.cjs');
test('production libraries cannot escape the pinned Maven tree',()=>{
 const root=path.resolve('fixture/libraries');
 assert.equal(relativeLibrary(root,path.join(root,'group/library.jar')),path.join('group','library.jar'));
 for(const f of [root,path.join(root,'../outside.jar')])assert.throws(()=>relativeLibrary(root,f),/OUTSIDE_ROOT/);
});
test('production launch rejects dev mappings, external classpaths and ambiguous roots',()=>{
 const root=path.resolve('fixture/libraries'),lib=path.join(root,'loader.jar');
 const h={loader:'forge',distribution:'production',env:{},libraryDirectory:root,modJar:path.resolve('eff.jar'),storyBundle:path.resolve('story.zip')};
 const args=['-DlibraryDirectory='+root,'-p',lib,'-cp',lib,'--launchTarget','forgeclient'];
 assert.doesNotThrow(()=>validateProduction(h,args));
 for(const change of [[...args,'-Dmixin.env.refMapRemappingFile=dev.srg'],[...args,'-DlibraryDirectory='+root],args.map(a=>a==='forgeclient'?'forgeclientuserdev':a),args.map(a=>a===lib?path.resolve('outside.jar'):a)])assert.throws(()=>validateProduction(h,change));
 assert.throws(()=>validateProduction({...h,env:{MOD_CLASSES:'eff%%classes'}},args));
});
