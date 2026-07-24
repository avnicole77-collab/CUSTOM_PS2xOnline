'use strict';

const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const AdmZip = require('adm-zip');

let mainWindow;
let currentUserId = null;
let store;
const batchControllers = new Map();
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
let activeChatAbortController = null;
const MAX_MESSAGE_CHARS = 12000;
const MAX_CONTEXT_CHARS = 250000;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENT_TOTAL_BYTES = 40 * 1024 * 1024;
const requestHistory = new Map();
const codeWorkspaces = new Map();

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
        notes: {},
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
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
  return dataDir;
}

function writeLog(level, event, details = {}) {
  const entry = JSON.stringify({ time: new Date().toISOString(), level, event, userId: currentUserId || null, ...details });
  fs.appendFileSync(path.join(getDataDir(), 'logs', 'app.jsonl'), `${entry}\n`, 'utf8');
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
      dailyTokenBudget: 0,
      requestsPerMinute: 30,
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
    dailyTokenBudget: Number(settings.dailyTokenBudget || 0),
    requestsPerMinute: Number(settings.requestsPerMinute || 30),
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
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    writeLog('error', 'renderer_gone', details);
  });
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

async function apiFetch(url, options = {}, timeoutMs = 180000, maxAttempts = 4, signal = null) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const effectiveSignal = signal || controller.signal;
      const response = await fetch(url, { ...options, signal: effectiveSignal });
      const raw = await response.text();
      let json;
      try { json = raw ? JSON.parse(raw) : {}; } catch (_) { json = { raw }; }
      if (!response.ok) {
        const message = json?.error?.message || json?.message || raw || `HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        const retryAfter = Number(response.headers.get('retry-after'));
        error.retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 0;
        throw error;
      }
      return json;
    } catch (error) {
      lastError = error;
      const userCancelled = Boolean(signal?.aborted);
      const timedOut = error.name === 'AbortError' && !userCancelled;
      const retryable = timedOut || RETRYABLE_STATUS.has(error.status);
      writeLog(retryable ? 'warn' : 'error', 'api_request_failed', {
        host: new URL(url).host,
        status: error.status || null,
        attempt,
        cancelled: userCancelled,
        message: error.message
      });
      // A user pressing Stop must end the request immediately. Retrying with the
      // same already-aborted signal only adds backoff delays and makes Stop appear
      // unresponsive.
      if (userCancelled) throw error;
      if (!retryable || attempt === maxAttempts) throw error;
      const delay = error.retryAfterMs || Math.min(30000, 1000 * (2 ** (attempt - 1)));
      await new Promise((resolve) => setTimeout(resolve, delay + Math.floor(Math.random() * 250)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function tokenCountFromUsage(usage = {}) {
  return Number(usage.total_tokens || usage.totalTokenCount || 0)
    || Number(usage.input_tokens || usage.promptTokenCount || 0) + Number(usage.output_tokens || usage.candidatesTokenCount || 0);
}

function enforceUsageLimits() {
  const user = requireLogin();
  const settings = userSettings(user.id);
  const now = Date.now();
  const recent = (requestHistory.get(user.id) || []).filter((time) => now - time < 60000);
  const limit = Math.max(1, Number(settings.requestsPerMinute || 30));
  if (recent.length >= limit) throw new Error(`ถึงขีดจำกัด ${limit} requests ต่อนาที กรุณารอสักครู่`);
  recent.push(now);
  requestHistory.set(user.id, recent);
  const today = new Date().toISOString().slice(0, 10);
  store.data.usage ||= {};
  const daily = store.data.usage[user.id]?.[today] || { tokens: 0, requests: 0 };
  const budget = Math.max(0, Number(settings.dailyTokenBudget || 0));
  if (budget && daily.tokens >= budget) throw new Error(`ถึงงบ Token รายวัน ${budget.toLocaleString()} แล้ว`);
}

function recordUsage(usage) {
  const user = requireLogin();
  const today = new Date().toISOString().slice(0, 10);
  store.data.usage ||= {};
  store.data.usage[user.id] ||= {};
  const daily = store.data.usage[user.id][today] ||= { tokens: 0, requests: 0 };
  daily.tokens += tokenCountFromUsage(usage);
  daily.requests += 1;
  store.save();
}

function workspaceFile(userId, relativePath) {
  const root = codeWorkspaces.get(userId);
  if (!root) throw new Error('กรุณาเปิดโฟลเดอร์โปรเจกต์ก่อน');
  const resolved = path.resolve(root, String(relativePath || ''));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('ตำแหน่งไฟล์อยู่นอก Workspace');
  if (fs.existsSync(resolved)) {
    const real = fs.realpathSync(resolved);
    const realRelative = path.relative(root, real);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error('ไฟล์ลิงก์ออกนอก Workspace');
  }
  return { root, resolved, relative };
}

function listWorkspaceFiles(root) {
  const output = [];
  const ignored = new Set(['.git', 'node_modules', 'release', 'dist', 'build']);
  const walk = (dir) => {
    if (output.length >= 5000) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) output.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  };
  walk(root);
  return output;
}

function requireOwner() {
  const user = requireLogin();
  if (user.role !== 'owner') throw new Error('เฉพาะ Owner เท่านั้นที่ทำรายการนี้ได้');
  return user;
}

function requireWriter() {
  const user = requireLogin();
  if (user.role === 'viewer') throw new Error('บัญชี Viewer เปิดดูได้อย่างเดียว');
  return user;
}

async function streamSse(url, options, signal, onEvent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  const effectiveSignal = signal || controller.signal;
  try {
    const response = await fetch(url, { ...options, signal: effectiveSignal });
    if (!response.ok) {
      const raw = await response.text();
      let json;
      try { json = raw ? JSON.parse(raw) : {}; } catch (_) { json = {}; }
      const error = new Error(json?.error?.message || json?.message || raw || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    if (!response.body) throw new Error('Provider did not return a response stream');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block.split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data && data !== '[DONE]') onEvent(data);
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith('data:')) onEvent(tail.slice(5).trimStart());
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
      .filter((id) => /^(gpt|o\d)/i.test(id))
      .filter((id) => !/(realtime|audio|transcrib|tts|image|search|computer-use|moderation|embedding|whisper|sora|chatgpt|instruct)/i.test(id))
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

async function callProvider({ provider, model, messages, systemPrompt, attachments, temperature, maxOutputTokens, signal, onDelta }) {
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
    if (onDelta) {
      payload.stream = true;
      let text = '';
      let usage = {};
      let responseId = null;
      let finishReason = null;
      await streamSse('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }, signal, (data) => {
        let event;
        try { event = JSON.parse(data); } catch (_) { return; }
        if (event.type === 'response.output_text.delta' && event.delta) {
          text += event.delta;
          onDelta(event.delta);
        }
        if (event.type === 'response.completed' && event.response) {
          usage = event.response.usage || {};
          responseId = event.response.id || null;
          finishReason = event.response.status || 'completed';
        }
        if (event.type === 'error') throw new Error(event.error?.message || event.message || 'OpenAI streaming error');
      });
      return { text, usage, responseId, finishReason };
    }
    const json = await apiFetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, 180000, 4, signal);
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
    if (onDelta) {
      let text = '';
      let usage = {};
      let responseId = null;
      let finishReason = null;
      await streamSse(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        },
        signal,
        (data) => {
          let chunk;
          try { chunk = JSON.parse(data); } catch (_) { return; }
          const delta = (chunk.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
          if (delta) {
            text += delta;
            onDelta(delta);
          }
          usage = chunk.usageMetadata || usage;
          responseId = chunk.responseId || responseId;
          finishReason = chunk.candidates?.[0]?.finishReason || finishReason;
        }
      );
      return { text, usage, responseId, finishReason };
    }
    const json = await apiFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      },
      180000,
      4,
      signal
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

async function callProviderWithFallback(request) {
  enforceUsageLimits();
  try {
    const result = await callProvider(request);
    recordUsage(result.usage);
    return result;
  } catch (primaryError) {
    if (/only supports interactions api/i.test(primaryError.message || '')) {
      primaryError.message = 'โมเดลนี้ไม่รองรับ Responses API กรุณาโหลดรายชื่อโมเดลใหม่และเลือกโมเดลข้อความรุ่นอื่น';
    }
    if (primaryError.status === 429) {
      primaryError.message = `ผู้ให้บริการปฏิเสธคำขอเพราะโควตาหรือ Rate Limit: ${primaryError.message}`;
    }
    if (!RETRYABLE_STATUS.has(primaryError.status)) throw primaryError;
    const settings = userSettings(requireLogin().id);
    const fallbackProvider = request.provider === 'openai' ? 'gemini' : 'openai';
    if (!settings.apiKeys?.[fallbackProvider]) throw primaryError;
    const models = await listModels(fallbackProvider);
    const fallbackModel = settings[`${fallbackProvider}Model`] || models[0];
    if (!fallbackModel) throw primaryError;
    writeLog('warn', 'provider_fallback', {
      fromProvider: request.provider, fromModel: request.model,
      toProvider: fallbackProvider, toModel: fallbackModel
    });
    const result = await callProvider({ ...request, provider: fallbackProvider, model: fallbackModel });
    recordUsage(result.usage);
    return { ...result, fallbackProvider, fallbackModel };
  }
}

async function readZipSafely(buffer, archiveName) {
  const entries = new AdmZip(buffer).getEntries();
  if (entries.length > 100) throw new Error(`ZIP ${archiveName} มีไฟล์เกิน 100 รายการ`);
  let totalBytes = 0;
  let output = '';
  const allowedText = new Set(['.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.php', '.py', '.ps1', '.bat', '.cmd', '.sql', '.yaml', '.yml', '.ini', '.log']);
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const normalized = String(entry.entryName || '').replace(/\\/g, '/');
    if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').includes('..')) {
      throw new Error(`ZIP ${archiveName} มี path ที่ไม่ปลอดภัย: ${normalized || '(empty)'}`);
    }
    totalBytes += Number(entry.header?.size || 0);
    if (totalBytes > 10 * 1024 * 1024) throw new Error(`ZIP ${archiveName} มีข้อมูลหลังแตกเกิน 10 MB`);
    if (!allowedText.has(path.extname(normalized).toLowerCase())) continue;
    output += `${output ? '\n\n' : ''}--- ZIP FILE: ${normalized} ---\n${entry.getData().toString('utf8').slice(0, 100000)}`;
    if (output.length >= MAX_CONTEXT_CHARS) break;
  }
  return output.slice(0, MAX_CONTEXT_CHARS) || `[ZIP ${archiveName}: ไม่มีไฟล์ข้อความที่รองรับ และไม่มีการรันไฟล์ภายใน]`;
}

async function readAttachment(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_ATTACHMENT_BYTES) throw new Error(`ไฟล์ ${path.basename(filePath)} ใหญ่เกิน ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB ในรุ่น Alpha`);
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
    return { name, path: filePath, size: stat.size, kind: 'text', text: JSON.stringify(result, null, 2).slice(0, MAX_CONTEXT_CHARS) };
  }
  const allowedText = ['.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.php', '.py', '.ps1', '.bat', '.cmd', '.sql', '.yaml', '.yml', '.ini', '.log'];
  if (allowedText.includes(ext)) {
    return { name, path: filePath, size: stat.size, kind: 'text', text: fs.readFileSync(filePath, 'utf8').slice(0, MAX_CONTEXT_CHARS) };
  }
  if (ext === '.pdf') {
    const result = await pdfParse(fs.readFileSync(filePath));
    return { name, path: filePath, size: stat.size, kind: 'text', text: String(result.text || '').slice(0, MAX_CONTEXT_CHARS) };
  }
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return { name, path: filePath, size: stat.size, kind: 'text', text: String(result.value || '').slice(0, MAX_CONTEXT_CHARS) };
  }
  if (ext === '.zip') {
    const text = await readZipSafely(fs.readFileSync(filePath), name);
    return { name, path: filePath, size: stat.size, kind: 'text', text };
  }
  return { name, path: filePath, size: stat.size, kind: 'binary', text: `[ไฟล์แนบ ${name} ยังไม่รองรับการอ่านข้อความในรุ่น Alpha]` };
}

function cleanJsonText(text) {
  return String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function validateBatchResult(result, rules = {}, source = {}) {
  const errors = [];
  if (result === null || typeof result === 'undefined') errors.push('ผลลัพธ์ว่าง');
  const requiredFields = Array.isArray(rules.requiredFields) ? rules.requiredFields : [];
  if (requiredFields.length && (!result || typeof result !== 'object' || Array.isArray(result))) {
    errors.push('ผลลัพธ์ต้องเป็น JSON object');
  } else {
    for (const field of requiredFields) {
      const value = result?.[field];
      if (value === null || typeof value === 'undefined' || String(value).trim() === '') {
        errors.push(`ไม่มีข้อมูลช่อง ${field}`);
      }
    }
  }
  const serialized = JSON.stringify(result ?? '');
  const textValue = typeof result === 'string'
    ? result
    : Object.values(result && typeof result === 'object' ? result : {}).filter((value) => typeof value === 'string').join('\n');
  const charCount = textValue.length;
  const wordCount = textValue.trim() ? textValue.trim().split(/\s+/).length : 0;
  const paragraphCount = textValue.trim() ? textValue.trim().split(/\n\s*\n/).filter(Boolean).length : 0;
  if (Number(rules.minChars) > 0 && charCount < Number(rules.minChars)) errors.push(`ความยาว ${charCount} ตัวอักษร ต่ำกว่า ${rules.minChars}`);
  if (Number(rules.maxChars) > 0 && charCount > Number(rules.maxChars)) errors.push(`ความยาว ${charCount} ตัวอักษร เกิน ${rules.maxChars}`);
  if (Number(rules.minWords) > 0 && wordCount < Number(rules.minWords)) errors.push(`จำนวนคำ ${wordCount} ต่ำกว่า ${rules.minWords}`);
  if (Number(rules.paragraphs) > 0 && paragraphCount !== Number(rules.paragraphs)) errors.push(`จำนวนย่อหน้า ${paragraphCount} ต้องเป็น ${rules.paragraphs}`);
  for (const field of Array.isArray(rules.sourceEqualFields) ? rules.sourceEqualFields : []) {
    if (JSON.stringify(result?.[field] ?? null) !== JSON.stringify(source?.[field] ?? null)) errors.push(`ช่อง ${field} ไม่ตรงข้อมูลต้นฉบับ`);
  }
  const fieldTypes = rules.fieldTypes && typeof rules.fieldTypes === 'object' ? rules.fieldTypes : {};
  for (const [field, expectedType] of Object.entries(fieldTypes)) {
    if (typeof result?.[field] !== expectedType) errors.push(`ช่อง ${field} ต้องเป็นชนิด ${expectedType}`);
  }
  for (const term of Array.isArray(rules.forbiddenTerms) ? rules.forbiddenTerms : []) {
    if (term && serialized.toLocaleLowerCase().includes(String(term).toLocaleLowerCase())) {
      errors.push(`พบคำต้องห้าม: ${term}`);
    }
  }
  if (/```|^\s*(ต่อไปนี้คือ|นี่คือผลลัพธ์|ผมได้วิเคราะห์)/i.test(
    typeof result === 'string' ? result : ''
  )) {
    errors.push('พบ Markdown หรือคำอธิบายที่ไม่ได้อนุญาต');
  }
  return errors;
}

