(() => {
  'use strict';
  const C = window.GAME_CONFIG;
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const ui = Object.fromEntries(['menu','gameover','hud','start','restart','hpText','hpBar','hungerText','hungerBar','staminaText','staminaBar','weapon','message','crouch','foodCount','medkitCount','useFood','useMedkit','location','survivalTime'].map(id => [id, document.querySelector('#' + id)]));
  let W = 0, H = 0, dpr = 1, state, last = 0, raf = 0, messageTimer = 0;
  const keys = new Set(), pointer = { x: 0, y: 0, down: false, active: false };
  const sticks = { move: null, aim: null };

  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const rand = (a,b) => a + Math.random() * (b-a);
  const circleHit = (x,y,r,o) => Math.hypot(x-o.x,y-o.y) < r+o.r;

  const landmarks = [
    { name:'ФЕРМА', x:330,y:380,w:460,h:330,color:'#665d3e', buildings:[[390,430,150,100],[610,520,120,150]], loot:'food' },
    { name:'ПОСЁЛОК', x:1240,y:270,w:650,h:500,color:'#57554a', buildings:[[1300,330,170,120],[1550,350,130,170],[1710,570,120,110],[1350,610,160,100]], loot:'mixed' },
    { name:'БОЛЬНИЦА', x:2380,y:360,w:390,h:320,color:'#656a63', buildings:[[2460,430,230,180]], loot:'medkit' },
    { name:'ВОЕННЫЙ ЛАГЕРЬ', x:2180,y:1500,w:570,h:440,color:'#465241', buildings:[[2260,1590,150,75],[2460,1580,150,75],[2360,1770,150,75]], loot:'mixed' },
    { name:'СТАРАЯ ФЕРМА', x:470,y:1640,w:430,h:370,color:'#655d3d', buildings:[[540,1710,180,120],[730,1900,110,90]], loot:'food' }
  ];
  const ponds = [{x:1080,y:1460,rx:230,ry:145},{x:2840,y:980,rx:180,ry:260}];
  const obstacles = landmarks.flatMap(l => l.buildings.map(b => ({x:b[0],y:b[1],w:b[2],h:b[3]})));

  function randomSpawnPoint(radius){
    for(let i=0;i<100;i++){
      const point={x:rand(radius,C.world.width-radius),y:rand(radius,C.world.height-radius)};
      const blocked=obstacles.some(b=>point.x+radius>b.x&&point.x-radius<b.x+b.w&&point.y+radius>b.y&&point.y-radius<b.y+b.h);
      if(!blocked)return point;
    }
    return {x:C.world.width/2,y:C.world.height/2};
  }

  function resize(){ dpr=Math.min(devicePixelRatio||1,1.5); W=innerWidth; H=innerHeight; canvas.width=W*dpr; canvas.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
  addEventListener('resize',resize); resize();

  function reset(){
    const spawn=randomSpawnPoint(C.player.radius);
    state={ running:true, time:0, player:{x:spawn.x,y:spawn.y,r:C.player.radius,hp:C.player.maxHealth,hunger:C.player.maxHunger,stamina:C.player.maxStamina,exhausted:false,crouching:false,angle:0,weapon:0,food:0,medkits:0,cooldown:0}, zombies:[],loot:[],particles:[],shots:[],spawnTimer:0 };
    seedLoot(); selectWeapon(0); updateUI();
  }
  function seedLoot(){
    const add=(type,n,area)=>{ for(let i=0;i<n;i++) state.loot.push({type,x:rand(area.x+35,area.x+area.w-35),y:rand(area.y+35,area.y+area.h-35),r:9}); };
    landmarks.forEach(l=>{ if(l.loot==='food') add('food',3,l); else if(l.loot==='medkit') add('medkit',4,l); else {add('food',2,l);add('medkit',1,l);} });
    while(state.loot.filter(x=>x.type==='food').length<C.loot.foodCount) state.loot.push({type:'food',x:rand(80,C.world.width-80),y:rand(80,C.world.height-80),r:9});
    while(state.loot.filter(x=>x.type==='medkit').length<C.loot.medkitCount) state.loot.push({type:'medkit',x:rand(80,C.world.width-80),y:rand(80,C.world.height-80),r:9});
  }
  function start(){ reset(); ui.menu.classList.add('hidden'); ui.gameover.classList.add('hidden'); ui.hud.classList.remove('hidden'); last=performance.now(); cancelAnimationFrame(raf); raf=requestAnimationFrame(loop); }
  ui.start.onclick=start; ui.restart.onclick=start;

  function moveCircle(o,dx,dy){
    o.x=clamp(o.x+dx,o.r,C.world.width-o.r); if(obstacles.some(b=>o.x+o.r>b.x&&o.x-o.r<b.x+b.w&&o.y+o.r>b.y&&o.y-o.r<b.y+b.h)) o.x-=dx;
    o.y=clamp(o.y+dy,o.r,C.world.height-o.r); if(obstacles.some(b=>o.x+o.r>b.x&&o.x-o.r<b.x+b.w&&o.y+o.r>b.y&&o.y-o.r<b.y+b.h)) o.y-=dy;
  }
  function update(dt){
    const p=state.player; state.time+=dt; p.cooldown=Math.max(0,p.cooldown-dt);
    let mx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0), my=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
    if(sticks.move){ mx=sticks.move.dx; my=sticks.move.dy; }
    const moving=Math.hypot(mx,my)>0;
    const runRequested=!p.crouching&&(sticks.move?sticks.move.outside:keys.has('shift'));
    if(!runRequested)p.exhausted=false;
    const running=moving&&runRequested&&!p.exhausted&&p.stamina>0;
    const crouchMoving=moving&&p.crouching&&p.stamina>0;
    if(running||crouchMoving){p.stamina=Math.max(0,p.stamina-C.player.staminaDrainPerSecond*dt);if(p.stamina===0){p.exhausted=true;p.crouching=false;}}
    else {p.stamina=Math.min(C.player.maxStamina,p.stamina+C.player.staminaRegenPerSecond*dt);if(p.stamina===C.player.maxStamina)p.exhausted=false;}
    const moveSpeed=C.player.speed*(p.crouching?C.player.crouchSpeedMultiplier:running?1:.5);
    const ml=Math.hypot(mx,my)||1; moveCircle(p,mx/ml*moveSpeed*dt,my/ml*moveSpeed*dt);
    if(pointer.active&&!sticks.move&&!sticks.aim) updateMouseAim();
    if(sticks.aim && Math.hypot(sticks.aim.dx,sticks.aim.dy)>.2){ p.angle=Math.atan2(sticks.aim.dy,sticks.aim.dx); attack(); }
    else if(pointer.down) attack();
    p.hunger=clamp(p.hunger-C.player.hungerPerSecond*dt,0,C.player.maxHunger);
    if(p.hunger<=0) p.hp-=C.player.starvationDamagePerSecond*dt; else if(p.hunger>=C.player.regenMinHunger) p.hp=Math.min(C.player.maxHealth,p.hp+C.player.regenPerSecond*dt);
    state.spawnTimer-=dt; if(state.spawnTimer<=0){ state.spawnTimer=C.zombie.spawnEvery; spawnZombie(); }
    updateZombies(dt); updateParticles(dt); pickupLoot(); updateUI();
    if(p.hp<=0) die();
  }
  function spawnZombie(){
    if(state.zombies.length>=C.zombie.maxAlive)return;
    const p=state.player,a=rand(0,Math.PI*2),d=rand(C.zombie.spawnMinDistance,C.zombie.spawnMaxDistance),z={x:clamp(p.x+Math.cos(a)*d,20,C.world.width-20),y:clamp(p.y+Math.sin(a)*d,20,C.world.height-20),r:C.zombie.radius,hp:C.zombie.health,speed:rand(C.zombie.speedMin,C.zombie.speedMax),aggro:false,cooldown:0,angle:0};
    if(!obstacles.some(b=>z.x>b.x&&z.x<b.x+b.w&&z.y>b.y&&z.y<b.y+b.h)) state.zombies.push(z);
  }
  function updateZombies(dt){
    const p=state.player;
    for(let i=state.zombies.length-1;i>=0;i--){ const z=state.zombies[i],d=dist(z,p),aggroDistance=p.crouching?C.zombie.crouchAggroDistance:C.zombie.aggroDistance; if(d>C.zombie.despawnDistance){state.zombies.splice(i,1);continue;} if(d<aggroDistance)z.aggro=true; z.cooldown-=dt;
      if(z.aggro){ z.angle=Math.atan2(p.y-z.y,p.x-z.x); if(d>p.r+z.r+2) moveCircle(z,Math.cos(z.angle)*z.speed*dt,Math.sin(z.angle)*z.speed*dt); else if(z.cooldown<=0){p.hp-=C.zombie.damage;z.cooldown=C.zombie.attackCooldown;burst(p.x,p.y,'#b84e43',5);}}
    }
  }
  function attack(){
    const p=state.player,w=C.weapons[p.weapon]; if(p.cooldown>0)return; p.cooldown=w.cooldown;
    let target=null,best=w.range; for(const z of state.zombies){const d=dist(p,z),delta=Math.abs(Math.atan2(Math.sin(Math.atan2(z.y-p.y,z.x-p.x)-p.angle),Math.cos(Math.atan2(z.y-p.y,z.x-p.x)-p.angle)));if(d<best&&delta<(w.gun?.22:.75)){target=z;best=d;}}
    if(w.gun){state.shots.push({x1:p.x,y1:p.y,x2:p.x+Math.cos(p.angle)*w.range,y2:p.y+Math.sin(p.angle)*w.range,life:.07});state.zombies.forEach(z=>{if(dist(z,p)<C.zombie.gunshotDistance)z.aggro=true;});burst(p.x+Math.cos(p.angle)*22,p.y+Math.sin(p.angle)*22,'#ffd56a',5);}
    if(target){target.hp-=w.damage;burst(target.x,target.y,'#7d302c',7);if(target.hp<=0)state.zombies.splice(state.zombies.indexOf(target),1);}
  }
  function pickupLoot(){ const p=state.player; for(let i=state.loot.length-1;i>=0;i--)if(dist(p,state.loot[i])<C.loot.pickupDistance){const l=state.loot.splice(i,1)[0];if(l.type==='food'){p.food++;showMessage('Найдена еда');}else{p.medkits++;showMessage('Найдена аптечка');}} }
  function use(type){const p=state.player;if(type==='food'&&p.food){p.food--;p.hunger=Math.min(C.player.maxHunger,p.hunger+C.loot.foodRestore);showMessage('Вы поели');}if(type==='medkit'&&p.medkits){p.medkits--;p.hp=Math.min(C.player.maxHealth,p.hp+C.loot.medkitHeal);showMessage('Раны обработаны');}updateUI();}
  ui.useFood.onclick=()=>use('food');ui.useMedkit.onclick=()=>use('medkit');
  function burst(x,y,color,n){for(let i=0;i<n;i++)state.particles.push({x,y,vx:rand(-55,55),vy:rand(-55,55),life:rand(.2,.5),color});}
  function updateParticles(dt){state.particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;});state.particles=state.particles.filter(p=>p.life>0);state.shots.forEach(s=>s.life-=dt);state.shots=state.shots.filter(s=>s.life>0);}
  function selectWeapon(n){if(!state)return;state.player.weapon=n;document.querySelectorAll('[data-slot]').forEach((b,i)=>b.classList.toggle('selected',i===n));ui.weapon.textContent=C.weapons[n].name;}
  function toggleCrouch(){if(!state?.running||state.player.stamina<=0)return;state.player.crouching=!state.player.crouching;updateUI();}
  document.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>selectWeapon(+b.dataset.slot));
  ui.crouch.onclick=toggleCrouch;
  function showMessage(s){ui.message.textContent=s;ui.message.style.opacity=1;clearTimeout(messageTimer);messageTimer=setTimeout(()=>ui.message.style.opacity=0,1300);}
  function updateUI(){const p=state.player;ui.hpText.textContent=Math.ceil(p.hp);ui.hungerText.textContent=Math.ceil(p.hunger);ui.staminaText.textContent=Math.ceil(p.stamina);ui.hpBar.style.width=clamp(p.hp,0,100)+'%';ui.hungerBar.style.width=p.hunger+'%';ui.staminaBar.style.width=p.stamina/C.player.maxStamina*100+'%';ui.crouch.classList.toggle('active',p.crouching);ui.crouch.firstChild.textContent=p.crouching?'ВСТАТЬ ':'ПРИСЕСТЬ ';ui.foodCount.textContent=p.food;ui.medkitCount.textContent=p.medkits;const here=landmarks.find(l=>p.x>l.x&&p.x<l.x+l.w&&p.y>l.y&&p.y<l.y+l.h);ui.location.textContent=here?here.name:'ДИКАЯ МЕСТНОСТЬ';}
  function die(){state.running=false;ui.hud.classList.add('hidden');ui.gameover.classList.remove('hidden');ui.survivalTime.textContent='Продержались '+Math.floor(state.time/60)+':'+String(Math.floor(state.time%60)).padStart(2,'0');}

  function draw(){
    const p=state.player,camX=clamp(p.x-W/2,0,Math.max(0,C.world.width-W)),camY=clamp(p.y-H/2,0,Math.max(0,C.world.height-H));ctx.fillStyle='#313b2b';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(-camX,-camY);
    ctx.strokeStyle='#3b4633';ctx.lineWidth=1;for(let x=0;x<C.world.width;x+=C.world.grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,C.world.height);ctx.stroke();}for(let y=0;y<C.world.height;y+=C.world.grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(C.world.width,y);ctx.stroke();}
    ponds.forEach(q=>{ctx.fillStyle='#294c52';ctx.beginPath();ctx.ellipse(q.x,q.y,q.rx,q.ry,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#527064';ctx.lineWidth=7;ctx.stroke();});
    landmarks.forEach(l=>{ctx.fillStyle=l.color;ctx.fillRect(l.x,l.y,l.w,l.h);ctx.fillStyle='#23271f';l.buildings.forEach(b=>{ctx.fillRect(...b);ctx.strokeStyle='#8a846d';ctx.lineWidth=3;ctx.strokeRect(...b);});});
    state.loot.forEach(l=>{ctx.fillStyle=l.type==='food'?'#c7a34b':'#e5e1d5';ctx.fillRect(l.x-7,l.y-7,14,14);ctx.fillStyle=l.type==='food'?'#765922':'#b84d46';ctx.fillRect(l.x-3,l.y-3,6,6);});
    state.zombies.forEach(z=>drawPerson(z,'#71815b',z.angle));drawPerson(p,C.weapons[p.weapon].color,p.angle,p.crouching);
    state.shots.forEach(s=>{ctx.strokeStyle='#ffeab0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();});state.particles.forEach(q=>{ctx.globalAlpha=Math.min(1,q.life*4);ctx.fillStyle=q.color;ctx.fillRect(q.x-2,q.y-2,4,4);});ctx.globalAlpha=1;ctx.restore();
    const phase=(Math.sin(state.time/C.day.lengthSeconds*Math.PI*2-Math.PI/2)+1)/2,alpha=(1-phase)*C.day.darkness;if(alpha>.02){ctx.fillStyle=`rgba(8,12,18,${alpha})`;ctx.fillRect(0,0,W,H);}
    drawSticks();
  }
  function drawPerson(o,color,angle,crouching=false){ctx.save();ctx.translate(o.x,o.y);ctx.rotate(angle);if(crouching)ctx.scale(.82,1.18);ctx.fillStyle='#151713';ctx.fillRect(-10,-11,25,22);ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,crouching?o.r*.82:o.r,0,Math.PI*2);ctx.fill();if(crouching){ctx.fillStyle='#252920';ctx.fillRect(-8,-18,8,8);ctx.fillRect(-8,10,8,8);}ctx.fillStyle='#1b1d18';ctx.fillRect(8,-3,15,6);ctx.restore();}
  function drawSticks(){if(!matchMedia('(pointer: coarse)').matches)return;[[W*.16,H*.76,sticks.move],[W*.84,H*.76,sticks.aim]].forEach(([x,y,s])=>{ctx.globalAlpha=.35;ctx.fillStyle='#0e110d';ctx.beginPath();ctx.arc(x,y,58,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c6cdb8';ctx.stroke();if(s){ctx.fillStyle='#7b886c';ctx.beginPath();ctx.arc(x+s.dx*40,y+s.dy*40,23,0,Math.PI*2);ctx.fill();}});ctx.globalAlpha=1;}
  function loop(now){if(!state?.running)return;const dt=Math.min((now-last)/1000,.05);last=now;update(dt);draw();raf=requestAnimationFrame(loop);}

  addEventListener('keydown',e=>{const key=e.key.toLowerCase();keys.add(key);if('123'.includes(e.key))selectWeapon(+e.key-1);if(key==='f')use('food');if(key==='h')use('medkit');if(key==='c'&&!e.repeat)toggleCrouch();});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  function updateMouseAim(){const p=state.player,camX=clamp(p.x-W/2,0,Math.max(0,C.world.width-W)),camY=clamp(p.y-H/2,0,Math.max(0,C.world.height-H));p.angle=Math.atan2(pointer.y-(p.y-camY),pointer.x-(p.x-camX));}
  canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'){const rect=canvas.getBoundingClientRect();pointer.x=e.clientX-rect.left;pointer.y=e.clientY-rect.top;pointer.active=true;if(state&&!sticks.move&&!sticks.aim)updateMouseAim();}updateStick(e);});canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);if(e.pointerType==='touch'){const side=e.clientX<W/2?'move':'aim';sticks[side]={id:e.pointerId,dx:0,dy:0,outside:false};updateStick(e);}else pointer.down=true;});canvas.addEventListener('pointerup',e=>{pointer.down=false;for(const k of ['move','aim'])if(sticks[k]?.id===e.pointerId)sticks[k]=null;});
  function updateStick(e){for(const [k,cx] of [['move',W*.16],['aim',W*.84]]){const s=sticks[k];if(s?.id===e.pointerId){let dx=(e.clientX-cx)/58,dy=(e.clientY-H*.76)/58,l=Math.hypot(dx,dy);s.outside=l>1;if(l>1){dx/=l;dy/=l;}s.dx=dx;s.dy=dy;}}}
})();
