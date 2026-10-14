"use strict";
const RepressionUI={open:false,focused:true,busy:false,operation:0,goal:'body',mode:'will',draft:null,pair:null,
 active(){return this.open;},
 paused(){return ScreenTheatre.active()||!this.focused||document.hidden||Boolean(Expedition.dom?.journalDialog.open||Expedition.dom?.settingsDialog.open||!ui.codex.hidden);},
 init(){
  EFFLocal.init();if(!BattleEventAdapter.available())return;
  const button=document.createElement('button');button.type='button';button.id='techButton';button.textContent='现象战争';button.addEventListener('click',()=>this.show());document.querySelector('.top-actions').append(button);
  const preview=document.createElement('button');preview.id='spectaclePreview';preview.type='button';preview.textContent='撕裂演出预览';preview.addEventListener('click',()=>{if(!ScreenTheatre.active())void ScreenTheatre.preview();});document.querySelector('.top-actions').append(preview);
  const panel=document.createElement('dialog');panel.id='repressionPanel';panel.className='repression-panel';
  panel.innerHTML=`<header class="tech-head"><div><p class="tech-kicker">EFF / 现象战争 · 实验解释</p><h2 id="techIdentity">防御提示</h2></div><div class="tech-head-actions"><button id="techPreview" type="button">撕裂演出预览</button><button id="techClose" type="button">回到场景</button></div></header>
   <p id="techScope" class="tech-scope"></p><p id="techBudget" class="tech-budget"></p><canvas id="techCanvas" width="640" height="384" tabindex="0" data-world-viewport="battle" aria-label="血色庭院的身体、归责与结局争夺"></canvas><div class="world-input"><p id="techWorldStatus" role="status">正在展开血色庭院。点击庭院，用 WASD 或方向键感受操控链。</p><button id="techWorldRecover" type="button" hidden>从检查点接续</button><div class="world-pad" aria-label="庭院移动"><button type="button" data-world-key="w" aria-label="向上移动">↑</button><button type="button" data-world-key="a" aria-label="向左移动">←</button><button type="button" data-world-key="s" aria-label="向下移动">↓</button><button type="button" data-world-key="d" aria-label="向右移动">→</button></div></div>
   <div id="techState" class="tech-state" aria-live="polite"></div>
   <div class="tech-controls"><label>参与方式<select id="techMode"><option value="will">意志 · 选择目标</option><option value="cooperate">协作 · 审阅提案</option><option value="research">研究 · 自写规则</option></select></label><label>希望保留的现实<select id="techGoal"></select></label><label>提案风险<select id="techRisk"><option value="low">低</option><option value="medium">中</option></select></label></div>
   <div class="tech-draft"><p id="techExplanation"></p><label id="techEditorLabel" hidden>数据式提案<textarea id="techEditor" rows="9" spellcheck="false" maxlength="8192"></textarea></label><p id="techSource"></p><div id="techAgents" class="tech-agents" aria-live="polite"></div></div>
   <div class="tech-actions"><button id="techAnalyze" type="button">研究可用方案</button><button id="techSubmit" type="button" disabled>验证并执行这一轮</button><button id="techPreserve" type="button">先保全检查点</button><button id="techStop" type="button">停止本地 AI</button></div>
   <p id="techStatus" class="tech-status" role="status" aria-live="polite"></p>
   <details class="tech-trace"><summary>执行轨迹与事件证据</summary><pre id="techEvents"></pre><ol id="techTrace"></ol></details>
   <div id="techResult" class="tech-result"></div><p class="tech-foot">最多六轮。模型仅提出建议；仲裁器决定状态。历史回写仍属于原文中的无意识。</p>`;
  document.body.append(panel);this.dom=Object.fromEntries(['repressionPanel','techIdentity','techScope','techBudget','techCanvas','techState','techMode','techGoal','techRisk','techEditorLabel','techEditor','techExplanation','techSource','techAgents','techAnalyze','techSubmit','techPreserve','techStop','techStatus','techEvents','techTrace','techResult'].map(id=>[id,document.getElementById(id)]));
  WorldStage.domCanvas=this.dom.techCanvas;
  document.getElementById('techWorldRecover').addEventListener('click',async()=>{if(this.busy||!this.open)return;this.busy=true;try{const receipt=await WorldStage.recover();if(receipt.generation===BattleEventAdapter.engineGeneration+1)BattleEventAdapter.rebuildRuntime();this.status('世界实例已从最后确认的检查点接续。');}catch(e){this.status('未能接续：'+e.message);}finally{this.busy=false;this.paint();}});
  this.dom.techCanvas.addEventListener('pointerdown',()=>this.dom.techCanvas.focus({preventScroll:true}));
  for(const b of panel.querySelectorAll('[data-world-key]')){b.addEventListener('pointerdown',e=>{if(this.paused())return;WorldStage.input.add(b.dataset.worldKey);b.setPointerCapture(e.pointerId);e.preventDefault();});for(const name of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,()=>WorldStage.input.delete(b.dataset.worldKey));}
  for(const [value,g] of Object.entries(AgentPolicies.goals)){const o=document.createElement('option');o.value=value;o.textContent=g.name;this.dom.techGoal.append(o);}
  document.getElementById('techPreview').addEventListener('click',()=>{if(!this.busy&&!ScreenTheatre.active())void ScreenTheatre.preview();});
  document.getElementById('techClose').addEventListener('click',()=>this.dismiss());panel.addEventListener('cancel',event=>{event.preventDefault();this.dismiss();});
  this.dom.techGoal.addEventListener('change',()=>{this.goal=this.dom.techGoal.value;this.invalidate();if(this.mode==='research')this.prepare(AgentPolicies.make(BattleEventAdapter.state,this.goal),'手写规则起点');});
  this.dom.techRisk.addEventListener('change',()=>{this.invalidate();if(this.mode==='research')this.prepare(AgentPolicies.make(BattleEventAdapter.state,this.goal,'repression',this.dom.techRisk.value),'手写规则起点');});
  this.dom.techMode.addEventListener('change',()=>{this.mode=this.dom.techMode.value;this.invalidate();if(this.mode==='research')this.prepare(AgentPolicies.make(BattleEventAdapter.state,this.goal),'手写规则起点');});
  this.dom.techEditor.addEventListener('input',()=>{this.dom.techSubmit.disabled=this.busy||!this.dom.techEditor.value.trim()||BattleEventAdapter.state?.outcome!=='pending';});
  this.dom.techAnalyze.addEventListener('click',()=>this.analyze());this.dom.techSubmit.addEventListener('click',()=>this.submit());
  this.dom.techPreserve.addEventListener('click',()=>{if(this.canAct())this.run(AgentPolicies.preserve(BattleEventAdapter.state));});
  this.dom.techStop.addEventListener('click',()=>{this.invalidate();if(EFFLocal.native)void EFFLocal.native.modelConfigure({enabled:false,model:''});this.status('当前游戏请求已停止。不会停止你自己的 Ollama 服务。');this.paint();});
  window.addEventListener('blur',()=>{this.focused=false;if(this.open)BattleEventAdapter.save();});window.addEventListener('focus',()=>{this.focused=true;});
  window.addEventListener('pagehide',()=>{AgentBridge.cancel();if(this.open)BattleEventAdapter.save();});
  BattleEventAdapter.load();
  // Tools are available only in the separate edition. The normal game is untouched.
  const start=()=>{try{const lab=new URLSearchParams(location.search).get('lab');if(['training','showcase'].includes(lab))this.show();if(lab==='showcase'&&!this.showcased){this.showcased=true;void ScreenTheatre.preview();}}catch{}};
  ui.startButton.addEventListener('click',start);
 },
 canAct(){return this.open&&!this.paused()&&!this.busy&&BattleEventAdapter.state?.outcome==='pending';},
 show(){
  if(!this.dom||this.open||!ui.start.hidden||!ui.ending.hidden||transitionLock||NarrativeAgency.active()||NarrativeTrials.rainActive()||Expedition.paused())return;
  BattleEventAdapter.begin();void WorldStage.battle(BattleEventAdapter.state,BattleEventAdapter.engineGeneration).catch(e=>this.status("世界实例未能展开："+e.message));this.open=true;clearInput();ui.dialog.inert=true;this.dom.repressionPanel.showModal();this.invalidate();this.paint();
  this.dom.techAnalyze.focus({preventScroll:true});
  if(new URLSearchParams(location.search).get('lab')==='showcase'&&!this.showcased){this.showcased=true;void ScreenTheatre.preview();}
 },
 dismiss(){if(!this.dom)return;ScreenTheatre.cancel();this.operation++;AgentBridge.cancel();if(this.open)BattleEventAdapter.save();void WorldStage.close();this.open=false;this.busy=false;this.dom.repressionPanel.close();ui.dialog.inert=false;clearInput();lastT=performance.now();Expedition.focusGameplay();},
 invalidate(){ScreenTheatre.cancel();this.operation++;AgentBridge.cancel();this.busy=false;this.draft=null;this.pair=null;this.dom.techAgents.replaceChildren();this.dom.techSubmit.disabled=true;this.dom.techExplanation.textContent=AgentPolicies.goals[this.goal].explain;this.dom.techSource.textContent='选择目标后提出方案，再审阅和执行。';this.dom.techEditorLabel.hidden=this.mode==='will';this.dom.techEditor.value='';this.status('选择目标后提出方案；实验打开期间主线时间暂停。');},
 prepare(proposal,source,note=''){this.draft=proposal;this.dom.techEditor.value=JSON.stringify(proposal,null,2);this.dom.techSource.textContent='来源：'+source+'。'+note;this.dom.techSubmit.disabled=false;this.status('方案已准备。审阅后验证，不会自动执行。');},
 sourceLabel(side){return side?.source==='local-model'?'本地模型'+(side.model?' · '+side.model:''):side?.source==='manual'?'玩家规则':'规则模板';},
 showAgents(pair){
  this.dom.techAgents.replaceChildren();
  for(const [key,title] of [['player','守护侧'],['intruder','外来者']]){
   const side=pair[key];if(!side)continue;const card=document.createElement('section'),head=document.createElement('strong'),text=document.createElement('p'),detail=document.createElement('small');
   head.textContent=title+' / '+this.sourceLabel(side);text.textContent=(side.source==='local-model'?'模型策略解释：':'')+side.explanation;
   detail.textContent='拟议：'+side.proposal.action+' → '+side.proposal.target+(side.source==='local-model'?' · '+(side.elapsedMs/1000).toFixed(1)+' 秒':side.reason==='MODEL_DISABLED'?' · 模型关闭':' · 模型不可用或输出无效，已回退');
   card.append(head,text,detail);this.dom.techAgents.append(card);
  }
 },
 async analyze(){
  if(!this.canAct())return;const operation=++this.operation;this.busy=true;this.paint();this.status('双方正按同一快照依次规划；主线倒计时暂停，可以随时取消。');
  try{const pair=await AgentBridge.plan(BattleEventAdapter.state,this.goal,this.dom.techRisk.value);if(this.open&&this.operation===operation){this.pair=pair;this.prepare(pair.player.proposal,this.sourceLabel(pair.player),'双方草案均待本轮仲裁。');this.showAgents(pair);}}
  catch{if(this.operation===operation)this.status('提案请求已取消。');}
  finally{if(this.operation===operation){this.busy=false;if(this.open)this.paint();}}
 },
 submit(){if(!this.canAct())return;try{const proposal=this.mode==='will'?this.draft:PhenomenonRuntime.parse(this.dom.techEditor.value);if(!proposal){this.status('先提出一份方案。');return;}void this.run(proposal);}catch(e){this.status('提案未执行：'+e.message);}},
 async run(proposal){
  if(!this.canAct())return;const operation=++this.operation,s=BattleEventAdapter.state;this.busy=true;this.paint();let committed=false;
  try{
   let pair=this.pair;
   if(!pair||pair.battleId!==s.battleId||pair.revision!==s.revision){this.status('正在等待外来者独立规划；它看不到你这份尚未提交的规则。');pair=await AgentBridge.plan(s,this.goal,this.dom.techRisk.value,false);}
   if(!this.open||this.operation!==operation)return;
   if(BattleEventAdapter.state!==s)throw Error('STALE_REVISION');
   const player=pair.player&&JSON.stringify(pair.player.proposal)===JSON.stringify(proposal)?pair.player:{actor:'repression',source:'manual',model:'',elapsedMs:0,tokens:0,explanation:'玩家提交并审阅的有限规则。',proposal};
   const next=PhenomenonRuntime.resolveRound(s,proposal,pair.intruder.proposal);
   BattleEventAdapter.recordRound(next,player,pair.intruder);BattleEventAdapter.state=next;BattleEventAdapter.save();committed=true;
   await WorldStage.battle(next,BattleEventAdapter.engineGeneration);if(!this.open||this.operation!==operation)return;
   const cinema=await ScreenTheatre.round(next,async()=>{await WorldStage.rebuild();if(!this.open||this.operation!==operation)throw Error("WORLD_CANCELLED");const engine=BattleEventAdapter.rebuildRuntime();this.draft=null;this.pair=null;this.dom.techEditor.value='';this.dom.techAgents.replaceChildren();this.dom.techSource.textContent='合法检查点已重放，新的运行实例继续承载本轮回应。';this.paint();return engine;});
   if(!this.open||this.operation!==operation||cinema.cancelled)return;
   if(next.queue.length&&!next.queue.includes(this.goal)){this.goal=next.queue[0];this.dom.techGoal.value=this.goal;}this.invalidate();this.paint();const h=next.history.at(-1),p=h.verdicts[0];this.status((p.accepted?'受理：':'拒绝：')+(AgentPolicies.reasons[p.reason]||p.reason)+'。本轮双方：'+this.sourceLabel(player)+' / '+this.sourceLabel(pair.intruder));
  }catch(e){if(this.operation===operation)this.status((committed?'本轮已确认，世界呈现未能接续：':'仲裁未提交：')+e.message);}
  finally{if(this.operation===operation){this.busy=false;if(this.open)this.paint();}}
 },
 status(text){if(this.dom)this.dom.techStatus.textContent=text;},
 paint(){
  if(!this.open)return;const s=BattleEventAdapter.state;if(!s)return;
  this.dom.techIdentity.textContent=G.memories.includes('显意识边缘')?'压抑 · 防御分析':'防御提示 · 身份未揭示';
  this.dom.techScope.textContent=BattleEventAdapter.gate?'血色庭院的独立技术窗口 · 原文与剩余反抗时间暂停':'练习窗口 · 不改变当前位置、剧情或结局';
  this.dom.techState.replaceChildren();
  for(const [title,value] of [['身体执行权',s.bodyOwner==='player'?'由你回应':s.bodyOwner==='intruder'?'被占据':'仍在争夺'],['罪责归属',s.attribution==='rejected'?'强加指认已拒绝':'指认尚待回应'],['结局提交',s.endingLock==='uncommitted'?'强写请求已拒绝':s.endingLock==='committed'?'本轮失守':'请求尚未成立']]){const p=document.createElement('p'),b=document.createElement('strong');b.textContent=title;p.append(b,document.createTextNode(value));this.dom.techState.append(p);}
  this.dom.techAnalyze.disabled=this.busy||s.outcome!=='pending';this.dom.techSubmit.disabled=this.busy||!(this.mode==='will'?this.draft:this.dom.techEditor.value.trim())||s.outcome!=='pending';this.dom.techPreserve.disabled=this.busy||s.outcome!=='pending';
  this.dom.techEvents.textContent=s.events.slice(0,3).map(e=>e.id+' · '+e.payload.target+' · '+JSON.stringify(e.payload)).join('\n');this.dom.techTrace.replaceChildren();
  for(const h of s.history){const li=document.createElement('li'),receipt=BattleEventAdapter.receipts.find(r=>r.round===h.round);li.textContent=(receipt?'来源：'+this.sourceLabel(receipt.player)+' / '+this.sourceLabel(receipt.intruder)+'\n':'')+'第 '+h.round+' 轮 · '+h.verdicts.map(v=>(v.agent==='repression'?'守护侧':'外来者')+(v.accepted?'受理：':'拒绝：')+(AgentPolicies.reasons[v.reason]||v.reason)).join(' / ')+'\n身体 '+h.before.bodyOwner+' → '+h.after.bodyOwner+'；归责 '+h.before.attribution+' → '+h.after.attribution+'；结局 '+h.before.endingLock+' → '+h.after.endingLock;this.dom.techTrace.append(li);}
  this.dom.techResult.replaceChildren();
  this.dom.techBudget.textContent='回合 '+s.round+' / '+s.maxRounds+' · 版本 '+s.revision+' · 未回应的压力 '+s.pressure+' · 运行实例 '+BattleEventAdapter.engineGeneration;
  if(s.outcome!=='pending'){
   const text=document.createElement('p');text.textContent=s.outcome==='won'?'三项目标分别成立。实验记录：tech_court_guarded。回到原文继续逐项回应，不跳过正文。':'本轮预算耗尽或明确认输。实验记录：tech_court_occupied。它不会替你自动决定主线。';this.dom.techResult.append(text);
   if(!BattleEventAdapter.gate){const again=document.createElement('button');again.type='button';again.textContent='开始新的练习';again.addEventListener('click',()=>{if(this.paused())return;BattleEventAdapter.state=null;BattleEventAdapter.begin();void WorldStage.battle(BattleEventAdapter.state,BattleEventAdapter.engineGeneration).catch(()=>{});this.invalidate();this.paint();});this.dom.techResult.append(again);}
   if(BattleEventAdapter.gate&&!BattleEventAdapter.applied){const b=document.createElement('button');b.type='button';b.textContent=s.outcome==='won'?'回到周防的原文回应':'接受本轮失守 · 被外来者占据';b.addEventListener('click',()=>{if(!this.paused())BattleEventAdapter.commitOutcome(s.outcome==='lost');});this.dom.techResult.append(b);}
  }
  document.getElementById('techWorldStatus').textContent=s.bodyOwner==='player'?'身体已回应：点击庭院，用 WASD 或方向键移动。归责与结局仍分别核验。':'操控链正被外来者牵引。先回应身体执行资格，再试着移动。';
 }
};
