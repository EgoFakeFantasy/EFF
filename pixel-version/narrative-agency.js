"use strict";

// Interactive interpretations of chapters 051, 057–059. Novel dialogue stays
// in its original scripts; these acts construct relationships, not new facts.
const NarrativeAgency = {
  open: false, focused: true, selected: 0, pair: [], pending: null,
  body: { held: [false,false,false,false], links: [] },
  self: { decisions: [-1,-1,-1,-1], order: [0,1,2,3] },
  history: [null,null,null], epilogue: { stage: 0, cuts: 0, cut: false, ties: [] },
  historyData: [
    { title:'定义之前', cause:'“我向你发起了战争”当且仅当我向你发起了战争。', premise:'把宣战句自身当作不可质疑的定义', consequence:'战争的成立被这句定义保证', actions:['回到定义之前，质疑这个定义','在同一显现场域拒绝它的必然性','只写下“敌人已经被消灭”'], error:'写一个胜利结论，仍然没有触动让战争成立的前提。' },
    { title:'幻海消息', cause:'那作老师的，曾经不就是在我们现在的位置实现了那些历史上的事情吗？', premise:'用关于老师与历史的消息保证当下的推论', consequence:'传来的知识被当作已知的保证', actions:['追问这些消息何时在幻海传播','保留这份证词，撤销它对当下的必然保证','将老师从全部历史中抹去'], error:'这份消息需要被追问；此处没有抹去老师及其全部历史的依据。' },
    { title:'分层之前', cause:'如果只是外部之真的延续，就如同前者所说，只是无聊的秩序互相覆盖的过程罢了。', premise:'把显现的争夺收束为朴素分层与秩序覆盖', consequence:'当前的反抗被收束为无能为力的谎言', actions:['回到分层之前，拒绝这种收束','守住显现场域，阻止层级替代争夺','去更高的一层宣布胜利'], error:'继续向外攀登仍在延续同一套分层，原文已经拒绝了这条解释。' },
  ],
  fragments: ['面容的碎片','伸出的手臂','胸膛的碎片','挣开的双腿'],
  memories: [
    { title:'十八岁的身体', quote:'我是……是了，我是周防。', area:'house_empty', at:[3,3], options:['承认：这是我曾经历的一个侧面','重释：这个身体不能穷尽我'], meanings:['把年轻身体纳入经历','拒绝把一副身体当作完整起源'] },
    { title:'归来的照片', quote:'从裤兜里掏出的，是已经变干的那片相片残片。', area:'garden', at:[12,9], options:['承认：这片归来的照片是我的线索','重释：我保留线索，仍不替四条腿命名'], meanings:['保留跨越场所的见证','保留照片，悬置照片之外的指认'] },
    { title:'血色庭院', quote:'不是这样的，这已经被我所发生了。', area:'blood', at:[12,8], options:['承认见闻，拒绝外来者替我归责','重释：这段遭遇不能替我写完一生'], meanings:['区分亲见的场景与强加的罪责','拒绝以这段遭遇收束我的结局'] },
    { title:'手心里的雨水', quote:'就算大多数从指缝漏过，也有些许被留在了手心。', area:'rain', at:[12,16], options:['承认：这是我亲自给出的回答','重释：失去的片段不等于完整的我'], meanings:['以自己的回答连接经历','承认不完整，并继续决定自身'] },
  ],

  init() {
    this.dom=Object.fromEntries(['agencyPanel','agencyHeading','agencyQuote','agencyCanvas','agencyCards','agencyActions','agencyStatus','agencySource','endingResearch'].map(id=>[id,document.getElementById(id)]));
    this.brush=this.dom.agencyCanvas.getContext('2d');this.brush.imageSmoothingEnabled=false;
    this.dom.endingResearch.addEventListener('click',()=>this.openEpilogue());
    window.addEventListener('blur',()=>{this.focused=false;this.checkpoint();});
    window.addEventListener('focus',()=>{this.focused=true;});
    window.addEventListener('pagehide',()=>this.checkpoint());
    document.addEventListener('visibilitychange',()=>this.checkpoint());
    document.addEventListener('keydown',event=>{
      if(!this.open||!['ArrowLeft','ArrowRight','e','E',' ','Enter'].includes(event.key))return;
      // Utilities retain native keyboard controls even while this act is open.
      if(event.target!==canvas&&!event.target?.closest?.('#agencyPanel'))return;
      if(this.paused()){event.preventDefault();event.stopImmediatePropagation();return;}
      if(event.repeat){event.preventDefault();event.stopImmediatePropagation();return;}
      if(event.target?.tagName==='BUTTON'){
        if(event.key==='e'||event.key==='E'){event.target.click();event.preventDefault();event.stopImmediatePropagation();}
        return; // Native Enter/Space activates the focused control.
      }
      const buttons=[...this.dom.agencyCards.children].filter(b=>b.tagName==='BUTTON'&&!b.disabled);
      if(event.key.startsWith('Arrow')&&buttons.length){this.selected=(this.selected+(event.key==='ArrowLeft'?buttons.length-1:1))%buttons.length;buttons[this.selected].focus({preventScroll:true});}
      else this.dom.agencyActions.querySelector('button:not([disabled])')?.focus({preventScroll:true});
      event.preventDefault();event.stopImmediatePropagation();
    },{capture:true});
  },

  active() { return this.open; },
  paused() { return !this.focused||document.hidden||Boolean(Expedition.dom?.journalDialog.open||Expedition.dom?.settingsDialog.open||document.getElementById('renameDialog')?.open||!ui.codex.hidden||!ui.start.hidden); },
  beforeAdvance() {
    if(this.open)return true;
    if(currentDialogScript===SCRIPTS.rainMemory&&currentFullText().includes('这似乎是个死局')&&!F.agencyBody){this.pending={kind:'body'};this.show();this.checkpoint();return true;}
    if(Finale.active()&&Finale.node()==='ending'&&currentFullText().includes('我的过往由我对他们重新的编排')&&!F.agencySelf){this.pending={kind:'self'};this.show();this.checkpoint();return true;}
    return false;
  },

  beginHistory(option) {
    if(!Finale.intervening()||option.step!==Finale.step()+1)return false;
    this.pending={kind:'history',step:option.step,stage:0,method:-1};this.show();this.checkpoint();return true;
  },
  openEpilogue() {
    if(this.open||!F.finaleTrue||!ui.start.hidden||Expedition.paused())return;
    this.pending={kind:'epilogue'};this.show();this.checkpoint();
  },

  show() {
    this.open=true;clearInput();this.selected=0;this.pair=[];
    document.body.classList.add('agency-active');this.dom.agencyPanel.hidden=false;
    ui.dialog.inert=true;ui.ending.inert=true;this.paint();
    this.dom.agencyPanel.scrollTop=0;(this.dom.agencyCards.querySelector('button')||this.dom.agencyActions.querySelector('button:not([disabled])'))?.focus({preventScroll:true});
    Expedition.sync();
  },
  dismiss() {
    this.open=false;document.body.classList.remove('agency-active');
    if(this.dom)this.dom.agencyPanel.hidden=true;
    ui.dialog.inert=false;ui.ending.inert=false;clearInput();Expedition.sync();
  },
  reset() {
    this.dismiss();this.pending=null;this.body={held:[false,false,false,false],links:[]};this.self={decisions:[-1,-1,-1,-1],order:[0,1,2,3]};this.history=[null,null,null];this.epilogue={stage:0,cuts:0,cut:false,ties:[]};this.pair=[];
  },
  onEnding() {
    this.dismiss();if(this.pending?.kind!=='epilogue')this.pending=null;
    if(this.dom)this.dom.endingResearch.hidden=!F.finaleTrue;
  },

  button(text,fn,parent=this.dom.agencyActions,className='') {
    const b=document.createElement('button');b.type='button';b.textContent=text;b.className=className;
    const revision=this.revision;
    b.addEventListener('click',event=>{
      event.stopPropagation();if(!this.open||this.paused()||revision!==this.revision)return;
      fn();
      if(this.open&&!this.dom.agencyPanel.contains?.(document.activeElement)){
        const replacement=[...this.dom.agencyCards.children,...this.dom.agencyActions.children].find(el=>el.tagName==='BUTTON'&&el.textContent===text&&!el.disabled);
        (replacement||this.dom.agencyActions.querySelector('button:not([disabled])')||this.dom.agencyCards.querySelector('button'))?.focus({preventScroll:true});
      }
    });parent.append(b);return b;
  },
  status(text) { this.dom.agencyStatus.textContent=text; },
  paint() {
    const kind=this.pending?.kind;if(!kind||!this.dom)return;
    this.revision=(this.revision||0)+1;this.dom.agencyPanel.dataset.kind=kind;
    this.dom.agencyCards.replaceChildren();this.dom.agencyActions.replaceChildren();
    this.dom.agencyQuote.textContent='';this.dom.agencyStatus.textContent='';
    this.dom.agencySource.textContent=kind==='body'?'正文 057 · 回答与合一':kind==='history'?'正文 058 · 无意识介入之后':kind==='self'?'正文 051、054–058 · 自己决定过往的归属':'正文 059 · 研究院档案';
    if(kind==='body')this.paintBody();else if(kind==='history')this.paintHistory();else if(kind==='self')this.paintSelf();else this.paintEpilogue();
    this.draw(performance.now());
  },

  connected() {
    const reached=new Set([0]);let old=-1;
    while(old!==reached.size){old=reached.size;for(const [a,b] of this.body.links){if(reached.has(a))reached.add(b);if(reached.has(b))reached.add(a);}}
    return this.body.held.every(Boolean)&&reached.size===4;
  },
  selectFragment(index) {
    if(!this.open||this.paused()||this.pending.kind!=='body')return;
    this.selected=index;
    if(this.body.held.every(Boolean)){if(this.pair.includes(index))this.pair=this.pair.filter(v=>v!==index);else this.pair=[...this.pair.slice(-1),index];}
    this.paint();
  },
  reclaim() {
    if(!this.open||this.paused()||this.pending.kind!=='body')return;
    this.body.held[this.selected]=true;this.paint();this.status('这一组由你的回答牵回。枯手无法替它决定归属。');this.checkpoint();
  },
  connect() {
    if(!this.open||this.paused()||this.pending.kind!=='body'||this.pair.length!==2)return;
    const edge=[...this.pair].sort((a,b)=>a-b);
    if(!this.body.links.some(([a,b])=>a===edge[0]&&b===edge[1]))this.body.links.push(edge);
    this.pair=[];this.paint();this.status(this.connected()?'四组碎片已经相互联系。由你把它们合而为一。':'联系已建立；继续让每一组都能抵达其他片段。');this.checkpoint();
  },
  paintBody() {
    const held=this.body.held.filter(Boolean).length;
    this.dom.agencyHeading.textContent='裂开的身体 · '+(held<4?'牵回片段':'建立同一的联系');
    this.dom.agencyQuote.textContent='“这就是我的答案。”\n无数道裂痕贯穿了身体。枯手从黑暗中伸来，要抓向那些碎片。\n把散落的碎片牵回四组，再让它们重新相通。';
    this.fragments.forEach((name,i)=>{const b=this.button((this.body.held[i]?'已牵回 · ':'未定 · ')+name,()=>this.selectFragment(i),this.dom.agencyCards);b.classList.toggle('selected',held<4?i===this.selected:this.pair.includes(i));b.setAttribute('aria-pressed',String(held<4?i===this.selected:this.pair.includes(i)));});
    if(held<4){this.button('以自己的回答牵回这一组',()=>this.reclaim());this.button('让枯手替我决定去向',()=>{this.status('那会让归属重新落入他者之手。你仍可用自己的回答牵回这一组。');});this.status('选择一组，再以自己的回答将它牵回。无需抢读；片段可以按任意顺序取回。');}
    else if(!this.connected()){const b=this.button('连接选中的两组',()=>this.connect());b.disabled=this.pair.length!==2;this.status('选择两组建立联系。连接方式由你决定；每一组都需要与整体相通。');}
    else this.button('由我把这些片段合而为一',()=>{F.agencyBody=true;this.dismiss();this.checkpoint();advanceDialog();Expedition.focusGameplay();});
  },

  paintHistory() {
    const p=this.pending,d=this.historyData[p.step-1];this.dom.agencyHeading.textContent='回到过去 · '+d.title;
    this.dom.agencyQuote.textContent=d.cause;
    if(p.stage===0){
      this.status('选择支撑这句结论的前提。先改变联系，再让过程返回现在。');
      [d.premise,'只让最后一句胜利宣言更强','把整个战场移到更外面'].forEach((text,i)=>this.button(text,()=>{if(i!==0){this.status('这仍在改结论或位置，尚未找到这句话所依赖的前提。');return;}p.stage=1;this.paint();this.checkpoint();},this.dom.agencyCards));
    }else if(p.stage===1){
      this.addRecord('原先的前提',d.premise);this.addRecord('由它收束的过程',d.consequence);
      d.actions.forEach((text,i)=>this.button(text,()=>{if(i===2){this.status(d.error);return;}p.method=i;p.stage=2;this.paint();this.checkpoint();}));
      this.status('旧过程保留在画面上。选择你如何触动这个前提。');
    }else{
      const id=p.step<3?'meta_1':'meta_state_3',reveal=FinaleScenes[id].retroactiveReveals.find(r=>r.step===p.step).text[0];
      this.addRecord('原先的保证',d.premise);this.addRecord('你触动联系的方式',d.actions[p.method]);this.addRecord('写入过去的原文',Finale.text(reveal),'recovered');
      this.status('前提受到质疑，旧结论不再能以原来的保证收束战斗。让这一过程返回现在。');
      this.button('让改写后的过程返回现在',()=>{
        const option=Finale.options(Finale.node()).find(o=>o.action==='unconsciousStep'&&o.step===p.step);
        if(!option){this.status('这处锚点尚未被原文开放。');return;}
        this.history[p.step-1]={method:p.method};this.pending=null;this.dismiss();
        Finale.act({...option,agencyApproved:true});this.checkpoint();
      });
    }
  },
  addRecord(label,text,className='') {
    const box=document.createElement('div');box.className='agency-record '+className;
    const h=document.createElement('strong');h.textContent=label;const p=document.createElement('p');p.textContent=text;box.append(h,p);this.dom.agencyCards.append(box);
  },

  paintSelf() {
    this.dom.agencyHeading.textContent='我决我 · 编排自己的过往';
    this.dom.agencyQuote.textContent='“我已经不再是那个历史中的存在了。但正因为如此，我是他们共同的超越。”';
    this.self.order.forEach((id,pos)=>{const m=this.memories[id],decision=this.self.decisions[id];const b=this.button((pos+1)+' · '+m.title+(decision<0?' · 未决定':' · '+(decision===0?'承认':'重释')),()=>{this.selected=id;this.paint();},this.dom.agencyCards);b.classList.toggle('selected',id===this.selected);b.setAttribute('aria-pressed',String(id===this.selected));});
    const m=this.memories[this.selected];this.status(m.quote+(this.self.decisions[this.selected]>=0?'\n你的决定：'+m.meanings[this.self.decisions[this.selected]]:'\n选择这段过往怎样参与自身；也可以调整讲述它们的次序。'));
    m.options.forEach((text,i)=>this.button(text,()=>{this.self.decisions[this.selected]=i;this.paint();this.checkpoint();}));
    this.button('交给先于我的某物定论',()=>this.status('这份安排仍是他者替你决定。你可以承认自己的经历，也可以重新界定它的意义。'));
    this.button('将这一段向前编排',()=>this.reorder(-1));this.button('将这一段向后编排',()=>this.reorder(1));
    if(this.self.decisions.every(d=>d>=0))this.button('由我决定这些过往如何构成自身',()=>{
      F.agencySelf=true;this.review=this.self.order.map(id=>this.memories[id].title+'：'+this.memories[id].meanings[this.self.decisions[id]]).join('\n');
      Expedition.journal.push({area:'无垠之萍 · 本轮自我编排',speaker:G.protagonistName||'周防',text:this.review});
      try{localStorage.setItem(Expedition.journalKey,JSON.stringify(Expedition.journal.slice(-300)));}catch{}
      this.dismiss();this.checkpoint();advanceDialog();Expedition.focusGameplay();
    });
  },
  reorder(direction) {
    const i=this.self.order.indexOf(this.selected),j=i+direction;if(j<0||j>3)return;
    [this.self.order[i],this.self.order[j]]=[this.self.order[j],this.self.order[i]];this.paint();this.checkpoint();
  },

  paintEpilogue() {
    const e=this.epilogue;this.dom.agencyHeading.textContent=['螺旋之后 · 我与非我','剪断与重系','研究院 · 新的课题'][e.stage];
    this.dom.agencyQuote.textContent=AgencyEpilogue[e.stage].join('\n');
    if(e.stage===0)this.button('继续看见剪断与重系',()=>{e.stage=1;this.paint();this.checkpoint();});
    else if(e.stage===1){
      this.status(e.cuts>=3?'三次联系都已经剪断、重系。继续查看研究院留下的课题。':'第 '+(e.cuts+1)+' 次：'+(e.cut?'联系已经剪开，重新选择如何系起。':'丝带系起；试着剪开原来的联系。'));
      if(e.cuts<3){if(!e.cut)this.button('咔嚓 · 剪开原来的联系',()=>{e.cut=true;this.paint();this.checkpoint();});else{this.button('沿另一侧再度系起',()=>this.tie(0));this.button('交叉片段，再度系起',()=>this.tie(1));}}
      if(e.cuts>=3)this.button('查看研究院新课题',()=>{e.stage=2;this.paint();this.checkpoint();});
    }else{this.status('这段旅程留下了新的问题。档案记下的是继续研究的起点。');this.button('保存档案，回到无垠之萍',()=>{F.agencyEpilogue=true;this.returnToEnding();});}
    this.button('暂时回到结局',()=>this.returnToEnding());
  },
  returnToEnding() {
    this.pending=null;this.dismiss();
    if (ui.ending.hidden && F.finaleTrue) Finale.terminal();
    this.checkpoint();Expedition.focusGameplay();
  },
  tie(method) { this.epilogue.ties.push(method);this.epilogue.cut=false;this.epilogue.cuts++;this.paint();this.checkpoint(); },

  draw(now) {
    if(!this.open||!this.brush)return;const c=this.brush,kind=this.pending.kind;
    c.fillStyle='#0a1120';c.fillRect(0,0,320,128);
    if(kind==='body'){
      // Broken tower edges and rain mist frame a body that has no floor.
      c.fillStyle='#141c29';c.fillRect(0,0,17,128);c.fillRect(303,0,17,128);
      for(let y=0;y<128;y+=16){c.fillStyle='#253040';c.fillRect(1,y,14,1);c.fillRect(305,y+7,14,1);}
      for(let y=3;y<128;y+=9)for(let x=23+(y%3)*7;x<300;x+=29){c.fillStyle=(x+y)%2?'#18232e':'#1b202d';c.fillRect(x,y,1,4);}
      const positions=[[69,29],[238,28],[76,94],[236,94]];
      for(const [a,b] of this.body.links)this.line(c,...positions[a],...positions[b],'#76b5a9');
      for(let i=0;i<4;i++){
        const [x,y]=positions[i],held=this.body.held[i];
        c.fillStyle=held?'#203b41':'#322232';c.fillRect(x-23,y-18,46,34);
        c.fillStyle=held?'#9dd0bc':'#95637d';c.fillRect(x-24,y-19,48,1);
        // These are four playable groups of the novel's innumerable shards.
        // Every group displays a piece of the same detailed actor sprite.
        this.bodySprite ||= document.createElement('canvas');
        if(!this.bodySpriteReady){this.bodySprite.width=24;this.bodySprite.height=24;drawPerson(this.bodySprite.getContext('2d'),6,4,{pose:'wake',dir:0});this.bodySpriteReady=true;}
        const crops=[[7,3,11,7],[0,9,24,5],[8,10,8,6],[8,15,8,5]],crop=crops[i];
        c.drawImage(this.bodySprite,...crop,x-crop[2],y-crop[3],crop[2]*2,crop[3]*2);
        c.fillStyle=held?'#acccba':'#92728b';
        for(let j=0;j<4;j++)c.fillRect(x-17+j*9,y+14-(j%2),2,1);
        if(!held){c.fillStyle='#777d80';c.fillRect(x+(i%2?-37:22),y+6,15,3);c.fillRect(x+(i%2?-25:18),y+2,3,10);}
      }
      if(this.connected()){c.fillStyle='#97cfb5';c.fillRect(152,53,16,1);drawPerson(c,154,56,{glow:'#91cfb4'});}
      this.dom.agencyCanvas.setAttribute('aria-label','身体碎片分为四组；已牵回 '+this.body.held.filter(Boolean).length+' 片，已建立 '+this.body.links.length+' 条联系。');
    }else if(kind==='self'){
      this.drawMemory(c,this.selected);this.dom.agencyCanvas.setAttribute('aria-label','回看 '+this.memories[this.selected].title+' 的场景');
    }else if(kind==='history'){
      PixelArt.languageGround(c);PixelArt.crystal(c,256,27,23);drawPerson(c,40,83,{dir:2});PixelArt.writingPresence(c,273,72);PixelArt.writingPresence(c,152,9,true);
      const stage=this.pending.stage;this.line(c,60,94,266,94,stage===2?'#78baa6':'#b06d82');
      if(stage>0){c.fillStyle='#98bfae';c.fillRect(93,82,2,20);c.fillRect(104,83,40,1);}
      if(stage===2){c.fillStyle='#0a1120';c.fillRect(173,90,15,8);this.line(c,145,83,216,68,'#9bcebb');}
      this.dom.agencyCanvas.setAttribute('aria-label','过去的 '+this.historyData[this.pending.step-1].title+'：'+(stage===2?'前提被质疑，新过程即将返回现在':'旧前提仍在支撑结论'));
    }else{
      PixelArt.moon(c,160,24,16);const e=this.epilogue;
      for(let i=0;i<4;i++){const x=42+i*75;c.fillStyle=i%2?'#a989af':'#88b9b3';c.fillRect(x,78,12,18);if(i<3&&!(e.cut&&i===e.cuts)){const crossed=e.ties[i]===1;this.line(c,x+12,82,x+75,crossed?96:82,'#bdada0');this.line(c,x+12,94,x+75,crossed?80:94,'#728f9a');}}
      if(e.cut){const x=86+75*e.cuts;c.fillStyle='#e0c5aa';c.fillRect(x-2,81,2,14);c.fillRect(x+1,80,2,16);}
      if(e.stage===2)PixelArt.crystal(c,160,82,25);
      this.dom.agencyCanvas.setAttribute('aria-label','丝带'+(e.cut?'已剪开':'系起')+'，已完成 '+e.cuts+' 次剪断与重系。');
    }
  },
  line(c,x,y,nx,ny,col) { c.fillStyle=col;const steps=Math.max(1,Math.ceil(Math.max(Math.abs(nx-x),Math.abs(ny-y))));for(let i=0;i<=steps;i++)c.fillRect(Math.round(x+(nx-x)*i/steps),Math.round(y+(ny-y)*i/steps),1,1); },
  drawMemory(c,index) {
    const m=this.memories[index],map=MAPS[m.area];this.scenes||=new Map();
    if(!this.scenes.has(m.area)){
      const surface=document.createElement('canvas');surface.width=map.grid[0].length*TILE;surface.height=map.grid.length*TILE;const b=surface.getContext('2d');b.imageSmoothingEnabled=false;
      for(let y=0;y<map.grid.length;y++)for(let x=0;x<map.grid[y].length;x++)drawTile(b,map.grid[y][x],x,y,map,0);
      this.scenes.set(m.area,surface);
    }
    const cam={x:Math.round(Math.max(0,Math.min(map.grid[0].length*TILE-320,m.at[0]*TILE-160))),y:Math.round(Math.max(0,Math.min(map.grid.length*TILE-128,m.at[1]*TILE-64)))};
    c.drawImage(this.scenes.get(m.area),cam.x,cam.y,320,128,0,0,320,128);PixelArt.sceneProps(c,map,cam);
    drawPerson(c,m.at[0]*TILE+3-cam.x,m.at[1]*TILE+2-cam.y,{blood:m.area==='blood',heldHeart:false,dir:0,pose:index===1?'photo':'stand'});
    if(index===2){c.save();c.translate(13*TILE+8-cam.x,7*TILE+8-cam.y);c.rotate(Math.PI/2);drawPerson(c,-6,-8,{coat:'#603345',hair:'#211318',skin:'#aa8278',dead:true});c.restore();}
  },
  render(now) { if(!this.open)return false;this.draw(now);return true; },

  canCheckpoint() { return Boolean((this.open||this.allowSave)&&(!transitionLock||this.pending?.kind==='epilogue'||endingId)); },
  checkpoint() { if(this.resuming)return;this.allowSave=true;try{saveRun(true);}finally{this.allowSave=false;} },
  snapshot() { return {version:1,pending:this.pending,body:this.body,self:this.self,history:this.history,epilogue:this.epilogue}; },
  restore(value) {
    this.open=false;this.pending=null;this.body={held:[false,false,false,false],links:[]};this.self={decisions:[-1,-1,-1,-1],order:[0,1,2,3]};this.history=[null,null,null];this.epilogue={stage:0,cuts:0,cut:false,ties:[]};
    if(!value||value.version!==1)return;
    const integer=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
    if(value.body&&Array.isArray(value.body.held)&&value.body.held.length===4&&value.body.held.every(b=>typeof b==='boolean')&&Array.isArray(value.body.links)){
      this.body.held=[...value.body.held];this.body.links=value.body.links.slice(0,6).filter(e=>Array.isArray(e)&&e.length===2&&integer(e[0],0,3)&&integer(e[1],0,3)&&e[0]<e[1]&&this.body.held[e[0]]&&this.body.held[e[1]]).map(e=>[...e]);
      this.body.links=this.body.links.filter((e,i,all)=>all.findIndex(x=>x[0]===e[0]&&x[1]===e[1])===i);
    }
    if(value.self&&Array.isArray(value.self.decisions)&&value.self.decisions.length===4&&value.self.decisions.every(d=>integer(d,-1,1))&&Array.isArray(value.self.order)&&value.self.order.length===4&&new Set(value.self.order).size===4&&value.self.order.every(n=>integer(n,0,3)))this.self={decisions:[...value.self.decisions],order:[...value.self.order]};
    if(Array.isArray(value.history)&&value.history.length===3)this.history=value.history.map(h=>h&&integer(h.method,0,1)?{method:h.method}:null);
    if(value.epilogue&&integer(value.epilogue.stage,0,2)&&integer(value.epilogue.cuts,0,3)&&typeof value.epilogue.cut==='boolean')this.epilogue={stage:value.epilogue.stage,cuts:value.epilogue.cuts,cut:value.epilogue.cuts<3&&value.epilogue.cut,ties:Array.from({length:value.epilogue.cuts},(_,i)=>value.epilogue.ties?.[i]===1?1:0)};
    const p=value.pending;
    if(!p||typeof p!=='object')return;
    if(p.kind==='body'&&G.area==='rain'&&!F.rainMemory)this.pending={kind:'body'};
    else if(p.kind==='self'&&G.area==='meta'&&F.finaleRewritten&&G.counters.finaleNode===8&&!F.finaleTrue)this.pending={kind:'self'};
    else if(p.kind==='history'&&G.area==='meta'&&F.finaleSummoned&&!F.finaleRewritten&&integer(p.step,1,3)&&p.step===(G.counters.finaleStep||0)+1&&integer(p.stage,0,2)&&integer(p.method,-1,1)&&(p.stage<2||p.method>=0))this.pending={kind:'history',step:p.step,stage:p.stage,method:p.method};
    else if(p.kind==='epilogue'&&G.area==='meta'&&F.finaleTrue)this.pending={kind:'epilogue'};
  },
  resume() {
    if(!this.pending)return false;const kind=this.pending.kind;this.resuming=true;
    try{
      if(kind==='body'){playScript('rainMemory');dialogIndex=SCRIPTS.rainMemory.lines.findIndex(l=>l.t.includes('这似乎是个死局'));renderLine();if(F.agencyBody){dialogIndex++;renderLine();return true;}}
      else if(kind==='self'){G.counters.finaleFrom=0;Finale.enter();dialogIndex=Finale.raw.findIndex(l=>Finale.text(l).includes('我的过往由我对他们重新的编排'));renderLine();if(F.agencySelf){dialogIndex++;renderLine();return true;}}
      else if(kind==='history')Finale.enter();
      this.show();return true;
    }finally{this.resuming=false;}
  },
};