async function repairBatchResult(job, item, currentResult, errors) {
  const response = await callProviderWithFallback({
    provider: job.provider,
    model: job.model,
    messages: [{
      role: 'user',
      content: [
        'ซ่อมเฉพาะช่องที่ตรวจไม่ผ่าน คืน JSON object เท่านั้น',
        'ห้ามแก้ช่องอื่นที่ผ่านแล้ว ห้ามเพิ่มคำอธิบายหรือ Markdown',
        `ERRORS: ${JSON.stringify(errors)}`,
        `SOURCE: ${JSON.stringify(item.source)}`,
        `CURRENT_RESULT: ${JSON.stringify(currentResult)}`
      ].join('\n')
    }],
    systemPrompt: job.systemPrompt || 'คุณเป็นระบบซ่อมข้อมูลแบบเข้มงวด',
    attachments: [],
    temperature: 0,
    maxOutputTokens: job.maxOutputTokens || 8192
  });
  const repaired = JSON.parse(cleanJsonText(response.text));
  if (!repaired || typeof repaired !== 'object' || Array.isArray(repaired)) throw new Error('ผลซ่อมไม่ใช่ JSON object');
  const invalidFields = new Set(errors.map((error) => String(error).match(/ช่อง\s+([^\s]+)/)?.[1]).filter(Boolean));
  if (!invalidFields.size) return { ...currentResult, ...repaired };
  const merged = { ...currentResult };
  for (const field of invalidFields) {
    if (Object.prototype.hasOwnProperty.call(repaired, field)) merged[field] = repaired[field];
  }
  return merged;
}

