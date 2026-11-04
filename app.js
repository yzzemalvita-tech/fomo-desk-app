"use strict";
(function(){
const C=window.FOMO_CONFIG,FILES=["status","signals","positions","trades","risk","report","settings"];
const KEY="fomo_desk_t",STALE_S=180,REFRESH_MS=30000;
let D={},tab="status",timer=null;
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=(v,d=4)=>v==null||isNaN(v)?"–":Number(v).toFixed(d);
async function sha(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function takeToken(){const m=location.hash.match(/(?:^#|&)t=([^&]+)/);
 if(m){localStorage.setItem(KEY,decodeURIComponent(m[1]));history.replaceState(null,"",location.pathname+location.search)}
 return localStorage.getItem(KEY)}
async function gate(){const t=takeToken();if(!t||await sha(t)!==C.tokenHash){localStorage.removeItem(KEY);return false}return true}
async function load(){
 const cb=Date.now(),base="d/"+C.dataPath+"/";
 const r=await Promise.all(FILES.map(f=>fetch(base+f+".json?cb="+cb,{cache:"no-store"}).then(x=>x.ok?x.json():null).catch(()=>null)));
 FILES.forEach((f,i)=>{if(r[i])D[f]=r[i]});render()}
function ageS(iso){if(!iso)return null;const t=Date.parse(iso.includes("T")?iso:iso.replace(" ","T")+"Z");return(Date.now()-t)/1000}
function fmtAge(s){if(s==null)return"–";if(s<90)return Math.round(s)+"s";if(s<5400)return Math.round(s/60)+"m";return(s/3600).toFixed(1)+"h"}
function header(){
 const st=D.status&&D.status.data||{};const m=$("#mode");m.textContent=st.mode||"?";m.className="pill "+(st.mode||"");
 const a=D.status?ageS(D.status.generated_at):null;
 $("#age").textContent="data "+fmtAge(a);const s=$("#stale");
 if(a==null||a>STALE_S){s.hidden=false;s.textContent="⚠ Stale data: last publish "+fmtAge(a)+" ago (>3 min)."}else s.hidden=true}
const V={
status(){const s=D.status&&D.status.data;if(!s)return"<p class=mut>No data</p>";
 const hb=(s.heartbeats||[]).map(h=>{const a=ageS(h.last_beat);const c=a==null?"bad":a<60?"ok":a<180?"warn":"bad";
  return`<div class="card"><div class=row><b>${esc(h.agent)}</b><span class="${c}">● ${fmtAge(a)}</span></div><div class=mut>${esc(h.status)} · ${esc(h.detail)}</div></div>`}).join("");
 return`<div class=grid><div class=card><div class=mut>Mode</div><div class="big ${s.mode==="LIVE"?"bad":""}">${esc(s.mode)}</div></div>
 <div class=card><div class=mut>Kill switch</div><div class="big ${s.kill_switch?"bad":"ok"}">${s.kill_switch?"ON":"off"}</div></div></div><h2>Agents</h2>${hb}`},
signals(){const l=D.signals&&D.signals.data||[];if(!l.length)return"<p class=mut>No signals</p>";
 return l.map(x=>{const ly=x.layers||{};const chips=Object.keys(ly).sort().map(k=>`<span class="chip ${esc(ly[k].result)}">L${esc(k)} ${esc(ly[k].name)}</span>`).join("");
  const v=x.verdict;let vh="<div class=mut>No verdict yet</div>";
  if(v){const p=(v.reasoning||"").match(/P BUY ([\d.]+) \/ WATCH ([\d.]+) \/ PASS ([\d.]+)/);const c=v.verdict==="BUY"?"ok":v.verdict==="WATCH"?"warn":"mut";
   vh=`<div class=row><b class="${c}">${esc(v.analyst||"")}: ${esc(v.verdict)}</b><span class=mut>conf ${num(v.confidence,2)}</span></div>`+
   (p?`<div class=mut>P BUY ${p[1]} · WATCH ${p[2]} · PASS ${p[3]}</div>`:"")+(v.size_sol?`<div class=mut>size ${num(v.size_sol,3)} SOL</div>`:"")}
  const b=x.bundles?`<div class=mut>L7 bundles: ${esc(x.bundles.label)}</div>`:"";
  const link=/^https:\/\//.test(x.coin_url||"")?`<a class=btn href="${esc(x.coin_url)}" target="_blank" rel="noopener">Open in FOMO</a>`:"";
  return`<div class=card><div class=row><b>${esc(x.symbol||x.mint.slice(0,6)+"…")}</b><span class=mut>${esc(x.status)} · ${fmtAge(ageS(x.created_at))}</span></div>
  <div class=mut>${esc(x.name||"")} liq $${x.liquidity_usd?Math.round(x.liquidity_usd):"–"}</div><div class=chips>${chips}</div>${b}${vh}${link}</div>`}).join("")},
trades(){const p=D.positions&&D.positions.data||[],t=D.trades&&D.trades.data||[];
 const pnl=p.reduce((a,x)=>a+(x.realized_pnl_sol||0),0),fee=t.reduce((a,x)=>a+(x.fee_sol||0)+(x.priority_fee_sol||0),0);
 const pos=p.map(x=>`<div class=card><div class=row><b>${esc(x.mint.slice(0,6))}… ${esc(x.mode)}</b><span class="${x.realized_pnl_sol<0?"bad":"ok"}">${num(x.realized_pnl_sol)} SOL</span></div>
  <div class=mut>${esc(x.status)} · cost ${num(x.cost_sol,3)} · fees ${num(x.fees_sol)} · SL ${x.stop_loss_pct}% TP ${x.take_profit_pct}%</div>
  ${/^https:\/\//.test(x.coin_url||"")?`<a class=btn href="${esc(x.coin_url)}" target="_blank" rel="noopener">Open in FOMO</a>`:""}</div>`).join("");
 const tr=t.map(x=>`<tr><td>${esc(x.side)}</td><td>${num(x.amount_sol,3)}</td><td>${num(x.fee_sol,4)}</td><td>${esc(x.reason||"")}</td><td class=mut>${esc((x.created_at||"").slice(11,16))}</td></tr>`).join("");
 return`<div class=grid><div class=card><div class=mut>Realized PnL</div><div class="big ${pnl<0?"bad":"ok"}">${num(pnl)}</div></div><div class=card><div class=mut>Fees</div><div class=big>${num(fee)}</div></div></div>
 <div class=card><div class=mut>Cumulative PnL (SOL)</div><canvas id=pnl></canvas></div><h2>Positions</h2>${pos||"<p class=mut>None</p>"}
 <h2>Trades</h2><div class=card><table><tr class=mut><td>Side</td><td>SOL</td><td>Fee</td><td>Reason</td><td>UTC</td></tr>${tr}</table></div>`},
risk(){const l=D.risk&&D.risk.data||[];if(!l.length)return"<p class=mut>No risk events</p>";
 return l.map(x=>`<div class=card><div class=row><b class="${x.severity==="warn"?"warn":x.severity==="crit"?"bad":""}">${esc(x.kind)}</b><span class=mut>${esc(x.created_at)} UTC</span></div>
 <div class=mut>${esc(x.action||"")} ${x.mint?esc(x.mint.slice(0,6))+"…":""} ${esc(JSON.stringify(x.detail||{}))}</div></div>`).join("")},
report(){const r=D.report&&D.report.data;if(!r)return"<p class=mut>No report</p>";const v=r.verdicts||{};
 const c=(k,val,cl="")=>`<div class=card><div class=mut>${k}</div><div class="big ${cl}">${esc(val)}</div></div>`;
 return`<div class=mut>Day (UTC) ${esc(r.date_utc)}</div><div class=grid>${c("Signals",r.signals)}${c("Audited",r.audited)}${c("BUY",v.BUY||0,"ok")}${c("WATCH",v.WATCH||0,"warn")}${c("PASS",v.PASS||0)}${c("Trades",r.trades)}${c("Open",r.open_positions)}${c("Risk events",r.risk_events)}${c("PnL SOL",num(r.realized_pnl_sol),r.realized_pnl_sol<0?"bad":"ok")}${c("Fees SOL",num(r.fees_sol))}</div>`},
settings(){const s=D.settings&&D.settings.data;if(!s)return"<p class=mut>No settings</p>";
 return`<div class=mut>Read-only · change via Telegram /set, /reset · 🔒 = not editable</div><div class=card><table>${Object.keys(s).map(k=>{const o=s[k]&&typeof s[k]==="object"?s[k]:{value:s[k]};
  const ch=o.default!=null&&String(o.value)!==String(o.default);
  return`<tr><td>${esc(k)}${o.editable===false?" 🔒":""}<div class=mut>${esc(o.desc||"")}</div></td><td style="text-align:right">${ch?"<b class=warn>":""}${esc(o.value)}${ch?"</b><div class=mut>default "+esc(o.default)+"</div>":""}</td></tr>`}).join("")}</table></div>`}};
function chart(){const cv=$("#pnl");if(!cv)return;const t=(D.trades&&D.trades.data||[]).slice().reverse(),pos=D.positions&&D.positions.data||[];
 const pts=[0];pos.slice().filter(p=>p.closed_at).sort((a,b)=>a.closed_at<b.closed_at?-1:1).forEach(p=>pts.push(pts[pts.length-1]+(p.realized_pnl_sol||0)));
 const r=devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;cv.width=w*r;cv.height=h*r;const g=cv.getContext("2d");g.scale(r,r);
 const mn=Math.min(...pts,0),mx=Math.max(...pts,0),sp=(mx-mn)||1,X=i=>8+i*(w-16)/Math.max(pts.length-1,1),Y=v=>h-12-(v-mn)/sp*(h-24);
 g.strokeStyle="#333b4d";g.beginPath();g.moveTo(0,Y(0));g.lineTo(w,Y(0));g.stroke();
 g.strokeStyle=pts[pts.length-1]<0?"#ef4444":"#22c55e";g.lineWidth=2;g.beginPath();pts.forEach((v,i)=>i?g.lineTo(X(i),Y(v)):g.moveTo(X(i),Y(v)));g.stroke();
 g.fillStyle="#8a93a6";g.font="11px system-ui";g.fillText(num(mx,3),4,12);g.fillText(num(mn,3),4,h-2)}
function render(){header();$("#view").innerHTML=V[tab]();chart();document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on",b.dataset.t===tab))}
document.addEventListener("click",e=>{const b=e.target.closest("nav button");if(b){tab=b.dataset.t;render();scrollTo(0,0)}});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&timer)load()});
gate().then(ok=>{if(!ok)return;$("#locked").hidden=true;$("#app").hidden=false;load();timer=setInterval(load,REFRESH_MS)});
window.__fomo={D,FILES};
})();
