'use strict';

const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');

let mainWindow;
let currentUserId = null;
let store;
const batchControllers = new Map();

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch (_) {
      return {
        schemaVersion: 1,
        users: [],
        settings: {},
        rooms: [],
        messages: [],
        jobs: [],
        audit: []
      };
    }
  }

  save() {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  audit(action, details = {}) {
    this.data.audit.push({
      id: crypto.randomUUID(),
      userId: currentUserId,
      action,
      details,
      createdAt: new Date().toISOString()
    });
    this.data.audit = this.data.audit.slice(-5000);
    this.save();
  }
}

function getDataDir() {
  const dataDir = path.join(app.getPath('userData'), 'bossmaster-data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'exports'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  return dataDir;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function requireLogin() {
  if (!currentUserId) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  const user = store.data.users.find((item) => item.id === currentUserId && item.active !== false);
  if (!user) throw new Error('ไม่พบบัญชีผู้ใช้หรือบัญชีถูกระงับ');
  return user;
}

function encryptSecret(secret) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows encryption ยังไม่พร้อม กรุณาทดสอบบน Windows ที่เข้าสู่ระบบผู้ใช้แล้ว');
  }
  return safeStorage.encryptString(secret).toString('base64');
}

function decryptSecret(encoded) {
  if (!encoded) return '';
  if (!safeStorage.isEncryptionAvailable()) throw new Error('ไม่สามารถเปิดข้อมูลลับบนเครื่องนี้ได้');
  return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
}

function userSettings(userId) {
  if (!store.data.settings[userId]) {
    store.data.settings[userId] = {
      provider: 'openai',
      openaiModel: '',
      geminiModel: '',
      temperature: 0.4,
      maxOutputTokens: 4096,
      apiKeys: {}
    };
    store.save();
  }
  return store.data.settings[userId];
}

function publicSettings(settings) {
  return {
    provider: settings.provider,
    openaiModel: settings.openaiModel,
    geminiModel: settings.geminiModel,
    temperature: settings.temperature,
    maxOutputTokens: settings.maxOutputTokens,
    hasOpenAIKey: Boolean(settings.apiKeys?.openai),
    hasGeminiKey: Boolean(settings.apiKeys?.gemini)
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1060,
    minHeight: 720,
    backgroundColor: '#080b12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function mapOpenAIInput(messages, attachments = []) {
  const input = messages.map((message) => ({ role: message.role, content: message.content }));
  if (attachments.length) {
    const last = input[input.length - 1];
    const content = [{ type: 'input_text', text: String(last.content || '') }];
    for (const file of attachments) {
      if (file.kind === 'image' && file.dataUrl) {
        content.push({ type: 'input_image', image_url: file.dataUrl });
      } else if (file.text) {
        content.push({ type: 'input_text', text: `\n\n--- FILE: ${file.name} ---\n${file.text}` });
      }
    }
    last.content = content;
  }
  return input;
}

function mapGeminiContents(messages, attachments = []) {
  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(message.content || '') }]
  }));
  if (attachments.length && contents.length) {
    const parts = contents[contents.length - 1].parts;
    for (const file of attachments) {
      if (file.kind === 'image' && file.base64 && file.mimeType) {
        parts.push({ inlineData: { mimeType: file.mimeType, data: file.base64 } });
      } else if (file.text) {
        parts.push({ text: `\n\n--- FILE: ${file.name} ---\n${file.text}` });
      }
    }
  }
  return contents;
}

async function apiFetch(url, options, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let json;
    try { json = raw ? JSON.parse(raw) : {}; } catch (_) { json = { raw }; }
    if (!response.ok) {
      const message = json?.error?.message || json?.message || raw || `HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function listModels(provider) {
  const user = requireLogin();
  const settings = userSettings(user.id);
  const key = decryptSecret(settings.apiKeys?.[provider]);
  if (!key) throw new Error(`ยังไม่ได้บันทึก API Key ของ ${provider}`);

  if (provider === 'openai') {
    const json = await apiFetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` }
    });
    return (json.data || [])
      .map((m) => m.id)
      .filter((id) => /^(gpt|o\d|chatgpt)/i.test(id))
      .sort();
  }

  if (provider === 'gemini') {
    const json = await apiFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {});
    return (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .sort();
  }

  throw new Error('Provider ไม่รองรับ');
}