function recoverInterruptedJobs() {
  let changed = false;
  for (const job of store.data.jobs) {
    if (job.status === 'running') {
      job.status = 'paused';
      job.lastError = 'โปรแกรมถูกปิดระหว่างทำงาน กดทำต่อเพื่อเริ่มจาก Checkpoint ล่าสุด';
      changed = true;
    }
    for (const item of job.items || []) {
      if (item.status === 'running') {
        item.status = 'retry';
        item.error = 'กู้คืนจากงานที่ถูกขัดจังหวะ';
        changed = true;
      }
    }
  }
  if (changed) {
    store.save();
    writeLog('warn', 'interrupted_jobs_recovered');
  }
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
    const group = pending.slice(0, Math.max(1, Math.min(6, Number(job.batchSize || 3))));
    group.forEach((item) => { item.status = 'running'; item.updatedAt = new Date().toISOString(); });
    store.save();
    emitJob(job);

    const sourceRows = group.map((item) => ({ item_id: item.id, row_number: item.rowNumber, source: item.source }));
    const strictInstruction = `${job.instruction}\n\nข้อบังคับระบบ:\n- ใช้เฉพาะข้อมูล source ของแต่ละรายการ\n- ห้ามอธิบายขั้นตอน ห้ามใส่ Markdown ห้ามใส่ข้อความก่อนหรือหลัง JSON\n- ห้ามนำข้อมูลข้ามรายการมาปนกัน\n- คืน JSON array เท่านั้น จำนวน ${group.length} รายการ\n- แต่ละ object ต้องมี item_id เดิมและ result\nรูปแบบ: [{"item_id":"...","result":{}}]`;

    try {
      const response = await callProviderWithFallback({
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
        let finalResult = entry.result;
        let validationErrors = validateBatchResult(finalResult, job.validator, item.source);
        if (validationErrors.length && Number(job.autoRepair ?? 1) > 0) {
          try {
            finalResult = await repairBatchResult(job, item, finalResult, validationErrors);
            validationErrors = validateBatchResult(finalResult, job.validator, item.source);
            item.repaired = true;
          } catch (repairError) {
            validationErrors.push(`ซ่อมอัตโนมัติไม่สำเร็จ: ${repairError.message}`);
          }
        }
        if (validationErrors.length) {
          item.status = 'retry';
          item.error = validationErrors.join(' | ');
          item.validationErrors = validationErrors;
          item.retryCount += 1;
          continue;
        }
        item.output = finalResult;
        item.rawOutput = response.text;
        item.status = 'success';
        item.provider = response.fallbackProvider || job.provider;
        item.model = response.fallbackModel || job.model;
        item.error = '';
        item.validationErrors = [];
        item.updatedAt = new Date().toISOString();
      }
      consecutiveErrors = group.some((i) => i.status !== 'success') ? consecutiveErrors + 1 : 0;
    } catch (error) {
      consecutiveErrors += 1;
      writeLog('error', 'batch_group_failed', { jobId, message: error.message, status: error.status || null });
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
  ipcMain.handle('auth:change-password', (_, payload) => {
    const user = requireLogin();
    if (!verifyPassword(String(payload.currentPassword || ''), user.salt, user.passwordHash)) throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    if (String(payload.newPassword || '').length < 8) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
    const { salt, hash } = hashPassword(payload.newPassword);
    user.salt = salt;
    user.passwordHash = hash;
    user.passwordChangedAt = new Date().toISOString();
    store.audit('password_changed');
    return { ok: true };
  });
  ipcMain.handle('users:list', () => {
    requireOwner();
    return store.data.users.map(({ passwordHash, salt, ...user }) => user);
  });
  ipcMain.handle('users:create', (_, payload) => {
    requireOwner();
    const username = String(payload.username || '').trim().toLowerCase();
    if (username.length < 3) throw new Error('Username ต้องมีอย่างน้อย 3 ตัวอักษร');
    if (store.data.users.some((user) => user.username === username)) throw new Error('Username นี้มีอยู่แล้ว');
    if (String(payload.password || '').length < 8) throw new Error('Password ต้องมีอย่างน้อย 8 ตัวอักษร');
    const role = ['user', 'viewer'].includes(payload.role) ? payload.role : 'user';
    const { salt, hash } = hashPassword(payload.password);
    const user = {
      id: crypto.randomUUID(), username,
      displayName: String(payload.displayName || username).trim(),
      role, salt, passwordHash: hash, active: true,
      createdAt: new Date().toISOString()
    };
    store.data.users.push(user);
    store.audit('user_created', { targetUserId: user.id, role });
    const { passwordHash, salt: ignored, ...safeUser } = user;
    return safeUser;
  });
  ipcMain.handle('users:update', (_, payload) => {
    const owner = requireOwner();
    const user = store.data.users.find((item) => item.id === payload.id);
    if (!user) throw new Error('ไม่พบบัญชี');
    if (user.id === owner.id && payload.active === false) throw new Error('ไม่สามารถระงับบัญชี Owner ที่กำลังใช้งาน');
    if (user.role !== 'owner' && ['user', 'viewer'].includes(payload.role)) user.role = payload.role;
    if (typeof payload.active === 'boolean') user.active = payload.active;
    if (payload.displayName) user.displayName = String(payload.displayName).trim();
    store.audit('user_updated', { targetUserId: user.id, role: user.role, active: user.active });
    return { ok: true };
  });
  ipcMain.handle('data:backup', async () => {
    requireOwner();
    store.save();
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(getDataDir(), 'backups', `BOSSMASTER_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
      filters: [{ name: 'BOSSMASTER Backup', extensions: ['json'] }]
    });
    if (result.canceled) return null;
    fs.copyFileSync(store.filePath, result.filePath);
    return result.filePath;
  });
  ipcMain.handle('data:restore', async () => {
    const owner = requireOwner();
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'BOSSMASTER Backup', extensions: ['json'] }]
    });
    if (result.canceled) return null;
    const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    for (const key of ['users', 'settings', 'rooms', 'messages', 'jobs']) {
      if (!parsed || typeof parsed !== 'object' || !(key in parsed)) throw new Error(`ไฟล์สำรองไม่สมบูรณ์: ไม่มี ${key}`);
    }
    if (!parsed.users.some((user) => user.id === owner.id)) throw new Error('ไฟล์สำรองไม่มีบัญชี Owner ที่กำลังใช้งาน');
    const safetyCopy = path.join(getDataDir(), 'backups', `before_restore_${Date.now()}.json`);
    fs.copyFileSync(store.filePath, safetyCopy);
    fs.writeFileSync(store.filePath, JSON.stringify(parsed, null, 2), 'utf8');
    store = new JsonStore(store.filePath);
    store.audit('database_restored', { safetyCopy });
    return { ok: true, safetyCopy };
  });

  ipcMain.handle('settings:get', () => publicSettings(userSettings(requireLogin().id)));
  ipcMain.handle('logs:get', () => {
    const user = requireLogin();
    const logPath = path.join(getDataDir(), 'logs', 'app.jsonl');
    if (!fs.existsSync(logPath)) return [];
    return fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).slice(-500).map((line) => {
      try { return JSON.parse(line); } catch (_) { return null; }
    }).filter((entry) => entry && (user.role === 'owner' || entry.userId === user.id)).map((entry) => {
      const { apiKey, key, authorization, ...safe } = entry;
      return safe;
    });
  });
  ipcMain.handle('settings:save', (_, payload) => {
    const user = requireLogin();
    const settings = userSettings(user.id);
    for (const key of ['provider', 'openaiModel', 'geminiModel', 'temperature', 'maxOutputTokens', 'dailyTokenBudget', 'requestsPerMinute']) {
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

  ipcMain.handle('notes:get', () => {
    const user = requireLogin();
    store.data.notes ||= {};
    return store.data.notes[user.id] || { content: '', updatedAt: null };
  });
  ipcMain.handle('notes:save', (_, payload) => {
    const user = requireWriter();
    const content = String(payload?.content || '');
    if (content.length > 2_000_000) throw new Error('Notepad รองรับสูงสุด 2,000,000 ตัวอักษร');
    store.data.notes ||= {};
    store.data.notes[user.id] = { content, updatedAt: new Date().toISOString() };
    store.save();
    return { updatedAt: store.data.notes[user.id].updatedAt, length: content.length };
  });
  ipcMain.handle('clipboard:write-text', (_, text) => {
    requireLogin();
    clipboard.writeText(String(text || ''));
    return { ok: true };
  });
  ipcMain.handle('code:open-folder', async () => {
    const user = requireWriter();
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (result.canceled) return null;
    const root = fs.realpathSync(path.resolve(result.filePaths[0]));
    codeWorkspaces.set(user.id, root);
    return { root, files: listWorkspaceFiles(root) };
  });
  ipcMain.handle('code:read-file', (_, relativePath) => {
    const user = requireWriter();
    const file = workspaceFile(user.id, relativePath);
    const stat = fs.statSync(file.resolved);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('รองรับไฟล์ข้อความขนาดไม่เกิน 1 MB');
    return { path: file.relative.replace(/\\/g, '/'), content: fs.readFileSync(file.resolved, 'utf8') };
  });
  ipcMain.handle('code:search', (_, query) => {
    const user = requireWriter();
    const root = codeWorkspaces.get(user.id);
    if (!root) throw new Error('กรุณาเปิดโฟลเดอร์โปรเจกต์ก่อน');
    const term = String(query || '').toLocaleLowerCase();
    if (!term) return [];
    const matches = [];
    for (const relative of listWorkspaceFiles(root)) {
      if (matches.length >= 200) break;
      const full = path.join(root, relative);
      try {
        if (fs.statSync(full).size > 1024 * 1024) continue;
        const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
          if (matches.length < 200 && line.toLocaleLowerCase().includes(term)) {
            matches.push({ path: relative, line: index + 1, preview: line.trim().slice(0, 200) });
          }
        });
      } catch (_) {}
    }
    return matches;
  });
  ipcMain.handle('code:write-file', (_, payload) => {
    const user = requireWriter();
    const file = workspaceFile(user.id, payload.path);
    if (!fs.existsSync(file.resolved) || !fs.statSync(file.resolved).isFile()) throw new Error('ไม่พบไฟล์เดิม');
    const content = String(payload.content ?? '');
    if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) throw new Error('ไฟล์ใหม่ใหญ่เกิน 2 MB');
    const backupDir = path.join(getDataDir(), 'backups', 'code', String(Date.now()));
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, path.basename(file.resolved));
    fs.copyFileSync(file.resolved, backupPath);
    fs.writeFileSync(file.resolved, content, 'utf8');
    store.audit('code_file_written', { path: file.relative, backupPath });
    return { ok: true, backupPath };
  });

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
  ipcMain.handle('chat:send', async (event, payload) => {
    const user = requireWriter();
    const room = store.data.rooms.find((r) => r.id === payload.roomId && r.userId === user.id);
    if (!room) throw new Error('ไม่พบห้อง');

    if (activeChatAbortController) {
      activeChatAbortController.abort();
      activeChatAbortController = null;
    }

    const content = String(payload.content || '');
    const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
    const contextChars = content.length + attachments.reduce((sum, file) => sum + String(file.text || '').length, 0);
    if (content.length > MAX_MESSAGE_CHARS) {
      throw new Error(`ข้อความยาวเกิน ${MAX_MESSAGE_CHARS.toLocaleString()} ตัวอักษร กรุณาแบ่งส่งเป็นหลายรอบ`);
    }
    if (contextChars > MAX_CONTEXT_CHARS) {
      throw new Error(`ข้อความและไฟล์แนบรวมเกิน ${MAX_CONTEXT_CHARS.toLocaleString()} ตัวอักษร กรุณาลดขนาดก่อนส่ง`);
    }
    const totalAttachmentBytes = attachments.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalAttachmentBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
      throw new Error(`รวมไฟล์แนบเกิน ${Math.round(MAX_ATTACHMENT_TOTAL_BYTES / 1024 / 1024)} MB กรุณาเลือกไฟล์เล็กลง`);
    }

    const userMessage = {
      id: crypto.randomUUID(), roomId: room.id, role: 'user', content,
      attachments: attachments.map((f) => ({ name: f.name, path: f.path, size: f.size, kind: f.kind })),
      createdAt: new Date().toISOString()
    };
    store.data.messages.push(userMessage);
    room.updatedAt = new Date().toISOString();
    store.save();
    const history = store.data.messages.filter((m) => m.roomId === room.id).slice(-30).map((m) => ({ role: m.role, content: m.content }));
    activeChatAbortController = new AbortController();
    try {
      const response = await callProviderWithFallback({
        provider: payload.provider,
        model: payload.model,
        messages: history,
        systemPrompt: payload.systemPrompt || room.systemPrompt || '',
        attachments,
        temperature: Number(payload.temperature),
        maxOutputTokens: Number(payload.maxOutputTokens),
        signal: activeChatAbortController.signal,
        onDelta: (delta) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('chat:stream-delta', { roomId: room.id, delta });
          }
        }
      });
      const assistantMessage = {
        id: crypto.randomUUID(), roomId: room.id, role: 'assistant', content: response.text,
        provider: response.fallbackProvider || payload.provider, model: response.fallbackModel || payload.model, usage: response.usage,
        finishReason: response.finishReason, createdAt: new Date().toISOString()
      };
      store.data.messages.push(assistantMessage);
      room.updatedAt = new Date().toISOString();
      if (room.title === 'แชทใหม่' && content) room.title = content.trim().slice(0, 45);
      store.save();
      return { userMessage, assistantMessage, room };
    } finally {
      activeChatAbortController = null;
    }
  });

  ipcMain.handle('chat:stop', () => {
    if (activeChatAbortController) {
      activeChatAbortController.abort();
      activeChatAbortController = null;
    }
    return { ok: true };
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
    return Promise.all(result.filePaths.map(readAttachment));
  });

  ipcMain.handle('batch:import', async (_, payload) => {
    const user = requireWriter();
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
      batchSize: Math.max(1, Math.min(6, Number(payload.batchSize || 3))),
      retry: Math.max(0, Number(payload.retry || 3)), delayMs: Math.max(0, Number(payload.delayMs || 2500)),
      stopAfterErrors: Math.max(1, Number(payload.stopAfterErrors || 5)),
      autoRepair: payload.autoRepair === false ? 0 : 1,
      validator: {
        requiredFields: String(payload.requiredFields || '').split(',').map((value) => value.trim()).filter(Boolean),
        forbiddenTerms: String(payload.forbiddenTerms || '').split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
        sourceEqualFields: String(payload.sourceEqualFields || '').split(',').map((value) => value.trim()).filter(Boolean),
        minChars: Math.max(0, Number(payload.minChars || 0)),
        maxChars: Math.max(0, Number(payload.maxChars || 0)),
        minWords: Math.max(0, Number(payload.minWords || 0)),
        paragraphs: Math.max(0, Number(payload.paragraphs || 0)),
        fieldTypes: (() => {
          try { return payload.fieldTypes ? JSON.parse(payload.fieldTypes) : {}; }
          catch (_) { throw new Error('JSON ชนิดข้อมูลไม่ถูกต้อง ตัวอย่าง: {"title":"string"}'); }
        })()
      },
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
    const user = requireWriter();
    const job = store.data.jobs.find((item) => item.id === jobId && item.userId === user.id);
    if (!job) throw new Error('ไม่พบงาน Batch');
    if (!batchControllers.has(jobId)) runBatch(jobId).catch((error) => {
      if (job) { job.status = 'failed'; job.lastError = error.message; store.save(); emitJob(job); }
    });
    else {
      batchControllers.get(jobId).paused = false;
      job.status = 'running';
      store.save();
      emitJob(job);
    }
    return { ok: true };
  });
  ipcMain.handle('batch:pause', (_, jobId) => {
    const user = requireLogin(); const controller = batchControllers.get(jobId); if (controller) controller.paused = true;
    const job = store.data.jobs.find((j) => j.id === jobId && j.userId === user.id);
    if (!job) throw new Error('ไม่พบงาน Batch');
    job.status = 'paused'; store.save(); emitJob(job);
    return { ok: true };
  });
  ipcMain.handle('batch:cancel', (_, jobId) => {
    const user = requireLogin();
    const job = store.data.jobs.find((j) => j.id === jobId && j.userId === user.id);
    if (!job) throw new Error('ไม่พบงาน Batch');
    const controller = batchControllers.get(jobId); if (controller) controller.cancelled = true;
    job.status = 'cancelled'; store.save(); emitJob(job);
    return { ok: true };
  });
  ipcMain.handle('batch:retry-failed', (_, jobId) => {
    const user = requireLogin();
    const job = store.data.jobs.find((j) => j.id === jobId && j.userId === user.id);
    if (!job) throw new Error('ไม่พบงาน Batch');
    let count = 0;
    for (const item of job.items) {
      if (item.status === 'failed') {
        item.status = 'retry';
        item.retryCount = 0;
        item.error = '';
        item.validationErrors = [];
        count += 1;
      }
    }
    if (count) {
      job.status = 'paused';
      job.lastError = '';
      job.updatedAt = new Date().toISOString();
      store.save();
      emitJob(job);
    }
    return { ok: true, count };
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
      __provider: item.provider || job.provider,
      __model: item.model || job.model,
      ...(item.output && typeof item.output === 'object' ? item.output : { __output: item.output || '' })
    }));
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(getDataDir(), 'exports', `${job.name.replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_')}_RESULT.xlsx`),
      filters: [
        { name: 'Excel', extensions: ['xlsx'] },
        { name: 'CSV UTF-8', extensions: ['csv'] },
        { name: 'JSON', extensions: ['json'] }
        ,{ name: 'JSON Lines', extensions: ['jsonl'] }
      ]
    });
    if (result.canceled) return null;
    const outputExt = path.extname(result.filePath).toLowerCase();
    if (outputExt === '.json') fs.writeFileSync(result.filePath, JSON.stringify(rows, null, 2), 'utf8');
    else if (outputExt === '.jsonl') fs.writeFileSync(result.filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    else if (outputExt === '.csv') {
      const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows));
      fs.writeFileSync(result.filePath, `\uFEFF${csv}`, 'utf8');
    }
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
  recoverInterruptedJobs();
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
