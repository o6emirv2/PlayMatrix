'use strict';
const express=require('express');
const crypto=require('crypto');
const {requireAuth,requireAdmin,strictLimiter}=require('../../core/security');
const {requireAgeGate}=require('../../core/ageGateService');
const {requireAdminReauth,writeAdminAudit}=require('../../core/adminReauthService');
const {initFirebaseAdmin}=require('../../config/firebaseAdmin');
const {runtimeStore}=require('../../core/runtimeStore');
const {getProgression,normalizeXpBigInt}=require('../../core/progressionService');
const {recordRecentActivity}=require('../../core/recentActivityService');
const {requireRedisReady,setJson,getJson,del,setLock}=require('../../core/redisClient');
const env=require('../../config/env');
const {getConfig,saveConfig}=require('./config-service');
const Sim=require('../../../public/js/games/matrix-siege/simulation-core');

const router=express.Router();
const GAME='matrix-siege';
const RUN_TTL_MS=30*60*1000;
const BOSS_RUN_TTL_MS=45*60*1000;
const DONE_TTL_MS=24*60*60*1000;
const MAX_EVENTS=500;
const MAX_PAYLOAD_BYTES=48*1024;
const DAILY_CLASSIC_XP_CAP=100000;
const safeId=(prefix='id')=>`${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
const dateKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const runKey=(uid,runId)=>`pm:matrix-siege:run:${uid}:${runId}`;
const doneKey=(uid,key)=>`pm:matrix-siege:submit:${uid}:${key}`;

function response(res,status,ok,data=null,code='SUCCESS'){ return res.status(status).json({ok,data,message:'',code,error:ok?undefined:code}); }
function isProduction(){ return env.nodeEnv==='production'; }
async function redisRequired(res){ const ready=await requireRedisReady(); if(!ready.ok) { response(res,503,false,null,'REDIS_UNAVAILABLE'); return false; } return true; }
async function storeRun(uid,runId,value,ttl){
  const saved=await setJson(runKey(uid,runId),value,ttl).catch(()=>false);
  if(!saved&&!isProduction()) runtimeStore.temporary.set(runKey(uid,runId),value,ttl);
  return saved||!isProduction();
}
async function readRun(uid,runId){ return await getJson(runKey(uid,runId)).catch(()=>null)||(!isProduction()?runtimeStore.temporary.get(runKey(uid,runId)):null); }
async function deleteRun(uid,runId){ await del(runKey(uid,runId)).catch(()=>null); runtimeStore.temporary.delete?.(runKey(uid,runId)); }
async function storeDone(uid,key,value){ const saved=await setJson(doneKey(uid,key),value,DONE_TTL_MS).catch(()=>false); if(!saved&&!isProduction()) runtimeStore.temporary.set(doneKey(uid,key),value,DONE_TTL_MS); }
async function readDone(uid,key){ return await getJson(doneKey(uid,key)).catch(()=>null)||(!isProduction()?runtimeStore.temporary.get(doneKey(uid,key)):null); }

async function readUser(uid){ const {db}=initFirebaseAdmin(); if(!db) return {}; const snap=await db.collection('users').doc(uid).get().catch(()=>null); return snap?.exists?(snap.data()||{}):{}; }
async function requireVerifiedEmail(req,res,next){
  try{
    if(!isProduction() && !initFirebaseAdmin().db) return next();
    if(req.user?.email_verified===true||req.user?.emailVerified===true) return next();
    const user=await readUser(String(req.user?.uid||''));
    if(user.emailVerified===true) return next();
    return response(res,403,false,null,'EMAIL_NOT_VERIFIED');
  }catch(_){ return response(res,403,false,null,'EMAIL_NOT_VERIFIED'); }
}
function defaultProgress(){ return {currentStage:1,unlockedStage:1,totalStars:0,technologyCrystals:0,unitLevels:{'code-runner':1,'neon-ranger':1,'matrix-guardian':1,'pulse-mage':1,'cyber-commander':1},completedStages:{},dailyMissionDate:dateKey(),missionProgress:{},missionClaims:{}}; }
function effectiveConfig(config,progress){ const copy=JSON.parse(JSON.stringify(config)); if(copy.levelsApplied===true) return copy; copy.playerUnits=(copy.playerUnits||[]).map(unit=>{ const level=Math.max(1,Math.min(10,Number(progress?.unitLevels?.[unit.unitId]||1))); const boost=level-1; return {...unit,level,maxHp:Math.round(Number(unit.maxHp||1)*(1+boost*.08)),damage:Math.round(Number(unit.damage||1)*(1+boost*.07)),attackCooldownMs:Math.max(350,Math.round(Number(unit.attackCooldownMs||1000)*(1-Math.min(.18,boost*.02))))}; }); copy.levelsApplied=true; return copy; }
async function loadProgress(uid){
  const {db}=initFirebaseAdmin();
  const fallback=defaultProgress();
  if(!db){ return {...fallback,...(runtimeStore.temporary.get(`matrix-siege:progress:${uid}`)||{})}; }
  const snap=await db.collection('users').doc(uid).collection('gameProgress').doc('matrixSiege').get().catch(()=>null);
  return {...fallback,...(snap?.exists?(snap.data()||{}):{})};
}
function publicConfig(config,progress){
  const effective=effectiveConfig(config,progress);
  return {version:effective.version,energy:effective.energy,maxUnitsOnField:effective.maxUnitsOnField,playerUnits:effective.playerUnits.map(u=>({...u,unlocked:Number(progress.unlockedStage||1)>=Number(u.unlockStage||1)})),enemyUnits:effective.enemyUnits,bosses:effective.bosses,stages:effective.stages.map(s=>({stageId:s.stageId,name:s.name,world:s.world,isBoss:s.isBoss,durationMs:s.durationMs,parTimeMs:s.parTimeMs,unlocked:Number(progress.unlockedStage||1)>=s.stageId,stars:Number(progress.completedStages?.[`stage-${s.stageId}`]?.stars||0)})),xp:config.xp,crystals:config.crystals,upgradeCosts:config.upgradeCosts,missions:config.missions};
}
function validateTimeline(raw=[]){
  const bytes=Buffer.byteLength(JSON.stringify(raw||[]),'utf8');
  if(bytes>MAX_PAYLOAD_BYTES) return {ok:false,code:'PAYLOAD_TOO_LARGE'};
  if(!Array.isArray(raw)||raw.length>MAX_EVENTS) return {ok:false,code:'EVENT_TIMELINE_INVALID'};
  const seen=new Set(); let lastTs=-1; let lastSeq=0;
  const events=[];
  for(const row of raw){
    const sequence=Math.trunc(Number(row?.sequence||0)); const timestampMs=Math.trunc(Number(row?.timestampMs??row?.t??-1)); const correlationId=String(row?.correlationId||'').trim(); const unitId=String(row?.unitId||'').trim();
    if(sequence!==lastSeq+1||timestampMs<lastTs||timestampMs<0||!correlationId||seen.has(correlationId)||!unitId) return {ok:false,code:'EVENT_TIMELINE_INVALID'};
    seen.add(correlationId); lastSeq=sequence; lastTs=timestampMs; events.push({sequence,type:'SPAWN_UNIT',unitId,timestampMs,correlationId:correlationId.slice(0,120)});
  }
  return {ok:true,events,bytes};
}
function computeStars(stage,snapshot){
  if(snapshot.winner!=='player') return 0;
  let stars=1;
  if(snapshot.playerBaseHp>=Math.ceil(Number(stage.playerBaseHp||1000)*.5)) stars++;
  if(snapshot.nowMs<=Number(stage.parTimeMs||90000)) stars++;
  return Math.min(3,stars);
}
function missionDeltas(config,stage,snapshot,events,stars){
  const byUnit=events.reduce((m,e)=>(m[e.unitId]=(m[e.unitId]||0)+1,m),{});
  const out={spawn:events.length,wins:snapshot.winner==='player'?1:0,defeats:snapshot.defeatedEnemies||0,'perfect-win':snapshot.winner==='player'&&snapshot.baseDamageTaken<=0?1:0,'fast-win':snapshot.winner==='player'&&snapshot.nowMs<=90000?1:0,'boss-win':snapshot.winner==='player'&&stage.isBoss?1:0,stars,damage:snapshot.damageDealt||0,byUnit};
  return out;
}
function updateMissionProgress(config,progress,deltas){
  const today=dateKey(); const base=progress.dailyMissionDate===today?(progress.missionProgress||{}):{}; const claims=progress.dailyMissionDate===today?(progress.missionClaims||{}):{}; const next={...base};
  for(const m of config.missions){ let add=0; if(m.type==='spawn-unit') add=deltas.byUnit?.[m.unitId]||0; else add=Number(deltas[m.type]||0); next[m.missionId]=Math.min(Number(m.target||1),Math.max(0,Number(next[m.missionId]||0)+add)); }
  return {dailyMissionDate:today,missionProgress:next,missionClaims:claims};
}
function missionView(config,progress){ const today=dateKey(); const p=progress.dailyMissionDate===today?(progress.missionProgress||{}):{}; const c=progress.dailyMissionDate===today?(progress.missionClaims||{}):{}; return config.missions.map(m=>({...m,progress:Number(p[m.missionId]||0),completed:Number(p[m.missionId]||0)>=Number(m.target||1),claimed:!!c[m.missionId]})); }

router.get('/status',requireAuth,requireAgeGate,requireVerifiedEmail,async(req,res)=>{ if(!await redisRequired(res)) return; const config=await getConfig(); const progress=await loadProgress(req.user.uid); return response(res,200,true,{game:GAME,configVersion:config.version,progress,missions:missionView(config,progress)}); });
router.get('/config',requireAuth,requireAgeGate,requireVerifiedEmail,async(req,res)=>{ const config=await getConfig(); const progress=await loadProgress(req.user.uid); return response(res,200,true,publicConfig(config,progress)); });
router.get('/progress',requireAuth,requireAgeGate,requireVerifiedEmail,async(req,res)=>response(res,200,true,await loadProgress(req.user.uid)));
router.get('/missions',requireAuth,requireAgeGate,requireVerifiedEmail,async(req,res)=>{ const config=await getConfig(); const progress=await loadProgress(req.user.uid); return response(res,200,true,{date:dateKey(),items:missionView(config,progress)}); });

router.post('/start',strictLimiter,requireAuth,requireAgeGate,requireVerifiedEmail,async(req,res)=>{
  if(!await redisRequired(res)) return;
  const uid=String(req.user.uid); const config=await getConfig(); const progress=await loadProgress(uid); const stageId=Math.max(1,Math.min(20,Math.trunc(Number(req.body?.stageId||1))));
  if(stageId>Number(progress.unlockedStage||1)) return response(res,403,false,null,'STAGE_LOCKED');
  const stage=config.stages.find(s=>s.stageId===stageId); if(!stage) return response(res,404,false,null,'STAGE_NOT_FOUND');
  const runId=safeId('msrun'); const nonce=crypto.randomBytes(24).toString('hex'); const seed=crypto.randomBytes(16).toString('hex'); const startedAt=Date.now(); const ttl=stage.isBoss?BOSS_RUN_TTL_MS:RUN_TTL_MS;
  const effective=effectiveConfig(config,progress);
  const run={runId,uid,nonce,seed,stageId,configVersion:config.version,configSnapshot:effective,unitLevels:progress.unitLevels||{},unlockedStage:Number(progress.unlockedStage||1),startedAt,expiresAt:startedAt+ttl,finished:false};
  if(!await storeRun(uid,runId,run,ttl)) return response(res,503,false,null,'GAME_STATE_UNAVAILABLE');
  return response(res,200,true,{runId,nonce,seed,stage,config:publicConfig(effective,progress),startedAt,expiresAt:run.expiresAt});
});

router.post('/submit',strictLimiter,requireAuth,requireAgeGate,requireVerifiedEmail,async(req,res)=>{
  if(!await redisRequired(res)) return;
  const uid=String(req.user.uid); const runId=String(req.body?.runId||'').trim(); const nonce=String(req.body?.nonce||'').trim(); const idem=String(req.body?.idempotencyKey||req.headers['x-idempotency-key']||'').trim();
  if(!runId||!nonce||!idem) return response(res,400,false,null,'VALIDATION_ERROR');
  const existing=await readDone(uid,idem); if(existing) return response(res,200,true,{...existing,duplicate:true},'IDEMPOTENCY_REPLAY');
  const run=await readRun(uid,runId); if(!run||run.uid!==uid) return response(res,404,false,null,'RUN_NOT_FOUND'); if(run.nonce!==nonce) return response(res,403,false,null,'RUN_TOKEN_INVALID'); if(Number(run.expiresAt||0)<Date.now()) return response(res,410,false,null,'RUN_EXPIRED');
  const timeline=validateTimeline(req.body?.events||req.body?.eventTimeline||[]); if(!timeline.ok) return response(res,timeline.code==='PAYLOAD_TOO_LARGE'?413:400,false,null,timeline.code);
  if(Number(req.body?.configVersion||run.configVersion)!==Number(run.configVersion)) return response(res,409,false,null,'CONFIG_VERSION_MISMATCH');
  const activeConfig=await getConfig(); const config=run.configSnapshot||activeConfig; const stage=config.stages.find(s=>s.stageId===run.stageId); if(!stage) return response(res,404,false,null,'STAGE_NOT_FOUND');
  const wallElapsed=Math.max(0,Date.now()-Number(run.startedAt||Date.now())); const maxAllowedDuration=Math.min(Number(stage.durationMs||120000),Math.round(wallElapsed*2.15)+5000); const requestedDuration=Math.max(0,Math.trunc(Number(req.body?.durationMs||0))); if(requestedDuration>maxAllowedDuration) return response(res,422,false,null,'ANTI_CHEAT_REJECTED'); const durationMs=Math.min(Number(stage.durationMs||120000),requestedDuration);
  const progress=await loadProgress(uid); const effective=effectiveConfig(config,{...progress,unitLevels:run.unitLevels||progress.unitLevels}); const allowedUnits=new Map((effective.playerUnits||[]).filter(u=>Number(run.unlockedStage||1)>=Number(u.unlockStage||1)).map(u=>[u.unitId,u])); if(timeline.events.some(e=>!allowedUnits.has(e.unitId)||e.timestampMs>durationMs)) return response(res,422,false,null,'ANTI_CHEAT_REJECTED');
  const snapshot=Sim.simulateBattle({config:effective,stage,seed:run.seed,events:timeline.events,durationMs});
  if(snapshot.invalidEvents.length) return response(res,422,false,{reasons:snapshot.invalidEvents},'ANTI_CHEAT_REJECTED');
  const client=req.body?.clientResult||{}; if(client&&Object.keys(client).length){ const mismatch=Math.abs(Number(client.playerBaseHp||0)-snapshot.playerBaseHp)>3||Math.abs(Number(client.enemyBaseHp||0)-snapshot.enemyBaseHp)>3||String(client.winner||snapshot.winner)!==snapshot.winner; if(mismatch) return response(res,422,false,null,'ANTI_CHEAT_REJECTED'); }
  const locked=await setLock(`pm:idempotency:${uid}:matrix-siege:${idem}`,DONE_TTL_MS).catch(()=>false); if(!locked&&isProduction()) return response(res,409,false,null,'IDEMPOTENCY_REPLAY');
  const stars=computeStars(stage,snapshot); const win=snapshot.winner==='player'; const requestedXp=win?Math.min(1000,Number(config.xp.baseWin||0)+stars*Number(config.xp.perStar||0)+(stage.isBoss?Number(config.xp.bossBonus||0):0)):0; const crystals=win?Number(config.crystals.baseWin||0)+stars*Number(config.crystals.perStar||0)+(stage.isBoss?Number(config.crystals.bossBonus||0):0):0;
  const deltas=missionDeltas(config,stage,snapshot,timeline.events,stars); const missionState=updateMissionProgress(config,progress,deltas); let xpAwarded=0; let progression=getProgression(0); let nextProgress={};
  const {db}=initFirebaseAdmin();
  if(db){
    const userRef=db.collection('users').doc(uid); const progressRef=userRef.collection('gameProgress').doc('matrixSiege'); const runRef=db.collection('matrixSiegeRuns').doc(runId); const dailyRef=db.collection('classicDailyXp').doc(`${uid}_${dateKey()}`);
    await db.runTransaction(async tx=>{
      const prior=await tx.get(runRef); if(prior.exists){ nextProgress=(await tx.get(progressRef)).data()||progress; xpAwarded=Number(prior.data()?.xpAwarded||0); progression=prior.data()?.progression||getProgression(0); return; }
      const [userSnap,progressSnap,dailySnap]=await Promise.all([tx.get(userRef),tx.get(progressRef),tx.get(dailyRef)]); const userData=userSnap.exists?(userSnap.data()||{}):{}; const currentXp=normalizeXpBigInt(userData.xp??userData.accountXp??0); const currentProg=getProgression(currentXp); const usedDaily=Math.max(0,Number(dailySnap.exists?(dailySnap.data().usedXp||0):0)); xpAwarded=currentProg.isMaxLevel?0:Math.min(requestedXp,Math.max(0,DAILY_CLASSIC_XP_CAP-usedDaily)); progression=getProgression(currentXp+BigInt(xpAwarded));
      const old=progressSnap.exists?(progressSnap.data()||progress):progress; const oldStage=old.completedStages?.[`stage-${stage.stageId}`]||{}; nextProgress={...old,currentStage:stage.stageId,unlockedStage:Math.max(Number(old.unlockedStage||1),win?Math.min(20,stage.stageId+1):stage.stageId),totalStars:Math.max(0,Number(old.totalStars||0)-Number(oldStage.stars||0)+stars),technologyCrystals:Math.max(0,Number(old.technologyCrystals||0)+crystals),completedStages:{...(old.completedStages||{}),[`stage-${stage.stageId}`]:{stars:Math.max(Number(oldStage.stars||0),stars),bestDurationMs:win?Math.min(Number(oldStage.bestDurationMs||Infinity),snapshot.nowMs):Number(oldStage.bestDurationMs||0),wins:Number(oldStage.wins||0)+(win?1:0),updatedAt:Date.now()}},...missionState,updatedAt:Date.now()};
      tx.set(progressRef,nextProgress,{merge:false}); tx.set(userRef,{xp:progression.xp,accountXp:progression.xp,level:progression.accountLevel,accountLevel:progression.accountLevel,accountLevelProgressPct:progression.progressPercent,progression,monthlyActiveScore:Math.max(0,Number(userData.monthlyActiveScore||0))+1,updatedAt:Date.now()},{merge:true}); tx.set(dailyRef,{uid,dateKey:dateKey(),usedXp:usedDaily+xpAwarded,dailyCap:DAILY_CLASSIC_XP_CAP,updatedAt:Date.now(),expiresAt:Date.now()+3*86400000},{merge:true}); tx.set(runRef,{uid,game:GAME,stageId:stage.stageId,configVersion:config.version,stars,win,snapshot,xpAwarded,crystals,progression,idempotencyKey:idem,createdAt:Date.now()},{merge:false}); if(xpAwarded>0) tx.set(db.collection('ledger').doc(`matrix_siege_xp_${runId}`),{uid,operationType:'matrix-siege-xp',type:'game-xp',amount:xpAwarded,idempotencyKey:idem,createdAt:Date.now(),at:Date.now()},{merge:false});
    });
  } else {
    const key=`matrix-siege:progress:${uid}`; const oldStage=progress.completedStages?.[`stage-${stage.stageId}`]||{}; nextProgress={...progress,currentStage:stage.stageId,unlockedStage:Math.max(Number(progress.unlockedStage||1),win?Math.min(20,stage.stageId+1):stage.stageId),technologyCrystals:Number(progress.technologyCrystals||0)+crystals,totalStars:Math.max(0,Number(progress.totalStars||0)-Number(oldStage.stars||0)+stars),completedStages:{...(progress.completedStages||{}),[`stage-${stage.stageId}`]:{stars:Math.max(Number(oldStage.stars||0),stars),bestDurationMs:win?Math.min(Number(oldStage.bestDurationMs||Infinity),snapshot.nowMs):Number(oldStage.bestDurationMs||0),wins:Number(oldStage.wins||0)+(win?1:0),updatedAt:Date.now()}},...missionState}; runtimeStore.temporary.set(key,nextProgress,30*86400000); xpAwarded=requestedXp; progression=getProgression(BigInt(xpAwarded));
  }
  const result={runId,stageId:stage.stageId,win,winner:snapshot.winner,stars,durationMs:snapshot.nowMs,playerBaseHp:snapshot.playerBaseHp,enemyBaseHp:snapshot.enemyBaseHp,defeatedEnemies:snapshot.defeatedEnemies,xpAwarded,crystalsAwarded:crystals,progression,progress:nextProgress,missions:missionView(config,nextProgress)};
  await storeDone(uid,idem,result); await deleteRun(uid,runId); recordRecentActivity({id:`matrix-siege:${runId}`,source:GAME,game:GAME,title:'Matrix Siege Bölüm Sonucu',username:req.user?.username||req.user?.displayName||'Oyuncu',uid,xp:xpAwarded,outcome:win?'win':'loss',rewardLabel:win?`${stars} yıldız • +${xpAwarded} XP`:'Bölüm tamamlanamadı'});
  return response(res,200,true,result);
});

router.post('/claim-mission',strictLimiter,requireAuth,requireAgeGate,requireVerifiedEmail,async(req,res)=>{
  const uid=String(req.user.uid); const missionId=String(req.body?.missionId||'').trim(); const config=await getConfig(); const mission=config.missions.find(m=>m.missionId===missionId); if(!mission) return response(res,404,false,null,'MISSION_NOT_FOUND'); const {db}=initFirebaseAdmin(); let output;
  if(db){ const ref=db.collection('users').doc(uid).collection('gameProgress').doc('matrixSiege'); await db.runTransaction(async tx=>{ const snap=await tx.get(ref); const p=snap.exists?(snap.data()||defaultProgress()):defaultProgress(); if(p.dailyMissionDate!==dateKey()||Number(p.missionProgress?.[missionId]||0)<Number(mission.target)) throw Object.assign(new Error('MISSION_NOT_COMPLETE'),{code:'MISSION_NOT_COMPLETE'}); if(p.missionClaims?.[missionId]) throw Object.assign(new Error('MISSION_ALREADY_CLAIMED'),{code:'MISSION_ALREADY_CLAIMED'}); output={...p,technologyCrystals:Number(p.technologyCrystals||0)+Number(mission.rewardCrystals||0),missionClaims:{...(p.missionClaims||{}),[missionId]:true},updatedAt:Date.now()}; tx.set(ref,output,{merge:false}); }); }
  else { const p=await loadProgress(uid); if(p.dailyMissionDate!==dateKey()||Number(p.missionProgress?.[missionId]||0)<Number(mission.target)) return response(res,409,false,null,'MISSION_NOT_COMPLETE'); if(p.missionClaims?.[missionId]) return response(res,409,false,null,'MISSION_ALREADY_CLAIMED'); output={...p,technologyCrystals:Number(p.technologyCrystals||0)+Number(mission.rewardCrystals||0),missionClaims:{...(p.missionClaims||{}),[missionId]:true}}; runtimeStore.temporary.set(`matrix-siege:progress:${uid}`,output,30*86400000); }
  return response(res,200,true,{progress:output,missions:missionView(config,output)});
});

router.post('/upgrade-unit',strictLimiter,requireAuth,requireAgeGate,requireVerifiedEmail,async(req,res)=>{
  const uid=String(req.user.uid); const unitId=String(req.body?.unitId||'').trim(); const config=await getConfig(); const unit=config.playerUnits.find(u=>u.unitId===unitId); if(!unit) return response(res,404,false,null,'UNIT_NOT_FOUND'); const {db}=initFirebaseAdmin(); let output;
  if(db){ const ref=db.collection('users').doc(uid).collection('gameProgress').doc('matrixSiege'); await db.runTransaction(async tx=>{ const snap=await tx.get(ref); const p=snap.exists?(snap.data()||defaultProgress()):defaultProgress(); const level=Math.max(1,Number(p.unitLevels?.[unitId]||1)); if(level>=10) throw Object.assign(new Error('UNIT_MAX_LEVEL'),{code:'UNIT_MAX_LEVEL'}); const cost=Number(config.upgradeCosts[level]||999999); if(Number(p.technologyCrystals||0)<cost) throw Object.assign(new Error('INSUFFICIENT_CRYSTALS'),{code:'INSUFFICIENT_CRYSTALS'}); output={...p,technologyCrystals:Number(p.technologyCrystals||0)-cost,unitLevels:{...(p.unitLevels||{}),[unitId]:level+1},updatedAt:Date.now()}; tx.set(ref,output,{merge:false}); }); }
  else { const p=await loadProgress(uid); const level=Math.max(1,Number(p.unitLevels?.[unitId]||1)); if(level>=10) return response(res,409,false,null,'UNIT_MAX_LEVEL'); const cost=Number(config.upgradeCosts[level]||999999); if(Number(p.technologyCrystals||0)<cost) return response(res,409,false,null,'INSUFFICIENT_CRYSTALS'); output={...p,technologyCrystals:Number(p.technologyCrystals||0)-cost,unitLevels:{...(p.unitLevels||{}),[unitId]:level+1}}; runtimeStore.temporary.set(`matrix-siege:progress:${uid}`,output,30*86400000); }
  return response(res,200,true,{progress:output});
});

router.get('/admin/config',requireAuth,requireAdmin,async(req,res)=>{ const config=await getConfig(); return response(res,200,true,config); });
router.patch('/admin/config',strictLimiter,requireAuth,requireAdmin,requireAdminReauth,async(req,res)=>{ const config=await saveConfig(req.body?.config||req.body||{}, {uid:req.user.uid,email:req.user.email}); await writeAdminAudit(req,'admin.matrix-siege.config.publish',{version:config.version,energy:config.energy,xp:config.xp}); return response(res,200,true,config); });

router.use((error,req,res,next)=>{ if(!error) return next(); const code=String(error.code||error.message||'UNKNOWN_ERROR'); if(['MISSION_NOT_COMPLETE','MISSION_ALREADY_CLAIMED','UNIT_MAX_LEVEL','INSUFFICIENT_CRYSTALS'].includes(code)) return response(res,409,false,null,code); console.error('[matrix-siege:error]',JSON.stringify({code,message:String(error.message||'').slice(0,180)})); return response(res,500,false,null,'UNKNOWN_ERROR'); });
module.exports={router};