async function callProvider({ provider, model, messages, systemPrompt, attachments, temperature, maxOutputTokens }) {
  const user = requireLogin();
  const settings = userSettings(user.id);
  const key = decryptSecret(settings.apiKeys?.[provider]);
  if (!key) throw new Error(`ยังไม่ได้บันทึก API Key ของ ${provider}`);
  if (!model) throw new Error('กรุณาเลือกโมเดล');

  if (provider === 'openai') {
    const payload = {
      model,
      input: mapOpenAIInput(messages, attachments),
      store: false,
      temperature: Number.isFinite(temperature) ? temperature : 0.4,
      max_output_tokens: Number(maxOutputTokens || 4096)
    };
    if (systemPrompt) payload.instructions = systemPrompt;
    const json = await apiFetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const text = json.output_text || (json.output || [])
      .flatMap((item) => item.content || [])
      .filter((part) => part.type === 'output_text')
      .map((part) => part.text)
      .join('\n');
    return {
      text: text || '',
      usage: json.usage || {},
      responseId: json.id || null,
      finishReason: json.status || null
    };
  }

  if (provider === 'gemini') {
    const payload = {
      contents: mapGeminiContents(messages, attachments),
      generationConfig: {
        temperature: Number.isFinite(temperature) ? temperature : 0.4,
        maxOutputTokens: Number(maxOutputTokens || 4096)
      }
    };
    if (systemPrompt) payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    const json = await apiFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    const text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n');
    return {
      text,
      usage: json.usageMetadata || {},
      responseId: json.responseId || null,
      finishReason: json.candidates?.[0]?.finishReason || null
    };
  }

  throw new Error('Provider ไม่รองรับ');
}

function readAttachment(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > 25 * 1024 * 1024) throw new Error(`ไฟล์ ${path.basename(filePath)} ใหญ่เกิน 25 MB ในรุ่น Alpha`);
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  const imageTypes = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif'
  };
  if (imageTypes[ext]) {
    const buffer = fs.readFileSync(filePath);
    return {
      name,
      path: filePath,
      size: stat.size,
      kind: 'image',
      mimeType: imageTypes[ext],
      base64: buffer.toString('base64'),
      dataUrl: `data:${imageTypes[ext]};base64,${buffer.toString('base64')}`
    };
  }
  if (['.xlsx', '.xlsm', '.xls'].includes(ext)) {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const result = {};
    for (const sheetName of workbook.SheetNames.slice(0, 10)) {
      result[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }).slice(0, 2000);
    }
    return { name, path: filePath, size: stat.size, kind: 'text', text: JSON.stringify(result, null, 2) };
  }
  const allowedText = ['.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.php', '.py', '.ps1', '.bat', '.cmd', '.sql', '.yaml', '.yml', '.ini', '.log'];
  if (allowedText.includes(ext)) {
    return { name, path: filePath, size: stat.size, kind: 'text', text: fs.readFileSync(filePath, 'utf8').slice(0, 250000) };
  }
  return { name, path: filePath, size: stat.size, kind: 'binary', text: `[ไฟล์แนบ ${name} ยังไม่รองรับการอ่านข้อความในรุ่น Alpha]` };
}

