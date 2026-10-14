"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const World=require('../local-version/world-runtime.js'),Runtime=require('../local-version/phenomenon-runtime.js'),Policy=require('../local-version/agent-policies.js');
const grid=['############','#..........#','#..........#','#..........#','#..........#','#..........#','#..........#','############'];
const config=(s=Runtime.initial(),overrides={})=>({session:'world-test',scene:'blood',grid,pose:{x:50,y:40,dir:0,walk:0},generation:1,contract:{mode:'battle',checkpoint:Runtime.checkpoint(s)},...overrides});
const defend=(s,target)=>Runtime.resolveRound(s,Policy.make(s,target),Policy.intruder(s));
test('world input follows replayed ownership, including partial victory then occupation',()=>{
 let s=Runtime.initial(),a=World.create(config(s)),b=World.create(config(s));
 World.step(a,.1,{x:1,y:0});World.step(b,.1,{x:0,y:0});assert.deepEqual(a.avatar,b.avatar);assert.equal(World.frame(a).bodyOwner,'contested');
 s=defend(s,'body');World.sync(a,{mode:'battle',checkpoint:Runtime.checkpoint(s)});const x=a.avatar.x;World.step(a,.1,{x:1,y:0});assert.ok(a.avatar.x>x);assert.equal(World.frame(a).input.x,1);
 while(s.outcome==='pending')s=Runtime.resolveRound(s,{...Policy.make(s,'attribution'),reason_code:'NO_EVIDENCE'},Policy.intruder(s));
 const failed=World.create(config(s));assert.equal(World.frame(failed).bodyOwner,'intruder');assert.equal(World.frame(failed).endingLock,'committed');
});
test('scene collision is enforced and large or malformed ticks are rejected',()=>{
 const a=World.create(config(defend(Runtime.initial(),'body'),{pose:{x:162,y:40,dir:2}}));for(let i=0;i<60;i++)World.step(a,.1,{x:1,y:0});assert.ok(a.avatar.x+10<176);
 assert.throws(()=>World.step(a,10,{x:0,y:0}),/INVALID_WORLD_STEP/);assert.throws(()=>World.step(a,.1,{x:2,y:0}),/INVALID_WORLD_STEP/);
});
test('instance replacement retains exact pose and authority in an independent state',()=>{
 const a=World.create(config(defend(Runtime.initial(),'body')));World.step(a,.1,{x:1,y:0});const b=World.create(World.replacement(a,2));
 assert.deepEqual(World.pose(a),World.pose(b));assert.deepEqual(a.authority,b.authority);assert.notEqual(a.avatar,b.avatar);assert.notEqual(a.grid,b.grid);assert.equal(b.generation,2);
 assert.throws(()=>World.replacement(a,8),/WORLD_GENERATION_MISMATCH/);assert.throws(()=>World.create({...config(),generation:33}),/INVALID_WORLD_CONFIG/);
});
test('a forged battle result and an unrelated or historical revision cannot change the world',()=>{
 const c=config(),a=World.create(c),bad=JSON.parse(JSON.stringify(c));bad.contract.checkpoint.expected.bodyOwner='player';assert.throws(()=>World.create(bad),/REPLAY_MISMATCH/);
 assert.throws(()=>World.sync(a,{mode:'battle',checkpoint:Runtime.checkpoint(Runtime.initial({battleId:'court-other'}))}),/WORLD_REVISION_MISMATCH/);
 const s=defend(Runtime.initial(),'body');World.sync(a,{mode:'battle',checkpoint:Runtime.checkpoint(s)});assert.throws(()=>World.sync(a,c.contract),/WORLD_REVISION_MISMATCH/);
});
test('ordinary story responses control the three objects independently',()=>{
 const a=World.create(config(undefined,{contract:{mode:'court',claimed:[false,false,false]}}));World.sync(a,{mode:'court',claimed:[true,false,false]});const f=World.frame(a);
 assert.equal(f.bodyOwner,'player');assert.equal(f.attribution,'claimed');assert.equal(f.endingLock,'pending');assert.throws(()=>World.sync(a,{mode:'court',claimed:[false,false,false]}),/WORLD_REVISION_MISMATCH/);
});
test('the finale exposes past geometry only after original authorization',()=>{
 const base={mode:'finale',node:'meta_state_2',step:0,intervening:false,rewritten:false},a=World.create(config(undefined,{scene:'meta',contract:base}));
 assert.equal(World.frame(a).narrative.authorizedPast,false);assert.equal(World.frame(a).events.some(e=>e.id==='past'),false);
 assert.throws(()=>World.sync(a,{...base,step:1}),/PAST_AUTHORITY_NOT_GRANTED/);
 World.sync(a,{...base,node:'meta_state_3',intervening:true});World.sync(a,{...base,node:'meta_prequel',intervening:true,step:3,rewritten:true});assert.equal(World.frame(a).narrative.rewritten,true);
 assert.throws(()=>World.sync(a,base),/WORLD_REVISION_MISMATCH/);
});
test('scene and mode cannot be substituted through a data message',()=>{
 assert.throws(()=>World.create(config(undefined,{scene:'meta'})),/WORLD_SCENE_MISMATCH/);const a=World.create(config());assert.throws(()=>World.sync(a,{mode:'court',claimed:[true,true,true]}),/WORLD_MODE_MISMATCH/);
 assert.throws(()=>World.create({...config(),source:'process.exit()'}),/INVALID_WORLD_CONFIG/);assert.throws(()=>World.create(config(undefined,{grid:['##','..']})),/INVALID_WORLD_GRID/);
});
test('zero world time preserves frame and a rejected contract leaves prior authority intact',()=>{
 const a=World.create(config()),before=World.frame(a);World.step(a,0,{x:1,y:1});assert.deepEqual(World.frame(a),before);
 assert.throws(()=>World.sync(a,{mode:'battle',checkpoint:{version:99}}));assert.deepEqual(World.frame(a),before);
});

test('the ending boundary is physical until its own claim is answered',()=>{
 let s=defend(Runtime.initial(),'body');const a=World.create(config(s));for(let i=0;i<30;i++)World.step(a,.1,{x:1,y:0});const constrained=a.avatar.x;assert.ok(constrained<=a.boundary.x+a.boundary.width-10);
 s=defend(s,'bad_owned');World.sync(a,{mode:'battle',checkpoint:Runtime.checkpoint(s)});for(let i=0;i<15;i++)World.step(a,.1,{x:1,y:0});assert.ok(a.avatar.x>constrained+20);assert.equal(World.frame(a).boundary.active,false);
});

test('occupation closes a new boundary around a body that had escaped the pending ending',()=>{
 let s=defend(Runtime.initial(),'body');s=defend(s,'bad_owned');const a=World.create(config(s));for(let i=0;i<20;i++)World.step(a,.1,{x:1,y:0});const x=a.avatar.x;
 while(s.outcome==='pending'){s=Runtime.resolveRound(s,{...Policy.make(s,'attribution'),reason_code:'NO_EVIDENCE'},Policy.intruder(s));World.sync(a,{mode:'battle',checkpoint:Runtime.checkpoint(s)});}
 assert.equal(a.avatar.x,x);assert.equal(a.authority.bodyOwner,'intruder');assert.ok(World.walkable(a,a.avatar.x,a.avatar.y));assert.doesNotThrow(()=>World.create(World.replacement(a,2)));
});
