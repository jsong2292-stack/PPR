#!/usr/bin/env node
/**
 * 端到端验证「异常诊断与验证 → 生成 8D 报告 → 在 8D 报告页实时生成」的真实交互（CDP 驱动浏览器）。
 *
 * 为什么单独写：8D 报告此前由接口内的固定模板文字生成，页面上只是跳转，没有任何生成过程。
 * 改造后诊断页只负责「保存工程师填写 → 跳转」，生成过程与 D1–D8 草稿都在 8D 报告页展示，
 * 因此必须证明：
 *   1) 诊断页的「生成 8D 报告」真的跳转到 8D 报告工作台（带 generate=1）；
 *   2) 报告页自动发起生成，过程面板逐条出现工具与证据轨迹，且期间展示 D1–D8 占位骨架；
 *   3) 生成结束后同页切换为可编辑的 D1–D8 正文（8 个输入框都有内容）；
 *   4) URL 上的 generate=1 被清理，刷新不会重复调用模型；
 *   5) 全程没有控制台报错。
 *
 * 前提：本机有可用的调试浏览器，例如
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 \
 *     --user-data-dir=/tmp/ppr-chrome --no-sandbox about:blank
 *
 * 用法：node scripts/cdp-8d-flow.mjs
 * 环境变量：CDP_ENDPOINT / PPR_BASE / PPR_USER / PPR_PASSWORD / PPR_ALERT_ID / PPR_SHOT
 */
import fs from 'node:fs/promises';

const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9333';
const BASE = process.env.PPR_BASE || 'http://127.0.0.1:9010';
const username = process.env.PPR_USER || 'admin';
const password = process.env.PPR_PASSWORD || 'Admin@123';
const alertId = process.env.PPR_ALERT_ID || '746';
const shot = process.env.PPR_SHOT || 'artifacts/8d-generate.png';

const fail = [];
const ok = [];
const check = (condition, message) => { (condition ? ok : fail).push(message); console.log(`${condition ? '✅' : '❌'} ${message}`); };

const target = await fetch(`${endpoint}/json/new?${encodeURIComponent(`${BASE}/login`)}`, { method: 'PUT' }).then((res) => res.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 1; const pending = new Map(); const consoleErrors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ').slice(0, 200));
  }
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ev = async (expression) => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
const text = () => ev('document.body.innerText');
const url = () => ev('location.pathname + location.search');

const click = async (expression) => {
  // 诊断页很长，生成入口在结论卡片之后。页面启用了平滑滚动，scrollIntoView 之后立刻取坐标
  // 拿到的还是滚动前的位置（视口外），鼠标事件不会命中，所以先临时关掉平滑滚动并确认元素真的进入视口。
  const scrollInstant = `(()=>{document.documentElement.style.scrollBehavior='auto';const el=${expression};if(el)el.scrollIntoView({block:'center',behavior:'instant'});return Boolean(el);})()`;
  await ev(scrollInstant);
  await sleep(250);
  for (let i = 0; i < 20; i += 1) {
    const rect = await ev(`(()=>{const el=${expression};if(!el)return null;const r=el.getBoundingClientRect();return (r.top>=0&&r.bottom<=innerHeight)?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()`);
    if (rect) {
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', buttons: 1, clickCount: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', buttons: 0, clickCount: 1 });
      return true;
    }
    await ev(scrollInstant);
    await sleep(200);
  }
  return false;
};

/** 诊断页上的生成入口按钮。 */
const diagnosisButton = `[...document.querySelectorAll('button')].find(b=>/生成 8D 报告|重新生成 8D 报告/.test(b.innerText))`;
/** 过程面板的事件行数：AnalysisProcessPanel 的滚动容器是 .max-h-80。 */
const eventCountExpr = `document.querySelectorAll('.max-h-80 > div').length`;
/** 报告正文的 8 个 D 段输入框。 */
const filledTextareas = `[...document.querySelectorAll('textarea')].filter(t=>t.value.trim().length>10).length`;