function cleanJsonText(text) {
  return String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

async function runBatch(jobId) {
  const job = store.data.jobs.find((j) => j.id === jobId && j.userId === currentUserId);
  if (!job) throw new Error('ไม่พบงาน Batch');
  const controller = { paused: false, cancelled: false };
  batchControllers.set(jobId, controller);
  job.status = 'running';
  job.startedAt ||= new Date().toISOString();
  store.save();
  emitJob(job);

  let consecutiveErrors = 0;
  while (!controller.cancelled) {
    if (controller.paused) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    const pending = job.items.filter((item) => ['pending', 'retry'].includes(item.status));
    if (!pending.length) break;
    const group = pending.slice(0, Math.max(1, Math.min(3, Number(job.batchSize || 1))));
    group.forEach((item) => { item.status = 'running'; item.updatedAt = new Date().toISOString(); });
    store.save();
    emitJob(job);

    const sourceRows = group.map((item) => ({ item_id: item.id, row_number: item.rowNumber, source: item.source }));
    const strictInstruction = `${job.instruction}\n\nข้อบังคับระบบ:\n- ใช้เฉพาะข้อมูล source ของแต่ละรายการ\n- ห้ามอธิบายขั้นตอน ห้ามใส่ Markdown ห้ามใส่ข้อความก่อนหรือหลัง JSON\n- ห้ามนำข้อมูลข้ามรายการมาปนกัน\n- คืน JSON array เท่านั้น จำนวน ${group.length} รายการ\n- แต่ละ object ต้องมี item_id เดิมและ result\nรูปแบบ: [{"item_id":"...","result":{}}]`;

    try {
      const response = await callProvider({
        provider: job.provider,
        model: job.model,
        messages: [{ role: 'user', content: `${strictInstruction}\n\nSOURCE_ROWS:\n${JSON.stringify(sourceRows)}` }],
        systemPrompt: job.systemPrompt || 'คุณเป็นระบบประมวลผลข้อมูลแบบเข้มงวด ทำตาม schema เท่านั้น',
        attachments: [],
        temperature: job.temperature ?? 0.2,
        maxOutputTokens: job.maxOutputTokens || 8192
      });
      let parsed;
      try { parsed = JSON.parse(cleanJsonText(response.text)); } catch (_) { throw new Error('AI ไม่ได้คืน JSON ที่เปิดอ่านได้'); }
      if (!Array.isArray(parsed)) throw new Error('ผลลัพธ์ไม่ใช่ JSON array');
      const byId = new Map(parsed.map((entry) => [entry.item_id, entry]));
      for (const item of group) {
        const entry = byId.get(item.id);
        if (!entry || typeof entry.result === 'undefined') {
          item.status = 'retry';
          item.error = 'ไม่พบ item_id หรือ result ในคำตอบ';
          item.retryCount += 1;
          continue;
        }
        item.output = entry.result;
        item.rawOutput = response.text;
        item.status = 'success';
        item.error = '';
        item.updatedAt = new Date().toISOString();
      }
      consecutiveErrors = group.some((i) => i.status !== 'success') ? consecutiveErrors + 1 : 0;
    } catch (error) {
      consecutiveErrors += 1;
      for (const item of group) {
        item.retryCount += 1;
        item.error = error.message;
        item.status = item.retryCount <= Number(job.retry || 3) ? 'retry' : 'failed';
        item.updatedAt = new Date().toISOString();
      }
    }

    for (const item of group) {
      if (item.status === 'retry' && item.retryCount > Number(job.retry || 3)) item.status = 'failed';
    }
    job.updatedAt = new Date().toISOString();
    store.save();
    emitJob(job);

    if (consecutiveErrors >= Number(job.stopAfterErrors || 5)) {
      job.status = 'paused';
      controller.paused = true;
      job.lastError = `หยุดอัตโนมัติหลังผิดพลาดติดต่อกัน ${consecutiveErrors} ชุด`;
      store.save();
      emitJob(job);
    }
    await new Promise((resolve) => setTimeout(resolve, Number(job.delayMs || 2500)));
  }

  if (controller.cancelled) job.status = 'cancelled';
  else if (!controller.paused) job.status = job.items.some((i) => ['pending', 'retry', 'running'].includes(i.status)) ? 'paused' : 'completed';
  job.updatedAt = new Date().toISOString();
  store.save();
  emitJob(job);
  batchControllers.delete(jobId);
}

function emitJob(job) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('batch:updated', sanitizeJob(job));
  }
}

function sanitizeJob(job) {
  return JSON.parse(JSON.stringify(job));
}

