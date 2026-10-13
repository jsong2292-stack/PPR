#!/usr/bin/env node
import fs from 'node:fs/promises';

const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9229';
const targetUrl = process.argv[2] || 'http://127.0.0.1:9010/quality/monitor';
const output = process.argv[3] || 'artifacts/quality-monitor.png';
const username = process.env.PPR_USER || 'admin';
const password = process.env.PPR_PASSWORD || 'Admin@123';

const target = await fetch(`${endpoint}/json/new?${encodeURIComponent('http://127.0.0.1:9010/login')}`, { method: 'PUT' }).then((res) => res.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 1; const pending = new Map();
socket.addEventListener('message', (event) => { const message = JSON.parse(String(event.data)); if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); } });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await call('Page.enable'); await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await sleep(600);
const loginResult = await call('Runtime.evaluate', { expression: `fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(username)},password:${JSON.stringify(password)},remember:true})}).then(r=>r.json())`, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(loginResult.result?.value));
await call('Page.navigate', { url: targetUrl }); await sleep(2500);
const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.mkdir(new URL('.', `file://${process.cwd()}/${output}`).pathname, { recursive: true }).catch(() => {});
await fs.writeFile(output, Buffer.from(shot.data, 'base64'));
console.log(output);
socket.close();
