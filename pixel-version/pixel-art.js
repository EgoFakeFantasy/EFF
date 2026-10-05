"use strict";

// All art is drawn on integer pixels. Portraits are interpretations, not new
// claims about a disembodied voice's physical appearance.
const PixelArt = {
  init() {
    this.frame = document.getElementById("portraitFrame");
    this.canvas = document.getElementById("speakerPortrait");
    this.context = this.canvas.getContext("2d");
    this.context.imageSmoothingEnabled = false;
  },

  profile(line) {
    const speaker = line?.s;
    if (!speaker || ["故事状态", "旁白"].includes(speaker)) return null;
    const role = speaker === "？？？" ? "unknown" : speaker === "周防" ? "zhou" : speaker === "父亲" ? "father" : speaker === "母亲" ? "mother" : speaker === "妹妹" ? "sister" : ["压抑", "无意识", "旅伴", "浑黑的身影"].includes(speaker) ? "shadow" : ["外来者", "背景"].includes(speaker) ? "intruder" : null;
    if (!role) return null;
    return { role, blood: role === "zhou" && G.area === "blood", young: ["house_empty", "house_family", "blood"].includes(G.area), tense: G.area === "blood" || !!line.rewrite, shouting: /拽入深渊|绝不可能/.test(line.t || ""), speaker };
  },

  onLine(line) {
    const profile = this.profile(line);
    this.frame.hidden = !profile || ui.dialog.dataset.presentation === "takeover";
    ui.dialog.classList.toggle("with-portrait", !this.frame.hidden);
    if (this.frame.hidden) return;
    this.frame.dataset.role = profile.role;
    this.canvas.setAttribute("aria-label", profile.role === "unknown" ? "身份不明的说话者" : profile.role === "shadow" || profile.role === "intruder" ? profile.speaker + "的象征像" : profile.speaker + (profile.blood ? "，脸颊与衣服沾有血迹" : "的头像"));
    this.portrait(this.context, profile);
  },

  // Scanline rasterization avoids antialiased edges in the larger busts.
  polygon(c, points, color) {
    c.fillStyle = color;
    const low = Math.floor(Math.min(...points.map(p => p[1]))), high = Math.ceil(Math.max(...points.map(p => p[1])));
    for (let y = low; y < high; y++) {
      const intersections = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a[1] <= y + .5 && b[1] > y + .5) || (b[1] <= y + .5 && a[1] > y + .5)) intersections.push(a[0] + (y + .5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) c.fillRect(Math.ceil(intersections[i]), y, Math.floor(intersections[i + 1]) - Math.ceil(intersections[i]) + 1, 1);
    }
  },

  portrait(c, p) {
    const r = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
    const poly = (points, color) => this.polygon(c, points, color);
    c.clearRect(0, 0, 64, 80);
    const accent = p.blood ? '#9c5360' : p.role === 'intruder' ? '#b57583' : p.role === 'shadow' ? '#8faea4' : '#9aabc2';
    r(0,0,64,80,'#080d15');
    for (let y = 5; y < 76; y++) {
      const inset = y < 12 ? 12-y : 3;
      r(inset,y,64-inset*2,1,y < 29 ? '#202b3b' : y < 53 ? '#192330' : '#121b28');
      if (y % 4 === 0) for(let x=7;x<57;x+=4) if((x+y)%12===3) r(x,y,1,1,'#293547');
    }
    r(7,3,47,1,'#5b6878'); r(3,7,1,64,'#3e4b5c'); r(60,9,1,64,'#1c293a');
    for(const [x,y] of [[3,3],[57,3],[3,73],[57,73]]) { r(x,y,4,1,accent);r(x,y,1,4,accent); }
    if (p.role === 'unknown') {
      for(let y=0;y<39;y++){const w=Math.round(Math.sqrt(Math.max(0,380-(y-19)**2)));r(32-w,20+y,w*2,1,'#263345');}
      for(let y=0;y<35;y++){const w=Math.round(Math.sqrt(Math.max(0,305-(y-17)**2)));r(32-w,22+y,w*2,1,'#131e2c');}
      const glyph=['01110','11011','00011','00110','00100','00000','00100'];
      for(let y=0;y<glyph.length;y++)for(let x=0;x<5;x++)if(glyph[y][x]==='1')r(25+x*3,28+y*3,3,3,'#aabaca');
      r(24,65,16,1,'#536174');r(30,68,4,1,'#85939f');return;
    }
    if (p.role === 'intruder') {
      // A broken surface carrying writing, not a disclosed human face.
      poly([[17,16],[36,9],[30,33],[12,44]],'#553b51');
      poly([[38,13],[51,24],[48,48],[33,38]],'#745164');
      poly([[14,47],[31,36],[29,66],[19,70]],'#3a3448');
      poly([[35,41],[51,52],[44,70],[31,64]],'#593f54');
      for(let i=0;i<12;i++){const x=19+i%3*7,y=23+i*3;r(x,y,4+i%2*3,1,i%3?'#bc8390':'#e0b8b2');}
      r(32,18,1,18,'#e8c5ba');r(30,36,1,13,'#b97181');r(28,49,1,16,'#b97181');
      for(const [x,y] of [[11,28],[51,17],[8,56],[51,66],[38,74]])r(x,y,3,2,'#906170');return;
    }
    if(p.role === 'shadow') {
      poly([[8,79],[12,55],[18,30],[24,16],[35,10],[43,16],[48,34],[51,57],[59,79]],'#101923');
      poly([[14,72],[19,43],[23,26],[33,16],[43,28],[46,51],[39,61],[46,79]],'#34424a');
      poly([[21,41],[24,28],[33,21],[41,31],[43,45],[36,54],[26,51]],'#080f1a');
      poly([[18,57],[25,52],[31,61],[26,79],[13,79]],'#4a575b');
      poly([[39,55],[45,50],[50,76],[34,80]],'#24333c');
      for(const [x,y,w] of [[28,30,9],[25,36,5],[34,39,5],[28,44,9],[31,49,4]])r(x,y,w,1,'#7faaa1');
      r(25,22,1,7,'#78918d');r(18,45,1,10,'#71847e');r(42,62,1,13,'#566f6a');return;
    }
    const father=p.role==='father', mother=p.role==='mother', sister=p.role==='sister';
    const feminine=mother||sister;
    const hair=father?'#49403c':mother?'#392d2d':sister?'#282532':'#1d2531';
    const hairMid=father?'#78675a':mother?'#674b42':sister?'#484052':'#39495a';
    const coat=father?'#5e584d':mother?'#796068':sister?'#67445d':'#3d526e';
    const coatShadow=father?'#343831':mother?'#453340':sister?'#382a42':'#23364d';
    const skin=father?'#c8a183':mother?'#ddb79b':sister?'#d9b49b':'#d4ae90';
    // Hair mass behind the neck distinguishes the family silhouettes.
    if(feminine)poly([[19,23],[23,11],[37,8],[46,18],[49,53],[43,64],[19,59],[16,41]],hair);
    if(mother){poly([[44,9],[51,12],[54,18],[50,25],[44,21]],hair);r(48,13,3,1,hairMid);}
    poly([[6,80],[9,66],[21,60],[26,55],[39,55],[45,60],[55,67],[60,80]],'#0b131f');
    poly([[9,80],[12,67],[24,60],[40,59],[51,65],[57,80]],coat);
    poly([[39,61],[51,66],[57,80],[36,80]],coatShadow);
    poly([[13,69],[24,64],[28,80],[12,80]],father?'#807364':mother?'#9d7b79':sister?'#8b657e':'#64788b');
    r(28,49,12,14,'#9c7568');r(29,51,8,10,skin);
    poly([[21,25],[26,17],[40,18],[46,28],[44,43],[40,51],[33,55],[26,51],[21,42]],'#805f59');
    poly([[23,26],[29,20],[39,21],[43,29],[41,44],[35,51],[29,50],[24,42]],skin);
    poly([[25,27],[33,23],[35,32],[32,40],[26,40]],'#e5c3a2');
    poly([[39,27],[43,30],[40,44],[36,48],[35,42]],'#b88c79');
    r(20,32,3,8,'#b48b76');r(43,33,2,7,'#996e64');
    if(father)poly([[19,31],[18,23],[22,13],[29,10],[40,13],[46,20],[46,31],[42,28],[39,22],[28,20],[23,27]],hair);
    else if(mother)poly([[18,34],[18,23],[22,13],[32,10],[42,14],[47,24],[44,32],[39,24],[33,20],[28,25],[23,27],[21,38]],hair);
    else if(sister)poly([[18,34],[20,18],[28,11],[39,12],[45,22],[46,41],[42,33],[39,24],[36,29],[31,24],[27,29],[23,26],[21,37]],hair);
    else poly([[18,29],[17,22],[21,14],[28,11],[29,8],[36,12],[43,11],[47,18],[45,30],[40,24],[36,27],[33,21],[29,29],[25,25],[22,35]],hair);
    for(const [x,y,w] of [[23,18,7],[29,15,6],[37,17,6],[21,23,3],[41,23,3]])r(x,y,w,1,hairMid);
    if(feminine){r(18,35,1,13,hairMid);r(45,38,1,15,hairMid);}
    if(mother){r(30,13,1,5,'#c8c3b9');r(29,17,1,4,'#aaa9a3');}
    if(father){r(20,26,2,8,'#9a9080');r(43,27,2,6,'#8d8071');}
    r(25,32,6,1,'#604944');r(36,32,5,1,'#604944');
    r(25,35,5,1,'#eee0c7');r(36,35,4,1,'#d8c8b1');
    r(28,35,2,2,'#343b46');r(37,35,2,2,'#343b46');r(28,35,1,1,'#a1aaa9');
    r(33,36,1,6,'#b18471');r(34,42,3,1,'#956b61');
    r(30,47,7,1,'#986966');r(32,49,4,1,'#e0b89a');
    if(p.tense){r(25,31,2,1,'#604944');r(27,32,4,1,'#604944');r(36,32,4,1,'#604944');r(40,31,1,1,'#604944');}
    if(p.shouting){r(30,46,7,4,'#56333d');r(31,46,5,1,'#ded1ba');}
    if(father){r(24,39,5,1,'#a97f6a');r(38,39,3,1,'#a97f6a');for(let y=46;y<53;y+=2)for(let x=27;x<40;x+=3)r(x,y,1,1,'#817367');}
    if(mother){r(24,39,3,1,'#c29b83');r(38,39,3,1,'#bc917c');}
    // Distinct garments, seams and hard rim light, without changing the sprite's role.
    poly([[24,59],[29,62],[33,69],[27,67],[22,62]],feminine?'#c2a5a0':'#a2a99f');
    poly([[39,58],[35,63],[33,69],[40,64],[43,61]],feminine?'#96767e':'#758894');
    r(32,69,1,11,coatShadow);r(34,72,1,1,'#b2b3a5');r(34,77,1,1,'#b2b3a5');
    r(11,68,1,8,'#9eaaa8');r(14,67,6,1,'#829299');r(48,69,1,9,coatShadow);
    if(sister){r(26,63,4,2,'#6b3d57');r(34,63,4,2,'#6b3d57');r(31,65,3,5,'#493349');}
    if(p.blood){
      for(const [x,y,w,h] of [[39,29,3,2],[41,32,2,7],[25,42,2,4],[18,66,7,3],[23,69,3,6],[43,73,6,4],[38,60,2,4]])r(x,y,w,h,'#6d293f');
      r(41,32,1,2,'#b66369');r(19,66,3,1,'#a8505f');r(44,73,2,1,'#a8505f');
    }
  },

  moon(c, x, y, radius) {
    const r = Math.max(2, Math.round(radius));
    this.moons ||= new Map();
    if (!this.moons.has(r)) {
      const surface = document.createElement('canvas'); surface.width = surface.height = r * 2 + 3;
      const brush = surface.getContext('2d');
      const colors = ['#351d2c','#512735','#70313e','#8b3c45','#a84a4d','#c35d55','#da7a64'];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const nx = dx / r, ny = dy / r;
        let light = 3.8 - nx * 1.4 - ny * 1.1;
        if ((nx - .28) ** 2 + (ny + .12) ** 2 < .58) light -= 1.9;
        for (const [cx,cy,size] of [[-.36,-.24,.15],[.1,.38,.2],[-.53,.3,.09],[.35,-.52,.1]]) {
          const d = Math.hypot(nx-cx,ny-cy); if(d < size) light += d < size * .7 ? -.7 : .45;
        }
        light += hash(dx + r, dy + r, 91) > .5 ? .35 : -.35;
        brush.fillStyle = colors[Math.max(0,Math.min(6,Math.round(light)))];
        brush.fillRect(dx+r+1,dy+r+1,1,1);
      }
      this.moons.set(r, surface);
    }
    c.drawImage(this.moons.get(r),Math.round(x-r-1),Math.round(y-r-1));
  },

  crystal(c, x, y, radius = 24) {
    // Static facets are cached; they do not add per-frame polygon work.
    this.crystals ||= new Map();
    if(!this.crystals.has(radius)) {
      const surface=document.createElement('canvas');surface.width=surface.height=radius*2+5;
      const brush=surface.getContext('2d'), center=radius+2;
      for(let i=0;i<10;i++){
        const a=i*Math.PI/5-Math.PI/2;
        const tip=[center+Math.cos(a)*radius,center+Math.sin(a)*radius];
        const left=[center+Math.cos(a-.24)*radius*.48,center+Math.sin(a-.24)*radius*.48];
        const right=[center+Math.cos(a+.24)*radius*.48,center+Math.sin(a+.24)*radius*.48];
        this.polygon(brush,[[center,center],left,tip,right],i%2?'#687794':'#9c9cba');
        this.polygon(brush,[[center,center],left,tip],i%2?'#a9becb':'#d4cfe0');
        this.polygon(brush,[[center,center],tip,right],i%2?'#43556f':'#6f7294');
        brush.fillStyle='#e5e4e4';brush.fillRect(Math.round(tip[0]),Math.round(tip[1]),1,1);
      }
      this.polygon(brush,[[center,center-5],[center+5,center],[center,center+5],[center-5,center]],'#ede3cd');
      this.polygon(brush,[[center,center-4],[center+4,center],[center,center+4]],'#a5b9c9');
      brush.fillStyle='#fff2cf';brush.fillRect(center-1,center-2,2,3);
      this.crystals.set(radius,surface);
    }
    c.drawImage(this.crystals.get(radius),Math.round(x-radius-2),Math.round(y-radius-2));
  },

  writingPresence(c, x, y, helper = false) {
    const poly=(points,color)=>this.polygon(c,points.map(([a,b])=>[x+a,y+b]),color);
    const r=(a,b,w,h,color)=>{c.fillStyle=color;c.fillRect(x+a,y+b,w,h);};
    if(helper){
      poly([[0,8],[3,1],[7,-2],[11,3],[13,12],[7,16]],'#354e54');
      poly([[4,5],[7,1],[10,5],[9,10],[5,10]],'#0d1a27');
      r(5,6,4,1,'#8cbdae');r(3,13,8,1,'#759b91');return;
    }
    poly([[1,2],[10,-2],[8,12],[-1,17]],'#8c637c');
    poly([[12,1],[17,8],[15,20],[9,13]],'#67485f');
    poly([[2,18],[8,14],[8,26],[0,24]],'#4b3c55');
    poly([[10,17],[16,23],[12,28],[8,24]],'#80516e');
    for(let i=0;i<5;i++)r(3+i%2*5,5+i*4,4,1,i%2?'#a37d91':'#d0a7b2');
    r(10,1,1,10,'#debdc3');r(8,12,1,9,'#b58399');
  },

  languageGround(c) {
    c.fillStyle='#0b111b';c.fillRect(0,0,320,64);
    for(let y=0;y<56;y+=8){c.fillStyle=y%16?'#101927':'#0e1723';c.fillRect(0,y,320,8);}
    c.fillStyle='#182437';c.fillRect(0,52,320,1);c.fillStyle='#111d2c';c.fillRect(0,53,320,6);
    for(let i=0;i<35;i++){
      const x=Math.floor(hash(i,2,3)*320),y=Math.floor(hash(i,4,7)*49);
      c.fillStyle=i%3?'#26354a':'#485365';c.fillRect(x,y,i%5===0?3:1,1);
    }
    c.fillStyle='#23344a';c.fillRect(219,49,81,1);c.fillStyle='#172536';c.fillRect(224,50,70,2);
  },

  floor(c, ch, x, y, map) {
    if(ch === '#' || ch === 'v' || ch === '~') return;
    const px=x*TILE, py=y*TILE, P=map.palette;
    const r=(a,b,w,h,color)=>{c.fillStyle=color;c.fillRect(px+a,py+b,w,h);};
    const house=map===MAPS.house_empty||map===MAPS.house_family;
    const wood=house && x<16 || map===MAPS.blood && y>10;
    const base=map===MAPS.blood&&y>10?'#30231d':P.floor;
    r(0,0,16,16,base);
    if(wood){
      for(let row=0;row<2;row++){
        const color=shade(base,.96+hash(Math.floor((x+row)/2),y,row)*.22);
        r(0,row*8,16,7,color);r(0,row*8+7,16,1,shade(base,.78));
        r(0,row*8,16,1,shade(base,1.16));
        const seam=(x+y+row)%3===0?3:13;
        if((x+row)%2===0)r(seam,row*8,1,7,shade(base,.68));
        r(2+Math.floor(hash(x,y,row)*5),row*8+3,7,1,shade(base,1.16));
      }
    }else if(map===MAPS.garden){
      for(let i=0;i<4;i++){
        const a=Math.floor(hash(x,y,i+40)*15),b=Math.floor(hash(x,y,i+52)*15);
        r(a,b,3,1,i%2?'#23392b':'#192c22');r(a+1,b-2,1,3,i%2?'#2b4330':'#213729');
      }
      if(hash(x,y,3)>.82){r(8,11,4,2,'#334337');r(9,10,2,1,'#465444');}
    }else{
      const ceramic=house&&x>=16, wet=map===MAPS.rain;
      const tone=ceramic?(map===MAPS.house_empty?'#293130':'#34382e'):base;
      r(0,0,16,16,shade(tone,(x+y)%2?1.06:1));
      if(ceramic || y%2===0){r(0,0,16,1,shade(tone,.64));r(0,1,16,1,shade(tone,1.22));}
      if(ceramic || (x+Math.floor(y/2))%2===0){r(0,0,1,16,shade(tone,.68));r(1,2,1,13,shade(tone,1.12));}
      if(wet&&hash(x,y,4)>.72){r(3,10,10,1,'#263d50');r(5,9,6,1,'#213348');r(8,12,5,1,'#1b2f40');}
      if(!ceramic&&hash(x,y,5)>.8){r(6,4,4,1,shade(tone,.75));r(9,5,1,3,shade(tone,.75));r(10,8,3,1,shade(tone,.75));}
      if(map===MAPS.mirror&&(y===2||y===11)){r(0,8,16,1,'#45445a');r(0,10,16,1,'#181c2b');}
    }
    if(house && y>0 && y<7) for(const windowX of [3,11,24]) {
      const left=Math.max(0,Math.round((windowX-y*.28-x)*16));
      const right=Math.min(16,Math.round((windowX-y*.28-x)*16+22));
      if(right>left)r(left,0,right-left,16,map===MAPS.house_family?'#e0bf7620':'#aec9d317');
    }
    // Ambient occlusion is baked into each tile and cannot obscure an actor.
    if(map.grid[y-1]?.[x]==='#'){r(0,0,16,2,'#080d164d');r(0,2,16,2,'#080d1626');}
    if(map.grid[y]?.[x-1]==='#')r(0,0,2,16,'#080d163b');
  },

  tile(c, ch, x, y, map, t = 0) {
    const px=x*TILE + (ch === "W" && t ? Math.round(Math.sin(t*9+x)) : 0), py=y*TILE, P=map.palette;
    const r=(a,b,w,h,color)=>{c.fillStyle=color;c.fillRect(px+a,py+b,w,h);};
    if(ch==='#'){
      const house=map===MAPS.house_empty||map===MAPS.house_family;
      r(0,0,16,16,P.wall);r(0,1,16,5,shade(P.wall,1.3));r(0,7,16,6,shade(P.wall,1.12));
      r((y%2)*7+3,1,1,5,shade(P.wall,.65));r((y%2)*5+7,8,1,5,shade(P.wall,.6));
      r(0,6,16,1,shade(P.wall,.6));r(0,7,16,1,shade(P.wall,1.5));
      if(map.grid[y+1]?.[x]!=='#'){r(0,12,16,1,shade(P.trim,1.35));r(0,13,16,2,P.trim);r(0,15,16,1,shade(P.trim,.65));}
      if(house){r(0,3,16,1,shade(P.trim,.7));r(3,8,1,4,shade(P.trim,.75));r(12,8,1,4,shade(P.trim,.75));}
      if(house && y===0 && [3,11,24].includes(x)) {
        r(2,2,12,12,'#161f29');r(3,3,10,9,map===MAPS.house_family?'#8b8970':'#5c7180');
        r(4,3,3,3,map===MAPS.house_family?'#c8bd92':'#8fa6b1');r(7,3,1,10,'#333a3b');r(3,7,10,1,'#333a3b');r(2,13,13,2,'#7c7360');
      }
      if(map===MAPS.garden){for(let i=0;i<5;i++){const a=i*3;r(a,5+i%3,2,7-i%3,'#213b2b');r(a,5+i%3,1,2,'#40573a');}}
    }else if(ch==='T'){
      r(1,13,14,2,'#09120d');r(7,8,3,8,'#443e2b');r(7,10,1,5,'#796a42');
      for(const [a,b,w,h,col] of [[4,1,8,4,'#344c36'],[2,4,12,5,'#293f2e'],[4,9,9,3,'#203629'],[5,2,6,2,'#617956'],[3,5,4,2,'#4c6747'],[9,5,4,2,'#3b563a'],[5,8,3,2,'#435d3d']])r(a,b,w,h,col);
      r(6,2,2,1,'#82956a');r(3,7,1,1,'#799364');r(10,10,2,1,'#567247');
    }else if(ch==='*'){
      this.floor(c,'.',x,y,map);const petal=(x+y)%3===0?'#bfbd9d':(x+y)%3===1?'#91b2a3':'#a9a8c1';
      r(7,8,1,6,'#4c6b48');r(4,11,3,1,'#54764e');r(8,12,3,1,'#334f3c');
      const ox=t?Math.round(Math.sin(t*2+x*2+y)):0;
      for(const [a,b] of [[6,4],[9,5],[5,7],[8,8]]){r(a+ox,b,2,2,petal);r(a+ox,b,1,1,'#e1ddbd');}r(7+ox,6,2,2,'#d5ba79');
    }else if(ch==='C'){
      r(0,0,16,16,'#191a17');r(1,1,14,13,'#634d37');r(2,2,12,1,'#a18a5b');r(2,3,1,10,'#8d734b');r(13,3,1,10,'#302c25');r(3,12,10,1,'#372d23');
      for(let i=0;i<3;i++)r(4,4+i*3,7+i%2*2,1,'#806848');r(7,5,2,5,'#b5a173');r(5,7,6,1,'#c7b381');r(2,14,12,2,'#27221c');
    }else if(ch==='m'||ch==='M'){
      r(1,0,14,16,'#141b28');r(2,0,11,1,'#bdaf8d');r(2,1,2,13,'#857964');r(12,1,2,13,'#453d3d');r(3,14,10,2,'#9b8b71');
      r(4,2,8,11,'#35485e');r(5,3,6,3,'#6a879c');r(4,10,8,3,'#293546');
      for(let i=0;i<6;i++)r(5+i,8-i,1,1,'#b2cbd1');r(6,9,1,2,'#94b0bc');r(7,13,3,1,'#d0c6a9');
    }else if(ch==='B'){
      r(1,1,14,14,'#29242e');r(1,1,14,2,'#6c5646');r(2,3,12,10,'#625b75');r(2,3,5,4,'#d6d0bd');r(3,4,3,2,'#eee5ce');r(8,4,5,8,'#7d7289');r(8,4,1,8,'#b0a2ad');r(11,5,1,7,'#615c72');r(2,13,12,1,'#453a35');r(2,15,2,1,'#171a22');r(12,15,2,1,'#171a22');
    }else if(ch==='F'){
      r(1,12,14,3,'#151b20');r(2,2,12,5,'#806d5b');r(3,3,10,1,'#a58c6a');r(2,7,12,6,'#665948');r(3,8,4,3,'#8b775d');r(8,8,4,3,'#7c6b56');r(7,7,1,5,'#493f38');r(1,5,2,7,'#9a8064');r(13,5,2,7,'#4a433a');
    }else if(ch==='f'||ch==='K'){
      r(0,3,16,11,'#463b2e');r(0,3,16,2,ch==='K'?'#a29e89':'#9b7f53');r(1,5,14,7,'#706044');r(1,12,14,2,'#3b322a');r(7,5,1,7,'#4c422f');r(4,7,2,1,'#c4b98a');r(10,7,2,1,'#c4b98a');
      if(ch==='f'){r(2,4,5,3,'#d2c9af');r(3,4,3,2,'#ede4cb');r(10,8,4,2,'#d2c9af');}
    }else if(ch==='W'){
      r(2,1,12,14,'#929b9d');r(3,2,10,12,'#c5c8bd');r(3,2,10,2,'#dddcd0');r(4,3,4,1,'#4c606a');r(11,3,1,1,'#9bbbaf');
      r(5,5,6,1,'#647985');r(4,6,8,5,'#4b6476');r(5,7,6,4,'#26394d');r(6,7,4,2,'#7b9aa8');r(5,11,6,1,'#819897');r(3,13,10,1,'#929f9f');
    }else if(ch==='L'){r(5,2,6,1,'#f2ebd7');r(3,8,1,4,'#a3b0ad');r(5,8,6,1,'#ebe9d9');r(6,10,4,1,'#6e8c96');r(5,13,6,1,'#a2aaa7');}
    else if(ch==='|'){r(5,2,2,11,'#557186');r(9,2,2,11,'#1b2a40');r(3,0,10,1,'#79919d');r(3,14,10,1,'#516878');r(2,15,12,1,'#131e2a');}
    else if(ch==='b'){r(2,4,2,1,'#863838');r(6,6,3,1,'#9c4a44');r(10,10,2,1,'#7f332b');r(1,12,1,1,'#5b2021');}
    else if(ch==='O')this.moon(c,px+8,py+8,6);
    else if(ch==='D'){r(3,1,1,14,shade(P.trim,1.8));r(12,1,1,14,shade(P.trim,.65));r(5,2,6,1,shade(P.glow,.7));r(10,9,1,1,'#f0d393');}
  },

  person(c, px, py, lowered, opt, pose) {
    // Detail stays inside the original pose transform and collision footprint.
    c.fillStyle = shade(opt.coat || "#3a4a6a", 1.25); c.fillRect(px + 3, py + 7 + lowered, 1, 4); c.fillRect(px + 6, py + 8 + lowered, 2, 1);
    c.fillStyle = shade(opt.coat || "#3a4a6a", .62); c.fillRect(px + 8, py + 7 + lowered, 1, 4); c.fillRect(px + 5, py + 7 + lowered, 1, 5);
    c.fillStyle = "#b2aa98"; c.fillRect(px + 5, py + 6 + lowered, 2, 1);
    if (!opt.hood) { c.fillStyle = shade(opt.hair || "#222222", 1.7); c.fillRect(px + 4, py + lowered, 2, 1); c.fillRect(px + 8, py + 1 + lowered, 1, 1); }
    if (opt.dir === 3 || pose === "mirror") {
      c.fillStyle=opt.hair||"#222222";c.fillRect(px+3,py+2+lowered,6,4);
      c.fillStyle=shade(opt.hair||"#222222",1.5);c.fillRect(px+4,py+2+lowered,1,2);
      c.fillStyle=shade(opt.coat||"#3a4a6a",.7);c.fillRect(px+4,py+7+lowered,4,1);
    }
    if (opt.dir !== 3 && pose !== "mirror") { c.fillStyle = "#bb927e"; c.fillRect(px + 6, py + 4 + lowered, 1, 1); }
    if (!["kneel", "eat", "sit"].includes(pose)) { c.fillStyle = "#191e2b"; c.fillRect(px + 2, py + 13, 3, 1); c.fillRect(px + 7, py + 13, 3, 1); }
  },
};