function registerIpc() {
  ipcMain.handle('app:bootstrap', () => ({
    needsOwner: store.data.users.length === 0,
    appVersion: app.getVersion()
  }));

  ipcMain.handle('auth:create-owner', (_, payload) => {
    if (store.data.users.length) throw new Error('มีบัญชี Owner แล้ว');
    if (!payload.username || payload.username.length < 3) throw new Error('Username ต้องมีอย่างน้อย 3 ตัวอักษร');
    if (!payload.password || payload.password.length < 8) throw new Error('Password ต้องมีอย่างน้อย 8 ตัวอักษร');
    const { salt, hash } = hashPassword(payload.password);
    const user = {
      id: crypto.randomUUID(),
      username: payload.username.trim().toLowerCase(),
      displayName: payload.displayName?.trim() || payload.username.trim(),
      role: 'owner',
      salt,
      passwordHash: hash,
      active: true,
      createdAt: new Date().toISOString()
    };
    store.data.users.push(user);
    store.save();
    return { ok: true };
  });

  ipcMain.handle('auth:login', (_, { username, password }) => {
    const user = store.data.users.find((u) => u.username === String(username).trim().toLowerCase());
    if (!user || !user.active || !verifyPassword(password, user.salt, user.passwordHash)) {
      throw new Error('Username หรือ Password ไม่ถูกต้อง');
    }
    currentUserId = user.id;
    user.lastLoginAt = new Date().toISOString();
    store.audit('login');
    return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
  });

  ipcMain.handle('auth:logout', () => {
    if (currentUserId) store.audit('logout');
    currentUserId = null;
    return { ok: true };
  });

  ipcMain.handle('settings:get', () => publicSettings(userSettings(requireLogin().id)));
  ipcMain.handle('settings:save', (_, payload) => {
    const user = requireLogin();
    const settings = userSettings(user.id);
    for (const key of ['provider', 'openaiModel', 'geminiModel', 'temperature', 'maxOutputTokens']) {
      if (typeof payload[key] !== 'undefined') settings[key] = payload[key];
    }
    settings.apiKeys ||= {};
    if (payload.openaiKey) settings.apiKeys.openai = encryptSecret(payload.openaiKey.trim());
    if (payload.geminiKey) settings.apiKeys.gemini = encryptSecret(payload.geminiKey.trim());
    if (payload.clearOpenAIKey) delete settings.apiKeys.openai;
    if (payload.clearGeminiKey) delete settings.apiKeys.gemini;
    store.audit('settings_saved', { provider: settings.provider });
    return publicSettings(settings);
  });
  ipcMain.handle('providers:list-models', (_, provider) => listModels(provider));

  ipcMain.handle('rooms:list', () => {
    const user = requireLogin();
    return store.data.rooms.filter((r) => r.userId === user.id && !r.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
  ipcMain.handle('rooms:create', (_, payload) => {
    const user = requireLogin();
    const room = {
      id: crypto.randomUUID(), userId: user.id,
      title: payload.title || 'แชทใหม่', mode: payload.mode || 'normal',
      systemPrompt: payload.systemPrompt || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    store.data.rooms.push(room); store.save(); return room;
  });
  ipcMain.handle('rooms:update', (_, payload) => {
    const user = requireLogin();
    const room = store.data.rooms.find((r) => r.id === payload.id && r.userId === user.id);
    if (!room) throw new Error('ไม่พบห้อง');
    Object.assign(room, payload.patch || {}, { updatedAt: new Date().toISOString() }); store.save(); return room;
  });
  ipcMain.handle('rooms:delete', (_, id) => {
    const user = requireLogin();
    const room = store.data.rooms.find((r) => r.id === id && r.userId === user.id);
    if (!room) throw new Error('ไม่พบห้อง');
    room.deletedAt = new Date().toISOString(); store.save(); return { ok: true };
  });
  ipcMain.handle('messages:list', (_, roomId) => {
    const user = requireLogin();
    const room = store.data.rooms.find((r) => r.id === roomId && r.userId === user.id);
    if (!room) throw new Error('ไม่พบห้อง');
    return store.data.messages.filter((m) => m.roomId === roomId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
  ipcMain.handle('chat:send', async (_, payload) => {
    const user = requireLogin();
    const room = store.data.rooms.find((r) => r.id === payload.roomId && r.userId === user.id);
    if (!room) throw new Error('ไม่พบห้อง');
    const userMessage = {
      id: crypto.randomUUID(), roomId: room.id, role: 'user', content: payload.content,
      attachments: (payload.attachments || []).map((f) => ({ name: f.name, path: f.path, size: f.size, kind: f.kind })),
      createdAt: new Date().toISOString()
    };
    store.data.messages.push(userMessage);
    room.updatedAt = new Date().toISOString();
    store.save();
    const history = store.data.messages.filter((m) => m.roomId === room.id).slice(-30).map((m) => ({ role: m.role, content: m.content }));
    const response = await callProvider({
      provider: payload.provider,
      model: payload.model,
      messages: history,
      systemPrompt: payload.systemPrompt || room.systemPrompt || '',
      attachments: payload.attachments || [],
      temperature: Number(payload.temperature),
      maxOutputTokens: Number(payload.maxOutputTokens)
    });
    const assistantMessage = {
      id: crypto.randomUUID(), roomId: room.id, role: 'assistant', content: response.text,
      provider: payload.provider, model: payload.model, usage: response.usage,
      finishReason: response.finishReason, createdAt: new Date().toISOString()
    };
    store.data.messages.push(assistantMessage);
    room.updatedAt = new Date().toISOString();
    if (room.title === 'แชทใหม่' && payload.content) room.title = payload.content.trim().slice(0, 45);
    store.save();
    return { userMessage, assistantMessage, room };
  });

  ipcMain.handle('files:select', async () => {
    requireLogin();
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'รองรับทั้งหมด', extensions: ['txt','md','csv','xlsx','xlsm','json','xml','html','css','js','ts','php','py','ps1','bat','sql','yaml','yml','png','jpg','jpeg','webp','gif','pdf','docx','zip'] },
        { name: 'ทุกไฟล์', extensions: ['*'] }
      ]
    });
    if (result.canceled) return [];
    return result.filePaths.map(readAttachment);
  });

  ipcMain.handle('batch:import', async (_, payload) => {
    const user = requireLogin();
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'ตารางงาน', extensions: ['csv','xlsx','xlsm','json'] }]
    });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    let rows = [];
    if (['.xlsx','.xlsm'].includes(ext)) {
      const wb = XLSX.readFile(filePath, { cellDates: true });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    } else if (ext === '.csv') {
      const wb = XLSX.readFile(filePath, { raw: false });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    } else if (ext === '.json') {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    }
    if (!rows.length) throw new Error('ไม่พบข้อมูลในไฟล์');
    const job = {
      id: crypto.randomUUID(), userId: user.id, name: payload.name || path.basename(filePath),
      sourceFile: filePath, instruction: payload.instruction || 'ประมวลผลข้อมูลตามที่กำหนด',
      systemPrompt: payload.systemPrompt || '', provider: payload.provider, model: payload.model,
      batchSize: Math.max(1, Math.min(3, Number(payload.batchSize || 1))),
      retry: Math.max(0, Number(payload.retry || 3)), delayMs: Math.max(0, Number(payload.delayMs || 2500)),
      stopAfterErrors: Math.max(1, Number(payload.stopAfterErrors || 5)),
      temperature: Number(payload.temperature ?? 0.2), maxOutputTokens: Number(payload.maxOutputTokens || 8192),
      status: 'draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      items: rows.map((row, index) => ({
        id: crypto.randomUUID(), rowNumber: index + 1, source: row, output: null,
        status: 'pending', retryCount: 0, error: '', createdAt: new Date().toISOString()
      }))
    };
    store.data.jobs.push(job); store.save(); return sanitizeJob(job);
  });
  ipcMain.handle('batch:list', () => {
    const user = requireLogin();
    return store.data.jobs.filter((j) => j.userId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(sanitizeJob);
  });
  ipcMain.handle('batch:start', (_, jobId) => {
    requireLogin();
    if (!batchControllers.has(jobId)) runBatch(jobId).catch((error) => {
      const job = store.data.jobs.find((j) => j.id === jobId);
      if (job) { job.status = 'failed'; job.lastError = error.message; store.save(); emitJob(job); }
    });
    else batchControllers.get(jobId).paused = false;
    return { ok: true };
  });
  ipcMain.handle('batch:pause', (_, jobId) => {
    requireLogin(); const controller = batchControllers.get(jobId); if (controller) controller.paused = true;
    const job = store.data.jobs.find((j) => j.id === jobId); if (job) { job.status = 'paused'; store.save(); emitJob(job); }
    return { ok: true };
  });
  ipcMain.handle('batch:cancel', (_, jobId) => {
    requireLogin(); const controller = batchControllers.get(jobId); if (controller) controller.cancelled = true;
    return { ok: true };
  });
  ipcMain.handle('batch:export', async (_, jobId) => {
    const user = requireLogin();
    const job = store.data.jobs.find((j) => j.id === jobId && j.userId === user.id);
    if (!job) throw new Error('ไม่พบงาน');
    const rows = job.items.map((item) => ({
      ...item.source,
      __row_number: item.rowNumber,
      __status: item.status,
      __retry: item.retryCount,
      __error: item.error,
      ...(item.output && typeof item.output === 'object' ? item.output : { __output: item.output || '' })
    }));
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(getDataDir(), 'exports', `${job.name.replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_')}_RESULT.xlsx`),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }, { name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled) return null;
    if (path.extname(result.filePath).toLowerCase() === '.json') fs.writeFileSync(result.filePath, JSON.stringify(rows, null, 2), 'utf8');
    else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'RESULT');
      XLSX.writeFile(wb, result.filePath);
    }
    shell.showItemInFolder(result.filePath);
    return result.filePath;
  });
}

app.whenReady().then(() => {
  const dataDir = getDataDir();
  store = new JsonStore(path.join(dataDir, 'database.json'));
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
