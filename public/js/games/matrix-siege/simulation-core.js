(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.PMMatrixSiegeSim=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TICK_MS=100;
  const LANE_MIN=70;
  const LANE_MAX=930;
  const PLAYER_BASE_X=72;
  const ENEMY_BASE_X=928;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
  function hashSeed(input=''){
    let h=2166136261>>>0;
    for(const ch of String(input)){ h^=ch.charCodeAt(0); h=Math.imul(h,16777619)>>>0; }
    return h>>>0;
  }
  function rng(seed){ let s=(Number(seed)>>>0)||1; return ()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; }
  function normalizeEvents(events=[]){
    return (Array.isArray(events)?events:[]).map((event,index)=>({
      sequence:Number(event?.sequence??index+1),
      type:String(event?.type||''),
      unitId:String(event?.unitId||''),
      timestampMs:Math.max(0,Math.trunc(Number(event?.timestampMs??event?.t??0))),
      correlationId:String(event?.correlationId||'').slice(0,120)
    })).sort((a,b)=>a.timestampMs-b.timestampMs||a.sequence-b.sequence);
  }
  function createSimulation({config,stage,seed,events=[]}={}){
    if(!config||!stage) throw new Error('MATRIX_SIEGE_CONFIG_REQUIRED');
    const random=rng(hashSeed(seed));
    const playerUnits=new Map((config.playerUnits||[]).map(u=>[u.unitId,u]));
    const enemyUnits=new Map([...(config.enemyUnits||[]),...(config.bosses||[])].map(u=>[u.unitId,u]));
    const timeline=normalizeEvents(events);
    const state={
      nowMs:0, energy:clamp(config.energy?.start??3,0,config.energy?.max??10), energyRemainder:0,
      playerBaseHp:Number(stage.playerBaseHp||1000), enemyBaseHp:Number(stage.enemyBaseHp||1000),
      units:[], nextId:1, playerSpawns:0, enemySpawns:0, defeatedEnemies:0, defeatedPlayers:0,
      damageDealt:0, damageTaken:0, baseDamageDealt:0, baseDamageTaken:0, invalidEvents:[], complete:false, winner:'', processedEventIndex:0,
      waveIndex:0, lastTickAt:0
    };
    const waves=(stage.waves||[]).map((w,i)=>({atMs:Math.max(0,Number(w.atMs)||0),unitId:String(w.unitId||''),count:Math.max(1,Math.min(20,Number(w.count)||1)),gapMs:Math.max(100,Number(w.gapMs)||600),index:i}));
    const scheduled=[];
    for(const wave of waves){ for(let i=0;i<wave.count;i+=1) scheduled.push({atMs:wave.atMs+i*wave.gapMs,unitId:wave.unitId}); }
    scheduled.sort((a,b)=>a.atMs-b.atMs);
    let scheduledIndex=0;
    function unitFrom(def,side){
      return { id:state.nextId++, side, unitId:def.unitId, name:def.name, hp:Number(def.maxHp), maxHp:Number(def.maxHp), damage:Number(def.damage), range:Number(def.attackRange), cooldown:Number(def.attackCooldownMs), speed:Number(def.movementSpeed), x:side==='player'?PLAYER_BASE_X+25:ENEMY_BASE_X-25, lastAttackAt:-999999, auraApplied:false, alive:true, color:def.color||'#fff', role:def.role||'fighter', radius:Number(def.radius||12) };
    }
    function spawn(def,side){ if(!def||state.units.filter(u=>u.alive).length>=Number(config.maxUnitsOnField||60)) return false; state.units.push(unitFrom(def,side)); if(side==='player') state.playerSpawns++; else state.enemySpawns++; return true; }
    function processPlayerEvents(){
      while(state.processedEventIndex<timeline.length&&timeline[state.processedEventIndex].timestampMs<=state.nowMs){
        const event=timeline[state.processedEventIndex++];
        if(event.sequence!==state.processedEventIndex){ state.invalidEvents.push('EVENT_SEQUENCE_INVALID'); continue; }
        if(event.type!=='SPAWN_UNIT'){ state.invalidEvents.push('EVENT_TYPE_INVALID'); continue; }
        const def=playerUnits.get(event.unitId);
        if(!def){ state.invalidEvents.push('UNIT_NOT_FOUND'); continue; }
        const cost=Number(def.energyCost||0);
        if(state.energy+1e-9<cost){ state.invalidEvents.push('ENERGY_INSUFFICIENT'); continue; }
        state.energy=clamp(state.energy-cost,0,config.energy.max);
        spawn(def,'player');
      }
    }
    function processEnemySpawns(){
      while(scheduledIndex<scheduled.length&&scheduled[scheduledIndex].atMs<=state.nowMs){
        const row=scheduled[scheduledIndex++]; spawn(enemyUnits.get(row.unitId),'enemy');
      }
    }
    function applyCommanderAura(){
      const commanders=state.units.filter(u=>u.alive&&u.side==='player'&&u.role==='support');
      for(const unit of state.units){
        if(!unit.alive||unit.side!=='player'||unit.role==='support') continue;
        const boosted=commanders.some(c=>Math.abs(c.x-unit.x)<=140);
        unit.auraApplied=boosted;
      }
    }
    function targetFor(unit){
      const enemies=state.units.filter(other=>other.alive&&other.side!==unit.side);
      if(!enemies.length) return null;
      enemies.sort((a,b)=>Math.abs(a.x-unit.x)-Math.abs(b.x-unit.x)||a.id-b.id);
      return enemies[0];
    }
    function dealDamage(attacker,target,amount){
      const actual=Math.max(0,Number(amount)||0);
      target.hp-=actual;
      if(attacker.side==='player') state.damageDealt+=actual; else state.damageTaken+=actual;
      if(target.hp<=0&&target.alive){ target.alive=false; target.deadAt=state.nowMs; if(target.side==='enemy') state.defeatedEnemies++; else state.defeatedPlayers++; }
    }
    function attackBase(unit){
      const baseX=unit.side==='player'?ENEMY_BASE_X:PLAYER_BASE_X;
      if(Math.abs(baseX-unit.x)>unit.range+18) return false;
      if(state.nowMs-unit.lastAttackAt<unit.cooldown) return true;
      unit.lastAttackAt=state.nowMs;
      const variance=.94+random()*.12;
      const dmg=Math.max(1,Math.round(unit.damage*(unit.auraApplied?1.15:1)*variance));
      if(unit.side==='player'){ state.enemyBaseHp-=dmg; state.damageDealt+=dmg; state.baseDamageDealt+=dmg; }
      else { state.playerBaseHp-=dmg; state.damageTaken+=dmg; state.baseDamageTaken+=dmg; }
      return true;
    }
    function updateUnits(){
      applyCommanderAura();
      for(const unit of state.units){
        if(!unit.alive) continue;
        const target=targetFor(unit);
        if(target){
          const distance=Math.abs(target.x-unit.x);
          if(distance<=unit.range+target.radius){
            if(state.nowMs-unit.lastAttackAt>=unit.cooldown){
              unit.lastAttackAt=state.nowMs;
              const variance=.94+random()*.12;
              const aoe=unit.role==='aoe';
              const dmg=Math.max(1,Math.round(unit.damage*(unit.auraApplied?1.15:1)*variance));
              if(aoe){
                for(const other of state.units.filter(o=>o.alive&&o.side!==unit.side&&Math.abs(o.x-target.x)<=55)) dealDamage(unit,other,dmg);
              } else dealDamage(unit,target,dmg);
            }
          } else unit.x+=unit.side==='player'?unit.speed*(TICK_MS/1000):-unit.speed*(TICK_MS/1000);
        } else if(!attackBase(unit)) unit.x+=unit.side==='player'?unit.speed*(TICK_MS/1000):-unit.speed*(TICK_MS/1000);
        unit.x=clamp(unit.x,LANE_MIN,LANE_MAX);
      }
      state.units=state.units.filter(u=>u.alive||state.nowMs-(u.deadAt||state.nowMs)<500);
    }
    function resolveCompletion(){
      if(state.enemyBaseHp<=0){ state.enemyBaseHp=0; state.complete=true; state.winner='player'; }
      else if(state.playerBaseHp<=0){ state.playerBaseHp=0; state.complete=true; state.winner='enemy'; }
      else if(state.nowMs>=Number(stage.durationMs||120000)){
        state.complete=true;
        if(state.playerBaseHp===state.enemyBaseHp){
          const ph=state.units.filter(u=>u.alive&&u.side==='player').reduce((s,u)=>s+u.hp,0);
          const eh=state.units.filter(u=>u.alive&&u.side==='enemy').reduce((s,u)=>s+u.hp,0);
          state.winner=ph===eh?'draw':ph>eh?'player':'enemy';
        } else state.winner=state.playerBaseHp>state.enemyBaseHp?'player':'enemy';
      }
    }
    function tick(){
      if(state.complete) return;
      state.nowMs+=TICK_MS;
      state.energyRemainder+=Number(config.energy?.regenPerSecond||1)*(TICK_MS/1000);
      if(state.energyRemainder>=.01){ state.energy=clamp(state.energy+state.energyRemainder,0,Number(config.energy?.max||10)); state.energyRemainder=0; }
      processPlayerEvents(); processEnemySpawns(); updateUnits(); resolveCompletion();
    }
    function stepTo(targetMs){
      const safe=Math.max(state.nowMs,Math.min(Number(stage.durationMs||120000),Math.trunc(Number(targetMs)||0)));
      while(!state.complete&&state.nowMs+TICK_MS<=safe) tick();
      return snapshot();
    }
    function snapshot(){
      return {
        nowMs:state.nowMs, energy:Number(state.energy.toFixed(2)), playerBaseHp:Math.max(0,Math.round(state.playerBaseHp)), enemyBaseHp:Math.max(0,Math.round(state.enemyBaseHp)),
        units:state.units.filter(u=>u.alive).map(u=>({id:u.id,side:u.side,unitId:u.unitId,name:u.name,x:Number(u.x.toFixed(2)),hp:Math.max(0,Math.round(u.hp)),maxHp:u.maxHp,color:u.color,role:u.role,radius:u.radius})),
        playerSpawns:state.playerSpawns, enemySpawns:state.enemySpawns, defeatedEnemies:state.defeatedEnemies, defeatedPlayers:state.defeatedPlayers,
        damageDealt:Math.round(state.damageDealt), damageTaken:Math.round(state.damageTaken), baseDamageDealt:Math.round(state.baseDamageDealt), baseDamageTaken:Math.round(state.baseDamageTaken), invalidEvents:[...new Set(state.invalidEvents)], complete:state.complete, winner:state.winner
      };
    }
    return {state,stepTo,snapshot,tick};
  }
  function simulateBattle(input={}){ const sim=createSimulation(input); return sim.stepTo(input.durationMs??input.stage?.durationMs??120000); }
  return {TICK_MS,hashSeed,normalizeEvents,createSimulation,simulateBattle};
});
