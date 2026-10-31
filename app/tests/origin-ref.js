// 测试对照用：vicliaaa/origin-sillytavern v1.5 index.js 的结算函数，原样改成能在 node 里跑的形式（状态与设置显式传入，去掉 DOM 与酒馆全局）。
// 只用于断言新核心与原插件行为一致，不属于产品代码。函数体保持原文，仅把 meta()/settings()/curTurn() 换成闭包变量。
export function createRef(S, random = Math.random) {
    let st = null;
    let TURN = 0;
    const settings = () => S;
    const curTurn = () => TURN;
    const saveMeta = () => {};
    const renderPanel = () => {};
    const markNew = () => {};
    const meta = () => st;

    function cleanNum(x){ const n = parseInt(String(x).replace(/[^0-9-]/g,''),10); return isNaN(n)?0:n; }
    function findTask(st,idOrTitle){ const d=String(idOrTitle==null?'':idOrTitle).replace(/[^0-9]/g,''); if(d!==''){ const t=st.tasks.find(x=>String(x.id)===d); if(t) return t; } const q=String(idOrTitle==null?'':idOrTitle).trim(); if(!q) return undefined; return st.tasks.find(x=>x.status==='active' && (x.title===q || q.indexOf(x.title)>=0 || (x.title&&x.title.indexOf(q)>=0))); }
    function pushLog(st,text,mark){ st.log.push({text, mark:mark||''}); if(st.log.length>40) st.log=st.log.slice(-40); }
    function addItem(st,name,count,src){
      name=String(name||'').replace(/^[「『"']+|[」』"']+$/g,'').trim(); count=parseInt(count,10)||1;
      if(!name || /积分|经验|等级|好感|回合/.test(name) || /^[+-]?\d+$/.test(name)) return false;
      st._grantT=st._grantT||{}; const t=curTurn();
      if(src!=='buy' && st._grantT[name]===t) return false;
      st._grantT[name]=t; if(Object.keys(st._grantT).length>60){ const ks=Object.keys(st._grantT); for(const k of ks.slice(0,ks.length-60)) delete st._grantT[k]; }
      const ex=st.bag.find(b=>b.name===name); if(ex) ex.count=(ex.count||1)+count; else st.bag.push({name,count,desc:'',effect:''});
      pushLog(st,'获得物品「'+name+'」×'+count+(src?'（'+src+'）':''),'·'); return true;
    }
    function addPerk(st,name,desc,kind){
      name=String(name||'').replace(/^[「『【"']+|[」』】"']+$/g,'').replace(/^(开启|获得|解锁|激活|授予|了)+/,'').replace(/(已)?(开启|解锁|激活)$/,'').trim();
      if(!name || name.length<2) return false; st.perks=st.perks||[];
      if(!kind){ const km=name.match(/(权限|特权|称号|资格|功能|头衔|身份)/); kind=km?km[1]:'权限'; }
      const ex=st.perks.find(k=>k.name===name); if(ex){ if(desc && !ex.desc) ex.desc=desc; return false; }
      st.perks.push({name,kind,desc:String(desc||'').trim(),turn:curTurn()}); pushLog(st,'开启'+kind+'「'+name+'」'+(desc?'：'+desc:''),'★'); return true;
    }
    function addRewardLog(st,text,kind){
      text=String(text||'').trim(); if(!text) return false; st.rewardsLog=st.rewardsLog||[];
      const t=curTurn(); if(st.rewardsLog.some(r=>r.text===text && r.turn===t)) return false;
      st.rewardsLog.push({turn:t,kind:kind||'',text}); if(st.rewardsLog.length>40) st.rewardsLog=st.rewardsLog.slice(-40); return true;
    }
    function grantFromText(st,str){
      if(!str) return 0; let n=0; str=String(str);
      for(const r of str.matchAll(/([一-龥A-Za-z·]{2,12}?)\s*[×xX]\s*(\d{1,3})/g)){ if(addItem(st,r[1].replace(/^(和|与|及|还有|以及|获得|发放|奖励|存入|背包|的)+/,''),r[2],'奖励')) n++; }
      for(const r of str.matchAll(/(?:开启|获得|解锁|激活|授予|获取)(?:了)?\s*[「『【]?([^「」『』【】\n，,。；;：:、]{2,24}?(?:权限|特权|资格|功能|称号|头衔))[」』】]?/g)){ if(addPerk(st,r[1],'')) n++; }
      for(const r of str.matchAll(/(?:权限|特权|称号|头衔)\s*[：:]\s*[「『【]?([^」』】\n，,。；;]{2,30})/g)){ if(addPerk(st,r[1],'')) n++; }
      return n;
    }
    function addSkill(st,name,desc){ name=String(name||'').replace(/^[「『"']+|[」』"']+$/g,'').trim(); if(!name) return false; st.skills=st.skills||[]; const ex=st.skills.find(k=>k.name===name); if(ex){ if(desc && !ex.desc) ex.desc=desc; return false; } st.skills.push({name,desc:String(desc||'').trim(),turn:curTurn()}); pushLog(st,'获得技能「'+name+'」'+(desc?'：'+desc:''),'★'); return true; }
    function applyEffects(st, str, sign){
      if(!str) return;
      let m;
      if(sign>0){ grantFromText(st,str); const reK=/技能\s*[：:]?\s*[「『"']?([^「」『』"'，,;；、。\s]{1,20})[」』"']?(?:[（(]([^）)]{0,80})[）)])?/g; while((m=reK.exec(str))) addSkill(st,m[1],m[2]||''); }
      const reP = /积分\s*([+-]?\d+)/g; while((m=reP.exec(str))){ const dv=cleanNum(m[1])*(m[1].match(/^[+-]/)?1:sign>=0?1:-1); st.points += dv; st._ptT=st._ptT||{}; st._ptT[curTurn()]=(st._ptT[curTurn()]||[]).concat([dv]); }
      const reS = /([一-龥A-Za-z·]{1,8}?)\s*([+-]\d+)/g;
      while((m=reS.exec(str))){
        const name=m[1].trim(); if(name==='积分'||!name) continue;
        let st2 = st.stats.find(x=>x.name===name);
        if(!st2){ st2={name,val:0}; st.stats.push(st2); }
        st2.val += cleanNum(m[2]);
      }
    }
    function completeTask(st,t){ if(!t||t.status!=='active') return; t.status='done'; t.progress=100; applyEffects(st,t.reward,1); const gain=t.type==='主线'?50:t.type==='支线'?20:10; st.exp+=gain; while(st.exp>=st.expMax){ st.exp-=st.expMax; st.level++; st.expMax=Math.round(st.expMax*1.4); } pushLog(st,'完成「'+t.title+'」'+(t.reward?'　奖励：'+t.reward:''),'✓'); }

    function doneCount(st){ return st.tasks.filter(t=>t.status==='done').length; }
    function hasAch(st,id){ return (st.achievements||[]).some(a=>a.id===id); }
    function unlockAch(st,id,name,desc,bonus){ if(hasAch(st,id)) return false; st.achievements=st.achievements||[]; if(st.achievements.some(a=>a.name===name)) return false; st.achievements.push({id,name,desc:desc||''}); if(bonus) st.points+=bonus; st.pendingEvent=st.pendingEvent||[]; st.pendingEvent.push('宿主解锁成就「'+name+'」'+(desc?'（'+desc+'）':'')+(bonus?'，奖励积分'+bonus:'')); pushLog(st,'解锁成就「'+name+'」'+(bonus?'　+'+bonus:''),'★'); return true; }
    const ACHIEVEMENTS=[
      {id:'first',name:'初出茅庐',desc:'完成第一个任务',cond:st=>doneCount(st)>=1},
      {id:'five',name:'渐入佳境',desc:'完成5个任务',cond:st=>doneCount(st)>=5},
      {id:'fifteen',name:'任务达人',desc:'完成15个任务',cond:st=>doneCount(st)>=15},
      {id:'rich',name:'腰缠万贯',desc:'积分累积到1000',cond:st=>st.points>=1000},
    ];
    function checkAchievements(){ const st=meta(); if(!st||!settings().achieveOn) return; let ch=false; for(const a of ACHIEVEMENTS){ if(!hasAch(st,a.id) && a.cond(st)){ unlockAch(st,a.id,a.name,a.desc,50); ch=true; } } if(ch){ saveMeta(); renderPanel(); } }
    function drawCore(st, free){
      const s=settings();
      if(!st.gachaPool || !st.gachaPool.length) return null;
      if(!free){ if(st.points < s.drawCost) return null; st.points-=s.drawCost; }
      const tot=st.gachaPool.reduce((a,b)=>a+(b.weight||0),0); let r=random()*tot, pick=st.gachaPool[0];
      for(const g of st.gachaPool){ r-=(g.weight||0); if(r<=0){ pick=g; break; } }
      if(/技能/.test(pick.effect||'') || /^技能/.test(pick.tier||'')){ addSkill(st,pick.name,pick.desc||''); }
      else { const ex=st.bag.find(b=>b.name===pick.name); if(ex) ex.count=(ex.count||1)+1; else st.bag.push({name:pick.name,count:1,desc:pick.desc||'',effect:pick.effect||''}); }
      if(pick.tier==='SSR'||pick.tier==='UR') unlockAch(st,'lucky','欧皇附体','抽到 SSR 及以上',0);
      pushLog(st,'抽奖 → '+(pick.tier?'['+pick.tier+']':'')+pick.name+'（入背包）','★');
      return pick;
    }

    function applyBlock(memo, proseTitle){
      const st = meta(); if(!st) return;
      st.lastRaw = memo; proseTitle=proseTitle||'';
      const lines = memo.split('\n').map(l=>l.trim().replace(/^[-•·*＊]\s*|^\d+[.、)）]\s*/,'')).filter(l=>l && l!=='无' && !(/^系统\s*[：:]/.test(l) && l.indexOf('|')<0));
      let changed = 0, gotNew=false, _newG=[], _blkBal=null; const _prevP=st.points;
      for(const line of lines){
        let p = line.split('|').map(x=>x.trim());
        if(/^积分\s*[：:]\s*\d+/.test(line)){ const bv=parseInt(line.replace(/^积分\s*[：:]\s*/,''),10); if(!isNaN(bv)) _blkBal=bv; continue; }
        if(/^\[?(?:主线|支线|日常)?\s*#?\s*\d+\]?$/.test(p[0]) && /^(完成|失败)$/.test(p[1]||'')){ p=[p[1], p[0].replace(/[^0-9]/g,'')]; }
        if(/^(发布|派发|新任务发布|任务发布|新发布)$/.test(p[0]) && p[1] && !/^(类型|标题|描述|条件|奖励|惩罚|时限|对象)\s*[：:]/.test(p[1])){ const _tt=p[1]; const _rest=p.slice(2).filter(x=>x && x!=='-' && x!=='—'); const _ty=(_rest.find(x=>/^(主线|支线|日常)$/.test(x))||'支线'); const _ds=_rest.filter(x=>!/^(主线|支线|日常)$/.test(x)).join(' '); p=['新任务','类型:'+_ty,'标题:'+_tt.replace(/^(新任务|任务)\s*[：:]\s*/,''),'描述:'+_ds,'条件:'+_ds]; }
        if(/^(获取|奖励|结算|发放)$/.test(p[0])){ const mm=(p.slice(1).join('|')).match(/积分\s*([+-]?\d+)/); if(mm){ p=['积分',mm[1],p.slice(2).join('｜')]; } else { const im=(p[1]||'').match(/^(.+?)\s*[×xX]\s*(\d+)$/); p= im ? ['获得',im[1],im[2]] : ['获得',p[1]||'',p[2]||'1']; } }
        if(p.length>=3 && !/^(进度|完成|失败|新任务|积分|属性|播报|获得|用道具|消耗|买|购买|抽奖|成就|新商品|新奖品|私聊|时限)/.test(p[0]) && /^\d+$/.test(p[1]) && /^\d{1,3}\s*%?$/.test(p[2])){ const _tt=p[0]; p.splice(0,1,'进度'); if(!findTask(st,p[1])) p[1]=_tt; }
        const tag = p[0];
        if(tag==='进度'){ let t=findTask(st,p[1]);
          if(!t && proseTitle){ t={id:st.nextId++, type:'支线', owner:((settings().bindTo&&settings().bindTo!=='宿主')?settings().bindTo:'宿主'), title:proseTitle, desc:proseTitle, cond:'', reward:'', penalty:'', limit:0, progress:0, status:'active', turn:curTurn(), startTurn:curTurn()}; st.tasks.push(t); st.lastTaskTurn=curTurn(); pushLog(st,'（自动补建任务）'+t.title,'·'); }
          if(t){ const _np=Math.max(0,Math.min(100,cleanNum(p[2]))); const _same=(_np===t.progress); t.progress=_np; if(p[3] && !(_same && /无进展|无变化|没有进展/.test(p[3]))) pushLog(st,t.title+'：'+p[3]); if(t.status==='active' && t.progress>=100){ completeTask(st,t); } changed++; } }
        else if(tag==='完成'){ const t=findTask(st,p[1]); if(t && t.status==='active'){ completeTask(st,t); changed++; } }
        else if(tag==='失败'){ const t=findTask(st,p[1]); if(t && t.status==='active'){ t.status='failed'; applyEffects(st,t.penalty,-1); pushLog(st,'任务「'+t.title+'」失败'+(t.penalty?'　'+t.penalty:''),'!'); if(settings().punishEvent){ st.pendingEvent=st.pendingEvent||[]; st.pendingEvent.push('任务「'+t.title+'」失败'+(t.penalty?'（'+t.penalty+'）':'')+'，请让剧情出现一个相称的不利后果'+(settings().penaltyPref?'（后果倾向：'+settings().penaltyPref+'）':'')); } changed++; } }
        else if(tag==='新任务'){
          const fields={}; let hasLabel=false;
          for(let i=1;i<p.length;i++){ const mm=String(p[i]||'').match(/^\s*(类型|标题|名称|描述|说明|完成条件|条件|奖励|失败惩罚|惩罚|时限|对象|归属|奖|罚)\s*[：:]\s*([\s\S]*)$/); if(mm){ fields[mm[1]]=mm[2].trim(); hasLabel=true; } }
          const g=(...ks)=>{ for(const k of ks){ if(fields[k]!=null && fields[k]!=='') return fields[k]; } return ''; };
          let ty,title,desc,cond,reward,penalty,lim;
          if(hasLabel){ ty=g('类型'); title=(g('标题','名称')||'').trim(); desc=g('描述','说明'); cond=g('完成条件','条件'); reward=g('奖励'); penalty=g('失败惩罚','惩罚','罚'); lim=cleanNum(g('时限')); }
          else { ty=p[1]; title=(p[2]||'').trim(); desc=p[3]||''; cond=p[4]||''; reward=p[5]||''; penalty=p[6]||''; lim=p[7]?cleanNum(p[7]):0; }
          if(!lim){ const _m=line.match(/时限\s*[：:]?\s*(\d+)/); if(_m) lim=parseInt(_m[1],10)||0; }
          if(!title && proseTitle) title=proseTitle;
          if(!['主线','支线','日常'].includes(ty)) ty='支线';
          if(title){ const t={ id:st.nextId++, type:ty, owner:((fields['对象']||fields['归属']|| (settings().bindTo&&settings().bindTo!=='宿主'?settings().bindTo:'宿主')).trim()||'宿主'), title, desc, cond, reward, penalty, limit:lim, progress:0, status:'active', turn:curTurn(), startTurn:curTurn() };
          st.tasks.push(t); st.lastTaskTurn=curTurn(); gotNew=true; pushLog(st,'新任务['+t.type+']「'+t.title+'」','·'); changed++; } }
        else if(tag==='积分'){ st.points += cleanNum(p[1]); if(p[2]) pushLog(st,'积分'+p[1]+'（'+p[2]+'）'); changed++; }
        else if(tag==='属性'){ let s2=st.stats.find(x=>x.name===p[1]); if(!s2){ s2={name:p[1],val:0}; st.stats.push(s2);} s2.val+=cleanNum(p[2]); changed++; }
        else if(tag==='新奖品'){ const nm=p[1]; if(nm){ _newG.push({name:nm,tier:(p[2]||'R'),weight:cleanNum(p[3])||10,desc:p[4]||'',effect:(p[5]||'')}); } }
        else if(tag==='新商品'){ const nm=p[1]; if(nm){ const it={name:nm,price:cleanNum(p[2])||300,desc:p[3]||'',effect:(p[4]||'')}; const ex=st.shop.find(x=>x.name===nm); if(ex) Object.assign(ex,it); else st.shop.push(it); if(st.shop.length>12) st.shop=st.shop.slice(-12); st.lastShopTurn=curTurn(); changed++; } }
        else if(tag==='获得'){ const nm=p[1]; if(nm){ const c=cleanNum(p[2])||1; if(/^(.+?)\s*[×xX]\s*\d+$/.test(nm)){ const im=nm.match(/^(.+?)\s*[×xX]\s*(\d+)$/); if(addItem(st,im[1],im[2],'')) changed++; } else if(addItem(st,nm,c,'')){ const b=st.bag.find(x=>x.name===nm); if(b && p[3] && !b.desc) b.desc=p[3]; changed++; } } }
        else if(tag==='权限'||tag==='特权'||tag==='称号'||tag==='功能'||tag==='头衔'){ if(addPerk(st,p[1],p.slice(2).join('｜'),tag)) changed++; }
        else if(tag==='买'||tag==='购买'){ const nm=p[1]; if(nm){ let it=st.shop.find(x=>x.name===nm); if(!it) it=st.shop.find(x=>nm.indexOf(x.name)>=0||x.name.indexOf(nm)>=0); if(it && st.points>=it.price){ st.points-=it.price; const ex=st.bag.find(b=>b.name===it.name); if(ex) ex.count=(ex.count||1)+1; else st.bag.push({name:it.name,count:1,desc:it.desc,effect:it.effect||''}); pushLog(st,'（角色）购买「'+it.name+'」(-'+it.price+')','·'); changed++; } } }
        else if(tag==='抽奖'){ const pk=drawCore(st,false); if(pk){ st.pendingEvent=st.pendingEvent||[]; st.pendingEvent.push('抽奖抽中了'+(pk.tier?pk.tier+'级':'')+'「'+pk.name+'」'+(pk.desc?'（'+pk.desc+'）':'')+'，请把开箱那一刻写进正文'); changed++; } }
        else if(tag==='用道具'||tag==='消耗'){ const nm=p[1]; if(nm){ let b=st.bag.find(x=>x.name===nm); if(!b) b=st.bag.find(x=>nm.indexOf(x.name)>=0||x.name.indexOf(nm)>=0); if(b){ b.count=(b.count||1)-(cleanNum(p[2])||1); if(b.count<=0) st.bag.splice(st.bag.indexOf(b),1); pushLog(st,'消耗物品「'+nm+'」','·'); changed++; } } }
        else if(tag==='播报'){ pushLog(st, p.slice(1).join('｜'),'“'); changed++; }
        else if(tag==='私聊'){ const who=String(p[1]||'').trim(); const txt=p.slice(2).join('|').trim(); if(txt){ st.chat=st.chat||[]; st.chat.push({who:/系统/.test(who)?'sys':'char', name:who, text:txt, turn:curTurn()}); if(st.chat.length>80) st.chat=st.chat.slice(-80); changed++; } }
        else if(tag==='技能'||tag==='获得技能'||tag==='解锁技能'){ if(addSkill(st,p[1],p.slice(2).join('｜'))) changed++; }
        else if(tag==='时限'){ const t=findTask(st,p[1]); const n=cleanNum(p[2]); if(t && t.status==='active' && n>0){ t.limit=n; t.startTurn=curTurn(); pushLog(st,t.title+'：时限改为 '+n+' 回合','·'); changed++; } }
        else if(tag==='成就'){ if(unlockAch(st,'m_'+(p[1]||''),p[1]||'成就',p[2]||'',100)) changed++; }
      }
      if(_newG.length){ st.gachaPool=_newG; st.lastGachaTurn=curTurn(); changed++; }
      if(_blkBal!=null && _blkBal!==_prevP && _blkBal!==st.points){ st.points=_blkBal; pushLog(st,'积分同步为 '+_blkBal+'（按数据块余额）','·'); changed++; }
      if(changed){ saveMeta(); renderPanel(); markNew(true); }
      checkAchievements();
    }

    const BLK_TAG = '(?:origin[^>]*|数据[板块]|系统数据[板块]?|origin\\s*数据[板块])';
    function extractBlock(text){
      text=String(text||''); if(!text) return null;
      const masked=text.replace(/<(thinking|think|thought)>[\s\S]*?<\/\1>/gi, x=>' '.repeat(x.length));
      const openRe=new RegExp('<'+BLK_TAG+'>|```\\s*(?:origin|数据[板块]|系统数据)[^\\n]*\\n','gi'); let last=null, mm;
      while((mm=openRe.exec(masked))!==null) last=mm;
      if(!last) return null;
      const isFence=last[0].startsWith('```');
      const bodyStart=last.index+last[0].length;
      const after=masked.slice(bodyStart);
      const cm=after.match(isFence ? /```\s*/ : new RegExp('<\\/'+BLK_TAG+'>\\s*','i'));
      const bodyLen=cm?cm.index:after.length;
      const end=cm?(bodyStart+cm.index+cm[0].length):text.length;
      if(!cm){ const tail=text.slice(bodyStart).replace(/\s/g,''); if(tail.length>1500) return null; }
      return { memo:text.slice(bodyStart, bodyStart+bodyLen), start:last.index, end };
    }
    function syncPointsFromProse(st, prose, blockHadPoints, prevPoints){
      if(!prose) return false; prose=String(prose).replace(/<[^>]+>/g,' ');
      let bal=null;
      for(const r of prose.matchAll(/(?:积分余额|当前积分|剩余积分|积分)\s*[：:]\s*(\d{1,7})(?!\s*[%％])/g)) bal=parseInt(r[1],10);
      if(bal!=null && !isNaN(bal)){
        if(prevPoints!=null && bal===prevPoints && blockHadPoints) return false;
        if(bal!==st.points){ st.points=bal; pushLog(st,'积分同步为 '+bal+'（按正文余额）','·'); return true; }
        return false;
      }
      if(blockHadPoints) return false;
      let ch=false;
      for(const seg of prose.split(/[。\n]/)){
        if(!/(奖励发放|发放|到账|结算|已存入|存入|已获得|扣除|扣减|惩罚)/.test(seg)) continue;
        if(/(任务奖励|奖励[：:]|完成后|达成后|可获得|将获得|即可获得)/.test(seg) && !/(发放|存入|到账|已获得)/.test(seg)) continue;
        const neg=/(扣除|扣减|惩罚|扣)/.test(seg);
        for(const r of seg.matchAll(/积分\s*([+-]?\d{1,6})/g)){ let v=parseInt(r[1],10); if(isNaN(v)) continue; if(!/^[+-]/.test(r[1]) && neg) v=-v; const _pt=(st._ptT||{})[curTurn()]||[]; const _ix=_pt.indexOf(v); if(_ix>=0){ _pt.splice(_ix,1); continue; } st.points+=v; ch=true; }
      }
      if(ch) pushLog(st,'积分按正文补记，现为 '+st.points,'·');
      return ch;
    }
    function syncBagFromProse(st, prose, blockHadGet){
      if(!prose || blockHadGet) return 0; prose=String(prose).replace(/<[^>]+>/g,' '); let n=0;
      for(const seg of prose.split(/[。\n]/)){
        if(!/(奖励发放|奖励已发放|发放|已存入背包|存入背包|放入背包|已放入|到账|已获得|获得)/.test(seg)) continue;
        if(/(任务奖励|奖励[：:]|完成后|达成后|可获得|将获得|即可获得)/.test(seg) && !/(发放|存入|到账|已获得)/.test(seg)) continue;
        for(const r of seg.matchAll(/([一-龥A-Za-z·]{2,12}?)\s*[×xX]\s*(\d{1,3})/g)){
          const nm=r[1].replace(/^(和|与|及|还有|以及|获得|发放|奖励|存入|背包|的)+/,'').trim(); const c=parseInt(r[2],10)||1;
          if(!nm || /积分|等级|回合|次|人|天|分钟|小时/.test(nm)) continue;
          if(addItem(st,nm,c,'按正文补记')) n++;
        }
      }
      return n;
    }
    function syncSkillsFromProse(st, prose){
      if(!prose) return 0; prose=String(prose).replace(/<[^>]+>/g,' '); let n=0;
      for(const r of prose.matchAll(/(?:获得|解锁|习得|激活)(?:被动|主动)?技能\s*[「『【]([^」』】\n]{1,20})[」』】]/g)){
        let desc=''; const d=prose.slice(r.index).match(/技能说明\s*[：:]\s*([^】\n。]{2,120})/); if(d) desc=d[1].trim();
        if(addSkill(st,r[1],desc)) n++;
      }
      return n;
    }
    // 一楼的完整结算（原 applyMessage 里「数据块 + 正文积分 + 正文背包 + 正文技能」；奖励流水、正文权限、阶段任务这几段没有对照）
    function settleFloor(turn, text, block, title){
      TURN=turn; st._grantT=undefined;
      const prev=st.points;
      if(block && block!=='无') applyBlock(block, title||'');
      syncPointsFromProse(st, text, !!(block && /(^|\n)\s*积分\|/.test(block)), prev);
      syncBagFromProse(st, text, !!(block && /(^|\n)\s*获得\|/.test(block)));
      syncSkillsFromProse(st, text);
    }
    return {
      init(initial){ st=initial; return st; }, get state(){ return st; }, setTurn(n){ TURN=n; },
      extractBlock, applyBlock, settleFloor, drawCore, completeTask, addItem, findTask, checkAchievements,
    };
}