const AgencyEpilogue = [
  [
    "从什么地方出发了?",
    "在没有地方消失了?",
    "无尽向上螺旋的高塔，天空上血红色的月亮",
    "无尽向下螺旋的高塔，地底那积着雨水的黄昏",
    "不是由我开始的?",
    "不是由我开始的?",
    "不是由我结束的?",
    "不是由我结束的?",
    "非我-我",
    "非(非我-我)",
    "非(非(非我-我)-我)",
    "非(非(非(非我-我)-我)-我)",
    "...",
    "我-非我-...",
    "...",
    "某物在无中打孔",
    "它扭转着，挣扎着",
    "有什么要被问出，然而问题却自我崩解了",
    "就算是这样，任然不愿止步于此",
    "这也是[自身]所选择的道路",
    "因而，怪异被发生了，在螺旋的打转中，被凿穿了的，到底是哪一测呢?",
    "不知不觉中，我们已经跨越了从来没有过的地方了啊。",
    "1-2，于是-1被给出"
  ],
  [
    "丝带系起",
    "咔嚓，剪刀剪下",
    "1-2，于是-1'被给出",
    "丝带系起",
    "咔嚓，剪刀剪下",
    "1-2，于是?被给出",
    "...",
    "第一次被完成的，是以进入思想的内容来声明的",
    "第二次被完成的，是以进入思想的那内容与它那不可见的晦暗来完成的",
    "于是，物得以建立。于是，思想的对象也容纳了它的反转。",
    "我们一直在后退，因此反而得以看见那对我们无动于衷的傲慢与冷漠。不过，那到底是谁的傲慢呢? 那到底是谁的冷漠呢?",
    "其实我们早就知道了吧，作为舞台上的演员，我们演出了什么样的怪物。我们竟然把我们自己都无法窥见的东西演绎了出来，因此它反而借助我们完成了它的出场。剧团主，你究竟在让我们演绎怎么样的一出戏剧呢?"
  ],
  [
    "...",
    "我决我",
    "真灵不灭",
    "真之生物",
    "证明之骨架，命题之结缔，符号之血肉",
    "无垠之萍，无源者。",
    "我-非我之X-我",
    "于是在故事的尽头，新的东西被设下了，而后，光芒再度亮起...",
    "课题更新：研究院档案记录",
    "类型：贪婪之环碎片解剖(实数子集)研究",
    "课题：无穷游戏-已然决定的胜利",
    "研究员：临时编外人员一人，虚妄道祖，弃命道祖，柏拉图组长，...",
    "地点：猫岛，理型界",
    "..."
  ]
];