await call('Page.enable'); await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false });
await sleep(400);
await ev(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(username)},password:${JSON.stringify(password)},remember:true})}).then(r=>r.json())`);

// ── 1) 诊断页：生成入口 ────────────────────────────────────────────────────
await call('Page.navigate', { url: `${BASE}/quality/diagnosis?alertId=${alertId}` });
await sleep(1000);
for (let i = 0; i < 40; i += 1) {
  if ((await text()).includes('生成诊断分析')) break;
  await sleep(500);
}
const diagnosisText = await text();
check(diagnosisText.includes('异常诊断与验证'), '诊断页已打开');
check(/下一步：生成 8D 报告/.test(diagnosisText), '诊断页出现「生成 8D 报告」入口卡片');
check(/生成过程(与草稿内容)?都在报告页|生成过程在 8D 报告页实时展示/.test(diagnosisText), '诊断页说明生成过程在报告页展示');

// ── 2) 点击 → 跳转报告页并自动开始生成 ────────────────────────────────────
const clicked = await click(diagnosisButton);
check(clicked, '已点击「生成 8D 报告」');
let navigated = false;
for (let i = 0; i < 60; i += 1) {
  await sleep(500);
  if (String(await url()).includes('/quality/report')) { navigated = true; break; }
}
check(navigated, `已跳转到 8D 报告页（${await url()}）`);

let started = false;
let maxEvents = 0;
let sawSkeleton = false;
/** 采样：{at, total, generating}，用于证明字段内容是生成过程中逐步长出来的。 */
const samples = [];
let sawFieldWriting = false;
const t0 = Date.now();
for (let i = 0; i < 600; i += 1) {
  await sleep(400);
  const snapshot = await ev(`(()=>{const tas=[...document.querySelectorAll('textarea')];const total=tas.reduce((sum,t)=>sum+t.value.length,0);const txt=document.body.innerText;return {total,writing:/生成中/.test(txt),fieldWriting:[...document.querySelectorAll('span')].some(s=>/^生成中$/.test(s.innerText.trim()))};})()`);
  const pageText = await text();
  maxEvents = Math.max(maxEvents, Number(await ev(eventCountExpr)) || 0);
  if (/正在生成 D1–D8/.test(pageText)) sawSkeleton = true;
  if (snapshot.writing) started = true;
  if (snapshot.fieldWriting) sawFieldWriting = true;
  samples.push({ at: Date.now() - t0, total: snapshot.total, writing: snapshot.writing });
  if (started && !snapshot.writing) break;
}
check(started, '报告页自动发起了生成（页面出现「生成中」状态）');
check(maxEvents >= 6, `报告页实时打印生成过程（最多同时可见 ${maxEvents} 条轨迹，含工具调用与校验）`);

const finalText = await text();
check(finalText.includes('8D 报告工作台'), '仍停留在 8D 报告工作台');
check(/LangChain Agent 生成|规则模板生成/.test(finalText), '生成结束后标注了生成引擎');
const filled = Number(await ev(filledTextareas)) || 0;
check(filled === 8, `生成结束后 D1–D8 均为可编辑正文并有内容（已填充 ${filled}/8）`);
check(!/正在生成 D1–D8/.test(finalText), `生成结束后占位骨架已替换为正文${sawSkeleton ? '（过程观察到骨架）' : '（本次直接进入正文）'}`);

// ── 3) 真流式判据：字段内容必须是在生成过程中逐步长出来的 ─────────────────
// 取样期间内容发生变化、且当时仍处于「生成中」的次数。
const generatingSamples = samples.filter((sample) => sample.writing);
const changes = generatingSamples.filter((sample, index) => index > 0 && sample.total !== generatingSamples[index - 1].total);
const finalTotal = samples.length ? samples[samples.length - 1].total : 0;
const initialTotal = generatingSamples.length ? generatingSamples[0].total : 0;
// 中间态：既不是起始内容也不是最终内容的采样点。一次性替换只会有 0 个中间态。
const intermediate = generatingSamples.filter((sample) => sample.total !== initialTotal && sample.total !== finalTotal);
const firstChangeAt = changes.length ? changes[0].at : 0;
const lastGeneratingAt = generatingSamples.length ? generatingSamples[generatingSamples.length - 1].at : 0;

check(sawFieldWriting, '生成期间有字段显示「生成中」标记（正在写某个字段）');
check(changes.length >= 5, `生成期间输入框内容被多次改写（观测到 ${changes.length} 次变化，${intermediate.length} 个中间态）`);
check(intermediate.length >= 3, `存在中间态文本（${intermediate.length} 个采样点既非起始也非最终内容，排除"生成完一次性替换"）`);
check(lastGeneratingAt - firstChangeAt > 12000, `内容在生成结束前 ${Math.round((lastGeneratingAt - firstChangeAt) / 1000)} 秒就开始出现（非事后打字机）`);

check(!String(await url()).includes('generate=1'), `URL 已清理 generate=1（当前 ${await url()}）`);
check(!/生成过程执行失败|生成 8D 报告失败/.test(finalText), '页面没有出现生成失败提示');
check(consoleErrors.length === 0, `无控制台报错${consoleErrors.length ? `：${consoleErrors.slice(0, 2).join(' | ')}` : ''}`);

await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then(async (result) => {
  await fs.mkdir(new URL('.', `file://${process.cwd()}/${shot}`).pathname, { recursive: true }).catch(() => {});
  await fs.writeFile(shot, Buffer.from(result.data, 'base64'));
  console.log(`🖼  截图已保存：${shot}`);
});

console.log(`\n通过 ${ok.length} 项，失败 ${fail.length} 项`);
socket.close();
process.exit(fail.length ? 1 : 0);
