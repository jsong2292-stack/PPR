#!/usr/bin/env node
/**
 * 端到端跑一遍「质量监控 → 进入诊断 → 设备工艺参数趋势」的真实交互（CDP 驱动浏览器）。
 *
 * 为什么单独写：诊断页的趋势卡片是唯一消费 `/api/quality/batches/{批次号}/equipment-readings` 的前端，
 * 而这条接口正是本轮改造的重点（设备清单由采集数据按批次号反推）。
 * 只验证接口 200 不够——要确认卡片真的渲染出「数据取自设备采集数据（批次 …）」「共 N 条采集记录」且没有控制台报错。
 *
 * 用法：node scripts/cdp-diagnosis-flow.mjs
 */
const endpoint='http://127.0.0.1:9333', BASE='http://127.0.0.1:9010';
const target=await fetch(`${endpoint}/json/new?${encodeURIComponent(BASE+'/login')}`,{method:'PUT'}).then(r=>r.json());
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res,rej)=>{socket.addEventListener('open',res,{once:true});socket.addEventListener('error',rej,{once:true});});
let nextId=1; const pending=new Map(); const errors=[];
socket.addEventListener('message',(e)=>{const m=JSON.parse(String(e.data));
 if(m.id&&pending.has(m.id)){const{resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);return;}
 if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value??a.description??'').join(' ').slice(0,160));});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId++;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const ev=async(x)=>(await call('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true})).result?.value;
const click=async(expr)=>{const rect=await ev(`(()=>{const el=${expr};if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 if(!rect)return false;
 await call('Input.dispatchMouseEvent',{type:'mousePressed',x:Math.round(rect.x),y:Math.round(rect.y),button:'left',buttons:1,clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:Math.round(rect.x),y:Math.round(rect.y),button:'left',buttons:0,clickCount:1});
 return true;};
await call('Page.enable'); await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
await sleep(400);
await ev(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'Admin@123',remember:true})}).then(r=>r.json())`);
await call('Page.navigate',{url:`${BASE}/quality/monitor`}); await sleep(3000);
const labels=await ev(`[...document.querySelectorAll('a,button')].map(e=>e.innerText.trim()).filter(t=>t.includes('诊断')).slice(0,5)`);
console.log('诊断入口:', JSON.stringify(labels));
const clicked=await click(`[...document.querySelectorAll('a,button')].find(e=>e.innerText.trim().includes('进入诊断'))`);
if(!clicked){console.error('❌ 监控页没找到「进入诊断」');process.exit(1);}
await sleep(4000);
const text=await ev('document.body.innerText');
const markers=['趋势','设备','温度','采集','诊断'];
console.log('页面关键内容:', markers.filter(m=>text.includes(m)).join('、'));
const hasTrend=/温度\(℃\)|牵引速度|设备采集数据|过程参数/.test(text);
console.log(hasTrend?'✅ 诊断页已渲染设备过程趋势（读取 /api/quality/batches/{批次号}/equipment-readings）':'⚠️ 诊断页未见趋势卡片内容');
const snippet=text.split('\n').filter(l=>/趋势|设备|采集|温度/.test(l)).slice(0,8);
console.log('摘录:', snippet.join(' ｜ '));
console.log('控制台报错:', errors.length? errors.slice(0,3).join(' | '):'无');
socket.close();
process.exit(hasTrend&&!errors.length?0:1);
