"use strict";
(function(){
const C=window.FOMO_CONFIG,FILES=["status","signals","positions","trades","risk","report","settings","live"];
const KEY="fomo_desk_t",STALE_S=180,REFRESH_MS=30000;
let D={},tab="status",sig=null,F="all",timer=null;
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=(v,d=4)=>v==null||isNaN(v)?"–":Number(v).toFixed(d);
// ---- token gate (unchanged logic): SHA-256 of #t= fragment, stripped from URL, kept in localStorage
async function sha(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function takeToken(){const m=location.hash.match(/(?:^#|&)t=([^&]+)/);
 if(m){localStorage.setItem(KEY,decodeURIComponent(m[1]));history.replaceState(null,"",location.pathname+location.search)}
 return localStorage.getItem(KEY)}
async function gate(){const t=takeToken();if(!t||await sha(t)!==C.tokenHash){localStorage.removeItem(KEY);return false}return true}
async function load(){
 const cb=Date.now(),base="d/"+C.dataPath+"/";
 const r=await Promise.all(FILES.map(f=>fetch(base+f+".json?cb="+cb,{cache:"no-store"}).then(x=>x.ok?x.json():null).catch(()=>null)));
 FILES.forEach((f,i)=>{if(r[i])D[f]=r[i]});render(false)}
// ---- helpers
const utc=s=>s?Date.parse(s.includes("T")?s:s.replace(" ","T")+"Z"):NaN;
function ageS(iso){if(!iso)return null;return(Date.now()-utc(iso))/1000}
function fmtAge(s){if(s==null||isNaN(s))return"–";if(s<90)return Math.round(s)+"s";if(s<5400)return Math.round(s/60)+"m";return(s/3600).toFixed(1)+"h"}
const hm=s=>{const t=utc(s);return isNaN(t)?"–":new Date(t).toLocaleTimeString("en-GB",{timeZone:"Europe/Madrid",hour:"2-digit",minute:"2-digit"})};
const short=m=>m?m.slice(0,4)+"…"+m.slice(-4):"";
const sym=s=>s.symbol?"$"+s.symbol:short(s.mint);
const usd=v=>v==null?"–":v>=1e6?"$"+(v/1e6).toFixed(1)+"M":v>=1e3?"$"+(v/1e3).toFixed(1)+"k":"$"+Number(v).toFixed(0);
const sol=v=>(v>0?"+":"")+num(v,3);
const layers=s=>Object.entries(s.layers||{}).sort((a,b)=>a[0]-b[0]).map(([k,v])=>({n:+k,name:v.name,r:v.result}));
const all8=s=>{const l=layers(s);return l.length===8&&l.every(x=>x.r==="pass")};
const probs=s=>{const m=((s.verdict||{}).reasoning||"").match(/P BUY ([\d.]+) \/ WATCH ([\d.]+) \/ PASS ([\d.]+)/);return m?{buy:+m[1],watch:+m[2],pass:+m[3]}:null};
const FILTERS={all:()=>true,buy:s=>s.verdict&&s.verdict.verdict==="BUY",all8,hour:s=>Date.now()-utc(s.created_at)<3600e3};
const link=(u,cls="btn")=>/^https:\/\//.test(u||"")?`<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener">Open in pump.fun</a>`:"";
const set=k=>{const o=D.settings&&D.settings.data&&D.settings.data[k];return o&&typeof o==="object"?o.value:o};
const maxHold=()=>+(set("max_hold_min")||60);
const openPos=()=>(D.positions&&D.positions.data||[]).filter(p=>p.status==="open");  // real open positions only
function countdown(p){const left=utc(p.opened_at)+maxHold()*60e3-Date.now();if(isNaN(left))return"–";if(left<=0)return"closing";const m=Math.floor(left/60e3),s=Math.floor(left/1e3)%60;return m+":"+String(s).padStart(2,"0")}
const holdFrac=p=>Math.min(1,Math.max(0,(Date.now()-utc(p.opened_at))/(maxHold()*60e3)));
const css=k=>getComputedStyle(document.documentElement).getPropertyValue(k).trim();
function header(){
 const st=D.status&&D.status.data||{};const m=$("#mode");m.textContent=st.mode||"?";m.className="pill "+esc(st.mode||"");
 $("#date").textContent=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",timeZone:"Europe/Madrid"});
 const a=D.status?ageS(D.status.generated_at):null;$("#age").textContent="updated "+fmtAge(a)+" ago";const s=$("#stale");
 if(a==null||a>STALE_S){s.hidden=false;s.textContent="⚠ Stale data: last publish "+fmtAge(a)+" ago (>3 min)."}else s.hidden=true}
const posCard=p=>`<div class="pos"><div class="cdw"><canvas class="ring" data-o="${esc(p.opened_at)}"></canvas><span class="cd" data-o="${esc(p.opened_at)}">${countdown(p)}</span></div>
 <div style="flex:1;min-width:0"><b>${esc(short(p.mint))}</b> <span class="pill">${esc(p.mode)}</span><div class="mute">${num(p.cost_sol,3)} SOL · SL ${esc(p.stop_loss_pct)}% · TP ${esc(p.take_profit_pct)}% · closes at max hold ${maxHold()} min</div>${link(p.coin_url)}</div></div>`;
const V={
status(){const s=D.status&&D.status.data;if(!s)return"<p class=mute>No data</p>";const r=D.report&&D.report.data||{},p=r.paper||{},hb=s.heartbeats||[],op=openPos();
 const ok=hb.filter(h=>{const a=ageS(h.last_beat);return a!=null&&a<180}).length;
 return`<div class="sum"><div><span class="mute">P&L today</span><b class="${p.realized_pnl_sol<0?"bad":p.realized_pnl_sol>0?"ok":""}">${sol(p.realized_pnl_sol||0)}</b><span class="mute">SOL paper</span></div>
 <div><span class="mute">Signals</span><b>${esc(r.signals??"–")}</b><span class="mute">${esc((r.verdicts||{}).WATCH||0)} watch · ${esc((r.verdicts||{}).BUY||0)} buy</span></div>
 <div><span class="mute">Agents</span><b class="${ok===hb.length?"":"warn"}">${ok}/${hb.length}</b><span class="mute">healthy</span></div></div>
 <div class="sum two"><div><span class="mute">Mode</span><b class="${s.mode==="LIVE"?"bad":""}">${esc(s.mode)}</b><span class="mute">${s.mode==="LIVE"?"alerts only":"simulated fills"}</span></div><div><span class="mute">Kill switch</span><b class="${s.kill_switch?"bad":"ok"}">${s.kill_switch?"ON":"off"}</b><span class="mute">${s.kill_switch?"no new entries":"entries allowed"}</span></div></div>
 <h3>Holding</h3>${op.map(posCard).join("")||'<div class="empty">No open positions</div>'}
 <h3>Agents</h3><div class="list">${hb.map(h=>{const a=ageS(h.last_beat),c=a==null?"bad":a<60?"":a<180?"warn":"bad";
  return`<div class="it"><div class="m"><b><span class="dot ${c}"></span>${esc(h.agent)}</b><div class="mute">${esc(h.status)} · ${esc(h.detail)}</div></div><div class="r mute">${fmtAge(a)}</div></div>`}).join("")}</div>`},
signals(){if(sig!=null)return detail(sig);const l=(D.signals&&D.signals.data||[]).filter(FILTERS[F]);
 const fb=[["all","All"],["buy","BUY only"],["all8","All 8 passed"],["hour","Last hour"]].map(([k,t])=>`<button class="f${k===F?" on":""}" data-f="${k}">${t}</button>`).join("");
 return`<div id="fb">${fb}</div><div class="list">${l.map(s=>`<button class="it" data-s="${esc(s.id)}"><div class="av">${esc((s.symbol||s.mint).slice(0,2).toUpperCase())}</div>
 <div class="m"><b>${esc(sym(s))}</b> <span class="mute">${usd(s.mcap_usd)}</span><div class="seg">${layers(s).map(x=>`<i class="${esc(x.r)}"></i>`).join("")}</div></div>
 <div class="r">${s.verdict?`<span class="tag ${esc(s.verdict.verdict)}">${esc(s.verdict.verdict)}</span>`:`<span class="mute">${esc(s.status)}</span>`}<div class="mute" style="font-size:11.5px">${hm(s.created_at)}</div></div></button>`).join("")||'<div class="it mute">No signals match</div>'}</div>`},
trades(){const P=D.positions&&D.positions.data||[],T=D.trades&&D.trades.data||[],L=D.live&&D.live.data||[];
 const sec=(m,title,sub)=>{const p=P.filter(x=>x.mode===m),t=T.filter(x=>x.mode===m),o=p.filter(x=>x.status==="open"),cl=p.filter(x=>x.status==="closed");
  const pnl=p.reduce((a,x)=>a+(x.realized_pnl_sol||0),0),fee=t.reduce((a,x)=>a+(x.fee_sol||0)+(x.priority_fee_sol||0),0),w=cl.filter(x=>x.realized_pnl_sol>0).length;
  const tr=t.map(x=>`<tr><td><b class="${x.side==="BUY"?"ok":"bad"}">${esc(x.side)}</b></td><td>${num(x.amount_sol,3)}</td><td>${num(x.fee_sol,4)}</td><td>${esc(x.reason||"")}</td><td class=mute>${hm(x.created_at)}</td></tr>`).join("");
  return`<h3>${title}</h3><div class="mute">${sub}</div><div class="sum"><div><span class="mute">Realized</span><b class="${pnl<0?"bad":pnl>0?"ok":""}">${sol(pnl)}</b><span class="mute">SOL</span></div><div><span class="mute">Fees</span><b>${num(fee,4)}</b><span class="mute">SOL</span></div><div><span class="mute">Win rate</span><b>${cl.length?Math.round(w/cl.length*100)+"%":"–"}</b><span class="mute">${w}/${cl.length} closed</span></div></div>
  ${m==="PAPER"?'<div class="card"><div class="mute">Cumulative P&L (SOL, paper)</div><canvas id="pnl" class="chart"></canvas></div>':""}
  ${o.map(posCard).join("")||'<div class="empty">No open '+m+' positions</div>'}
  ${cl.length?`<div class="list" style="margin-top:10px">${cl.map(x=>`<div class="it"><div class="m"><b>${esc(short(x.mint))}</b><div class="mute">closed ${hm(x.closed_at)} · cost ${num(x.cost_sol,3)} · fees ${num(x.fees_sol,4)}</div></div><div class="r"><b class="${x.realized_pnl_sol<0?"bad":"ok"}">${sol(x.realized_pnl_sol)}</b>${link(x.coin_url,"mute")}</div></div>`).join("")}</div>`:""}
  ${tr?`<div class="card" style="margin-top:10px"><table><tr class=mute><td>Side</td><td>SOL</td><td>Fee</td><td>Reason</td><td>Madrid</td></tr>${tr}</table></div>`:""}`};
 const la=L.slice(0,10).map(x=>`<div class="card"><div class="row" style="border:0;padding:0"><b>${esc(short(x.mint))} · LIVE alert</b><span class="mute">${hm(x.created_at)}</span></div>
  <div class="mute">size ${num(x.size_sol,3)} SOL · SL $${esc(x.stop_loss_usd!=null?x.stop_loss_usd.toExponential(3):"n/a")} · TP $${esc(x.take_profit_usd!=null?x.take_profit_usd.toExponential(3):"n/a")} · fees ${num(x.est_fees_sol)} · breakeven +${num(x.breakeven_pct,2)}%</div>${link(x.coin_url)}</div>`).join("");
 return sec("PAPER","Paper","Simulated fills")+sec("LIVE","Live (manual)","Logged by you via /bought and /sold — the desk never trades")+`<h3>LIVE signal alerts</h3>${la||'<div class="empty">None</div>'}`},
risk(){const l=D.risk&&D.risk.data||[];if(!l.length)return'<div class="empty">No risk events</div>';
 return`<div class="list">${l.map(x=>`<div class="it"><div class="m"><b class="${x.severity==="warn"?"warn":x.severity==="crit"?"bad":""}">${esc(x.kind)}</b><div class="mute">${esc(x.action||"")} ${x.mint?esc(short(x.mint)):""} ${esc(JSON.stringify(x.detail||{}))}</div></div><div class="r mute">${hm(x.created_at)}</div></div>`).join("")}</div>`},
report(){const r=D.report&&D.report.data;if(!r)return"<p class=mute>No report</p>";const v=r.verdicts||{},f=r.fee_model||{};
 const c=(k,val,cl="",s="")=>`<div><span class="mute">${k}</span><b class="${cl}">${esc(val)}</b>${s?`<span class="mute">${s}</span>`:""}</div>`;
 const m=(t,x)=>x?`<h3>${t}</h3><div class="sum">${c("Trades",x.trades)}${c("Open",x.open_positions)}${c("Closed",x.closed_today)}</div><div class="sum two">${c("P&L SOL",sol(x.realized_pnl_sol),x.realized_pnl_sol<0?"bad":x.realized_pnl_sol>0?"ok":"")}${c("Fees SOL",num(x.fees_sol))}</div>`:"";
 return`<div class="mute">Day (UTC) ${esc(r.date_utc)}</div><div class="sum">${c("Signals",r.signals)}${c("Audited",r.audited)}${c("Risk events",r.risk_events)}</div>
 <div class="sum">${c("BUY",v.BUY||0,"ok")}${c("WATCH",v.WATCH||0,"warn")}${c("PASS",v.PASS||0)}</div><div class="sum two">${c("LIVE alerts",r.live_signal_alerts||0)}${c("Mode",f.mode||"–")}</div>
 ${m("Paper (simulated)",r.paper)}${m("Live (manual)",r.live)}
 <h3>Fee model</h3><div class="rows"><div class="row"><span class="mute">Breakeven (${num(f.size_sol,2)} SOL round trip)</span><span><b>+${num(f.breakeven_pct,2)}%</b></span></div><div class="row"><span class="mute">Round-trip fees</span><span>${num(f.round_trip_fees_sol)} SOL</span></div>
 <div class="row"><span class="mute">Route · referral</span><span>${esc(f.route||"")} · ${f.referral?"yes":"no"}</span></div><div class="row"><span class="mute">SOL / USD</span><span>$${esc(f.sol_usd)}</span></div><div class="row"><span class="mute">Mode</span><span>${esc(f.mode||"")}</span></div></div>`},
settings(){const s=D.settings&&D.settings.data;if(!s)return"<p class=mute>No settings</p>";
 return`<div class="mute" style="margin-bottom:8px">Read-only · change via Telegram /set, /reset · 🔒 = not editable</div><div class="rows">${Object.keys(s).map(k=>{const o=s[k]&&typeof s[k]==="object"?s[k]:{value:s[k]};
  const ch=o.default!=null&&String(o.value)!==String(o.default);
  return`<div class="row"><span>${esc(k)}${o.editable===false?" 🔒":""}<div class="mute">${esc(o.desc||"")}</div></span><span>${ch?"<b class=warn>":""}${esc(o.value)}${ch?"</b><div class=mute>default "+esc(o.default)+"</div>":""}</span></div>`}).join("")}</div>`}};
function detail(id){const s=(D.signals&&D.signals.data||[]).find(x=>String(x.id)===String(id));if(!s){sig=null;return V.signals()}
 const vd=s.verdict||{},p=probs(s);
 return`<button class="back" data-back="1">‹ Signals</button><h1 style="margin:6px 0 0;font-weight:600">${esc(sym(s))}</h1><div class="mute">${esc(s.name||"")} · ${esc(short(s.mint))} · seen ${hm(s.created_at)} Madrid · ${esc(s.status)}</div>
 <h3>Jev</h3><div class="note">${vd.verdict?`<span class="tag ${esc(vd.verdict)}">${esc(vd.verdict)}</span> &nbsp;${Math.round((vd.confidence||0)*100)}% confident${p?` · P(BUY) ${Math.round(p.buy*100)}%`:""}${vd.size_sol?` · size ${num(vd.size_sol,3)} SOL`:""}<br><span class="mute">${esc((vd.reasoning||"").split(". Audit:")[0].replace(/^Jev: \w+ /,""))}</span>`:'<span class="mute">No verdict yet</span>'}</div>
 <h3>Market</h3><div class="rows"><div class="row"><span class="mute">Market cap</span><span>${usd(s.mcap_usd)}</span></div><div class="row"><span class="mute">Liquidity</span><span>${usd(s.liquidity_usd)}</span></div><div class="row"><span class="mute">Audit score</span><span>${esc(s.audit_score??"–")}</span></div><div class="row"><span class="mute">Bundles</span><span>${s.bundles?esc(s.bundles.label):"–"}</span></div></div>
 <h3>Safety checks</h3><div class="rows">${layers(s).map(x=>`<div class="row"><span>L${x.n} ${esc((x.name||"").replace(/_/g," "))}</span><span class="${x.r==="pass"?"ok":x.r==="fail"?"bad":"warn"}">${x.r==="pass"?"✓ pass":x.r==="fail"?"✕ fail":"• "+esc(x.r)}</span></div>`).join("")||'<div class="row mute">Audit pending</div>'}</div>
 <div class="pad"></div>${/^https:\/\//.test(s.coin_url||"")?`<div class="sticky">${link(s.coin_url)}</div>`:""}`}
function rings(){document.querySelectorAll("canvas.ring").forEach(c=>{const p={opened_at:c.dataset.o},f=holdFrac(p),x=c.getContext("2d"),r=devicePixelRatio||2;
 c.width=c.height=64*r;x.setTransform(r,0,0,r,0,0);x.lineWidth=5;x.lineCap="round";x.strokeStyle=css("--line");x.beginPath();x.arc(32,32,27,0,7);x.stroke();
 x.strokeStyle=f>.8?css("--bad"):css("--acc");x.beginPath();x.arc(32,32,27,-Math.PI/2,-Math.PI/2+(1-f)*2*Math.PI);x.stroke()})}
function chart(){const cv=$("#pnl");if(!cv)return;const pos=(D.positions&&D.positions.data||[]).filter(p=>p.mode==="PAPER"&&p.closed_at).sort((a,b)=>utc(a.closed_at)-utc(b.closed_at));
 const pts=[0];pos.forEach(p=>pts.push(pts[pts.length-1]+(p.realized_pnl_sol||0)));
 const r=devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;cv.width=w*r;cv.height=h*r;const g=cv.getContext("2d");g.scale(r,r);
 const mn=Math.min(...pts,0),mx=Math.max(...pts,0),sp=(mx-mn)||1,X=i=>10+i*(w-20)/Math.max(pts.length-1,1),Y=v=>h-14-(v-mn)/sp*(h-28);
 g.strokeStyle=css("--line");g.setLineDash([3,4]);g.beginPath();g.moveTo(0,Y(0));g.lineTo(w,Y(0));g.stroke();g.setLineDash([]);
 const col=pts[pts.length-1]<0?css("--bad"):css("--good");const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,col+"44");gr.addColorStop(1,col+"00");
 g.beginPath();pts.forEach((v,i)=>i?g.lineTo(X(i),Y(v)):g.moveTo(X(i),Y(v)));g.lineTo(X(pts.length-1),Y(0));g.lineTo(X(0),Y(0));g.fillStyle=gr;g.fill();
 g.strokeStyle=col;g.lineWidth=2.5;g.beginPath();pts.forEach((v,i)=>i?g.lineTo(X(i),Y(v)):g.moveTo(X(i),Y(v)));g.stroke();
 g.fillStyle=css("--mute");g.font="11px system-ui";g.fillText(num(mx,3),4,12);g.fillText(num(mn,3),4,h-2)}
function render(top=true){header();$("#view").innerHTML=V[tab]();chart();rings();document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on",b.dataset.t===tab));if(top)scrollTo(0,0)}
document.addEventListener("click",e=>{let b=e.target.closest("nav button");if(b){tab=b.dataset.t;sig=null;return render()}
 b=e.target.closest("[data-f]");if(b){F=b.dataset.f;return render(false)}
 b=e.target.closest("[data-s]");if(b){sig=b.dataset.s;return render()}
 if(e.target.closest("[data-back]")){sig=null;render()}});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&timer)load()});
const mql=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)");if(mql&&mql.addEventListener)mql.addEventListener("change",()=>{chart();rings()});
setInterval(()=>{document.querySelectorAll(".cd").forEach(e=>e.textContent=countdown({opened_at:e.dataset.o}));rings();if(D.status)header()},1000);
gate().then(ok=>{if(!ok)return;$("#locked").hidden=true;$("#app").hidden=false;load();timer=setInterval(load,REFRESH_MS)});
window.__fomo={D,FILES};
})();
