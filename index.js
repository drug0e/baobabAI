/*
  Astraof Chat Moderator Bot (Node.js)

  This bot listens to Astraof gateway messages and uses Groq's LLM (llama-3.1-8b-instant)
  to classify content against a moderation policy. When a violation is detected, it
  issues moderation actions (warn, mute, ban) via Astraof API.

  Requirements:
  - Node.js 18+
  - npm install axios ws

  Configuration (example):

  export BOT_TOKEN="<astraof-bot-token>"
  export GROQ_API_KEY="<groq-api-key>"
  export ASTRA_API_BASE="https://astraof.com/api"
  export ASTRA_GATEWAY_URL="wss://astraof.com/gateway"
  export MOD_LOG_FILE="./moderation.log"

  Optional:
  export MOD_ACTION_CHANNEL_ID="<channel-id>"  # where bot posts moderation actions

  Notes:
  - This is intended as a starting point. Adjust Astraof API paths based on the
    official docs: https://astraof.com/docs
  - Extend `buildModerationPrompt()` to customize rules or severity thresholds.
  - The bot uses a simple in-memory warning counter; persist it externally for production.
*/

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const WebSocket = require('ws');
const axios = require('axios');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');

// On Windows, fluent-ffmpeg needs to know where ffmpeg/ffprobe are installed.
// In your environment, ffmpeg is located at C:\ffmpeg\bin.
ffmpeg.setFfmpegPath('C:\\ffmpeg\\bin\\ffmpeg.exe');
ffmpeg.setFfprobePath('C:\\ffmpeg\\bin\\ffprobe.exe');

const imageHash = require('image-hash');
const LRU = require('lru-cache');
const moderationConfig = require('./moderationConfig');
// --- VirusTotal API integration ---
const VIRUSTOTAL_API_KEY = process.env.VIRUSTOTAL_API_KEY;
async function scanWithVirusTotal(url) {
  try {
    // VirusTotal expects a POST /urls request with url-encoded body.
    const response = await axios.post(
      'https://www.virustotal.com/api/v3/urls',
      new URLSearchParams({ url }),
      {
        headers: {
          'x-apikey': VIRUSTOTAL_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const scanId = response.data.data.id;
    // Get scan result
    const result = await axios.get(`https://www.virustotal.com/api/v3/analyses/${scanId}`,
      { headers: { 'x-apikey': VIRUSTOTAL_API_KEY } });
    return result.data.data;
  } catch (err) {
    console.error('VirusTotal scan error:', err.message);
    return null;
  }
}

// --- Image moderation (perceptual hashing) ---
// We use multi-hash (pHash/dHash/aHash) to make image moderation robust to minor edits
// like resizing/compression/brightness changes. For animated GIFs we sample multiple
// frames so a single bad frame triggers moderation.

const IMAGE_MODERATION_CACHE = new LRU({ max: 1000, ttl: 1000 * 60 * 30 });

// Banned hashes are now loaded from bannedHashes.js
const bannedHashes = require('./bannedHashes');

function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== hashB.length) return Number.MAX_SAFE_INTEGER;
  let dist = 0;
  for (let i = 0; i < hashA.length; i += 2) {
    const a = parseInt(hashA.substring(i, i + 2), 16);
    const b = parseInt(hashB.substring(i, i + 2), 16);
    let x = a ^ b;
    while (x) {
      dist += x & 1;
      x >>>= 1;
    }
  }
  return dist;
}

function computeHash(buffer, algorithm) {
  return new Promise((resolve, reject) => {
    imageHash(buffer, 16, algorithm, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

async function computeMultiHash(buffer, options = {}) {
  // Normalize the image so small edits don't change the hash dramatically.
  const normalized = await sharp(buffer)
    .resize(options.width || 256, options.height || 256, { fit: 'fill' })
    .grayscale()
    .toBuffer();

  const [phash, dhash, ahash] = await Promise.all([
    computeHash(normalized, 'phash'),
    computeHash(normalized, 'dhash'),
    computeHash(normalized, 'ahash')
  ]);

  return { phash, dhash, ahash };
}

function isUrl(str) {
  return typeof str === 'string' && /^https?:\/\//i.test(str);
}

async function loadImageBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string') {
    if (isUrl(input)) {
      const resp = await axios.get(input, { responseType: 'arraybuffer', timeout: 20000 });
      return Buffer.from(resp.data);
    }
    return fs.promises.readFile(input);
  }
  throw new Error('Unsupported image input. Must be a Buffer, file path, or URL.');
}

async function extractGifFrames(buffer, maxFrames = 10) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'modimg-'));
  const gifPath = path.join(tmpDir, 'input.gif');
  await fs.promises.writeFile(gifPath, buffer);

  const metadata = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(gifPath, (err, meta) => (err ? reject(err) : resolve(meta)));
  });

  const videoStream = (metadata.streams || []).find((s) => s.codec_type === 'video');
  const frameCount = Number(videoStream?.nb_frames) || 0;
  const framesToExtract = Math.min(maxFrames, frameCount || maxFrames);
  const step = frameCount ? Math.max(1, Math.floor(frameCount / framesToExtract)) : 1;

  const framePattern = path.join(tmpDir, 'frame-%03d.png');
  await new Promise((resolve, reject) => {
    ffmpeg(gifPath)
      .outputOptions('-vsync', 'vfr')
      .outputOptions('-frames:v', `${framesToExtract}`)
      .outputOptions('-vf', `select='not(mod(n\\,${step}))'`)
      .output(framePattern)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  const files = await fs.promises.readdir(tmpDir);
  const frames = files
    .filter((f) => f.endsWith('.png'))
    .map((f) => path.join(tmpDir, f))
    .sort();

  return {
    frames,
    cleanup: async () => fs.promises.rm(tmpDir, { recursive: true, force: true })
  };
}

async function moderateImage(imageInput, options = {}) {
  const maxFileSize = options.maxFileSize || 16 * 1024 * 1024;
  const maxFrames = options.maxFrames || 10;

  let buffer;
  try {
    buffer = await loadImageBuffer(imageInput);
  } catch (err) {
    return { violation: false, reason: 'error', details: { error: err.message } };
  }

  const cacheKey = crypto.createHash('sha256').update(buffer).digest('hex');
  const cached = IMAGE_MODERATION_CACHE.get(cacheKey);
  if (cached) return cached;

  if (buffer.length > maxFileSize) {
    const result = { violation: false, reason: 'error', details: { error: 'file_too_large' } };
    IMAGE_MODERATION_CACHE.set(cacheKey, result);
    return result;
  }

  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (err) {
    const result = { violation: false, reason: 'error', details: { error: 'invalid_image' } };
    IMAGE_MODERATION_CACHE.set(cacheKey, result);
    return result;
  }

  const format = (metadata.format || '').toLowerCase();
  const supported = new Set(['jpeg', 'jpg', 'png', 'webp', 'gif', 'bmp', 'tiff']);
  if (!supported.has(format)) {
    const result = { violation: false, reason: 'error', details: { error: 'unsupported_format', format } };
    IMAGE_MODERATION_CACHE.set(cacheKey, result);
    return result;
  }

  const hashSets = [];
  let cleanupFn = null;

  try {
    if (format === 'gif') {
      const { frames, cleanup } = await extractGifFrames(buffer, maxFrames);
      cleanupFn = cleanup;
      for (const framePath of frames) {
        const frameBuffer = await fs.promises.readFile(framePath);
        hashSets.push(await computeMultiHash(frameBuffer));
      }
    } else {
      hashSets.push(await computeMultiHash(buffer));
    }
  } catch (err) {
    if (cleanupFn) await cleanupFn();
    const result = { violation: false, reason: 'error', details: { error: err.message } };
    IMAGE_MODERATION_CACHE.set(cacheKey, result);
    return result;
  }

  if (cleanupFn) await cleanupFn();

  const thresholds = { phash: 12, combined: 25 };
  let bestMatch = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let framesChecked = 0;
  let hashesComputed = 0;

  for (const hashes of hashSets) {
    framesChecked += 1;
    hashesComputed += 3;

    for (const banned of bannedHashes) {
      const ph = hammingDistance(hashes.phash, banned.phash);
      const dh = hammingDistance(hashes.dhash, banned.dhash);
      const ah = hammingDistance(hashes.ahash, banned.ahash);
      const score = ph + dh + ah;

      if (score < bestScore) {
        bestScore = score;
        bestMatch = { id: banned.id, score, ph, dh, ah };
      }

      if (ph <= thresholds.phash && score <= thresholds.combined) {
        const result = {
          violation: true,
          reason: 'hash_match',
          matchedHashId: banned.id,
          score,
          details: { framesChecked, hashesComputed }
        };
        IMAGE_MODERATION_CACHE.set(cacheKey, result);
        return result;
      }
    }
  }

  const result = {
    violation: false,
    reason: 'safe',
    matchedHashId: bestMatch?.id,
    score: bestMatch?.score,
    details: { framesChecked, hashesComputed }
  };
  IMAGE_MODERATION_CACHE.set(cacheKey, result);
  return result;
}

// --- Structured moderation logging (new format) ---
function logModerationActionStructured({ user_id, message_id, violation_type, severity, mute_duration, reason, rule_id, rule_name }) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    user_id,
    message_id,
    violation_type,
    severity,
    mute_duration,
    reason,
    rule_id,
    rule_name
  };
  appendLog('moderation.log', JSON.stringify(logEntry) + '\n');
}

function formatLogTimestamp(date = new Date()) {
  // Use local time with offset, so logs match the local timezone instead of UTC.
  const pad = (n) => String(n).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const hours = pad(Math.floor(absOffset / 60));
  const minutes = pad(absOffset % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${hours}:${minutes}`;
}

function appendLog(file, text) {
  fs.appendFile(file, text, (err) => {
    if (err) console.error(`[Log] append to ${file} failed:`, err);
  });
}

// --- Attachment type detection ---
function detectAttachmentType(url) {
  if (!url) return null;
  const lurl = url.toLowerCase();
  // Match extensions even if there are query params (e.g. image.jpg?token=123)
  if (lurl.match(/\.(jpg|jpeg|png|webp|bmp)(\?|$)/)) return 'image';
  if (lurl.match(/\.(gif)(\?|$)/)) return 'gif';
  if (lurl.match(/\.(zip|rar|7z|tar|gz|exe|pdf|docx?|xlsx?|pptx?)(\?|$)/)) return 'file';
  if (lurl.startsWith('http')) return 'link';
  return null;
}

// --- Moderation pipeline ---
async function moderateMessagePipeline({ guildId, channelId, userId, messageId, attachmentUrls, suppressLog = false }) {
  // Требуется guildId для применения наказания
  const effectiveGuildId = guildId || globalThis.lastGuildId || null;
  const results = [];

  for (const url of attachmentUrls) {
    const type = detectAttachmentType(url);
    let penalty = 'none';
    let result = null;

    if (type === 'image' || type === 'gif') {
      // Perceptual hash moderation (no LLM)
      result = await moderateImage(url, { maxFrames: 10 });
      penalty = result.violation ? 'mute' : 'none';

      if (!suppressLog) {
        const now = formatLogTimestamp();
        const logLine = `[${now}] Image hash moderation: получил вложение от ${userId} (тип: ${type}, ссылка: ${url}) => вывод: ${penalty}\n`;
        appendLog('llm_moderation.log', logLine);
      }

      if (result.violation) {
        logModerationActionStructured({
          user_id: userId,
          message_id: messageId,
          violation_type: 'hash_match',
          severity: null,
          mute_duration: 0,
          reason: result.reason || 'hash_match',
          rule_id: result.matchedHashId || null,
          rule_name: result.matchedHashId ? 'hash_match' : null
        });
        // Применяем наказание (mute)
        await applyModerationAction({
          guildId,
          channelId,
          userId,
          moderatorId: botUserId,
          violation: {
            penalty: 'mute',
            duration: '1h',
            reason: result.reason || 'hash_match',
            ruleId: result.matchedHashId || null,
            ruleName: 'hash_match'
          }
        });
      }
    } else if (type === 'link' || type === 'file') {
      // VirusTotal moderation
      const vtResult = await scanWithVirusTotal(url);
      let policy = null;
      let detectionRatio = 0;
      if (vtResult && vtResult.attributes && vtResult.attributes.stats) {
        const malicious = vtResult.attributes.stats.malicious || 0;
        const total = Object.values(vtResult.attributes.stats).reduce((a, b) => a + b, 0);
        detectionRatio = total ? malicious / total : 0;
        policy = moderationConfig.virusTotal.detectionMutePolicy.find(p => detectionRatio >= p.min && detectionRatio < p.max);
      }
      penalty = policy ? 'mute' : 'none';

      if (!suppressLog) {
        const now = formatLogTimestamp();
        const logLine = `[${now}] LLM: получил вложение от ${userId} (тип: ${type}, ссылка: ${url}) => вывод: ${penalty}\n`;
        appendLog('llm_moderation.log', logLine);
      }

      if (policy) {
        logModerationActionStructured({
          user_id: userId,
          message_id: messageId,
          violation_type: 'VirusTotal detection',
          severity: detectionRatio,
          mute_duration: policy.muteHours,
          reason: 'VirusTotal detection',
          rule_id: null,
          rule_name: 'VirusTotal detection'
        });
        // Применяем наказание (mute)
        await applyModerationAction({
          guildId,
          channelId,
          userId,
          moderatorId: botUserId,
          violation: {
            penalty: 'mute',
            duration: policy.muteHours ? `${policy.muteHours}h` : '1h',
            reason: 'VirusTotal detection',
            ruleId: null,
            ruleName: 'VirusTotal detection'
          }
        });
      }
    }

    results.push({
      url,
      type,
      penalty,
      reason: (type === 'image' || type === 'gif') ? (result?.violationType || result?.reason) : (policy ? 'VirusTotal detection' : null),
      ruleId: (type === 'image' || type === 'gif') ? (result?.ruleId || null) : null,
      ruleName: (type === 'image' || type === 'gif') ? (result?.ruleName || result?.violationType || null) : (policy ? 'VirusTotal detection' : null)
    });
  }

  return results;
}

// ============================================================================
// Configuration
// ============================================================================

const API_BASE = process.env.ASTRA_API_BASE || 'https://astraof.com/api';
const rawGateway = process.env.ASTRA_GATEWAY_URL || 'wss://astraof.com/gateway';
const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'llama-3.1-8b-instant';

// Rate limit for Groq LLM calls (requests per second).
const GROQ_MAX_QPS = parseInt(process.env.GROQ_MAX_QPS, 10) || 5;
const GROQ_RATE_DELAY = Math.ceil(1000 / GROQ_MAX_QPS);
let groqRateTimer = null;
const groqRequestQueue = [];

function groqRateLimitedRequest(fn) {
  return new Promise((resolve, reject) => {
    groqRequestQueue.push({ fn, resolve, reject });
    processGroqQueue();
  });
}

function processGroqQueue() {
  if (groqRateTimer) return;
  if (groqRequestQueue.length === 0) return;

  const { fn, resolve, reject } = groqRequestQueue.shift();
  fn()
    .then(resolve)
    .catch(reject)
    .finally(() => {
      groqRateTimer = setTimeout(() => {
        groqRateTimer = null;
        processGroqQueue();
      }, GROQ_RATE_DELAY);
    });
}

// Limit how much message text is sent to the LLM (to avoid token bloat / latency).
const MAX_MESSAGE_CHARS = 500;

// Simple in-memory cache to avoid rerunning Groq moderation for repeated content.
// This is mainly to save tokens when the same message is sent multiple times.
const MODERATION_CACHE_TTL_MS = parseInt(process.env.MODERATION_CACHE_TTL_MS, 10) || 5 * 60 * 1000; // 5 minutes
const MODERATION_CACHE_MAX_ENTRIES = parseInt(process.env.MODERATION_CACHE_MAX_ENTRIES, 10) || 500;
const moderationCache = new Map();

const MOD_LOG_FILE = process.env.MOD_LOG_FILE || path.join(__dirname, 'moderation.log');
const DISABLED_CHANNELS_FILE = path.join(__dirname, 'disabled_channels.json');
const BOT_OWNER_ID = process.env.BOT_OWNER_ID || null;

let disabledChannels = loadDisabledChannels();

function loadDisabledChannels() {
  try {
    const content = fs.readFileSync(DISABLED_CHANNELS_FILE, 'utf8');
    const data = JSON.parse(content);
    return new Set(Array.isArray(data) ? data : []);
  } catch {
    return new Set();
  }
}

function saveDisabledChannels() {
  try {
    fs.writeFileSync(DISABLED_CHANNELS_FILE, JSON.stringify(Array.from(disabledChannels), null, 2));
  } catch (err) {
    console.error('[Config] Failed to save disabled channels:', err);
  }
}

function isModerationEnabled(channelId) {
  return !disabledChannels.has(channelId);
}

function setModerationEnabled(channelId, enabled) {
  if (!channelId) return;
  if (enabled) disabledChannels.delete(channelId);
  else disabledChannels.add(channelId);
  saveDisabledChannels();
}

const GATEWAY_URL = (() => {
  try {
    const url = new URL(rawGateway);
    if (!url.searchParams.has('version') && !url.searchParams.has('v')) url.searchParams.set('v', '1');
    if (!url.searchParams.has('encoding')) url.searchParams.set('encoding', 'json');
    return url.toString();
  } catch {
    return rawGateway;
  }
})();

let ws = null;
let heartbeatInterval = 30000;
let heartbeatTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 50;
let botUserId = null;

const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === '1';

// Track warnings / mute history in memory (for demo purposes).
// In production, persist this to a database or file.
const warnCounts = new Map();

// ============================================================================
// Helpers
// ============================================================================

// ====== RATE LIMITER из образец.js ======
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let rateLimitProcessing = false;
const rateLimitQueue = [];
const RATE_LIMIT_DELAY = 250;

async function rateLimitedRequest(fn) {
  return new Promise((resolve, reject) => {
    rateLimitQueue.push({ fn, resolve, reject });
    processRateLimitQueue();
  });
}

async function processRateLimitQueue() {
  if (rateLimitProcessing) return;
  rateLimitProcessing = true;

  while (rateLimitQueue.length > 0) {
    const { fn, resolve, reject } = rateLimitQueue.shift();
    try {
      const result = await fn();
      resolve(result);
    } catch (err) {
      if (err.response && err.response.status === 429) {
        const retryAfter = (err.response.data?.retry_after || 1) * 1000;
        console.warn(`[RateLimit] Ожидание ${retryAfter}мс...`);
        await sleep(retryAfter);
        rateLimitQueue.unshift({ fn, resolve, reject });
      } else {
        reject(err);
      }
    }
    await sleep(RATE_LIMIT_DELAY);
  }

  rateLimitProcessing = false;
}

// ====== МОДЕРАТОРСКИЕ ФУНКЦИИ ИЗ ОБРАЗЦА ======
async function banMember(guildId, userId, reason, deleteMessageDays = 0) {
  await apiPut(`/v1/guilds/${guildId}/bans/${userId}`, { delete_message_days: deleteMessageDays }, { 'X-Audit-Log-Reason': reason });
}

async function muteMember(guildId, userId, durationMs) {
  // Метод 1: Роль мута
  const muteRoleId = '1483329705134216444';
  try {
    await apiPut(`/v1/guilds/${guildId}/members/${userId}/roles/${muteRoleId}`, {});
  } catch (err) {
    if (DEBUG) console.error('[muteMember role]', err.response?.data || err.message);
    // Продолжаем, даже если роль не удалось выдать
  }

  // Метод 2: Communication disabled (timeout)
  try {
    const until = durationMs ? new Date(Date.now() + Math.min(durationMs, 28 * 24 * 3600000)).toISOString() : null;
    await apiPatch(`/v1/guilds/${guildId}/members/${userId}`, {
      communication_disabled_until: until
    });
    return true;
  } catch (err) {
    if (DEBUG) console.error('[muteMember timeout]', err.response?.data || err.message);
    // Если timeout не работает, но роль выдана — всё ок
    return true;
  }
}

function parseDurationStr(str) {
  if (!str || str === '0') return 0;
  const map = { m: 60000, h: 3600000, d: 86400000 };
  const match = str.match(/(\d+)([mhd])/);
  if (!match) return 0;
  return parseInt(match[1]) * map[match[2]];
}

// ====== ВАРНЫ (ПРОСТО В ПАМЯТИ) ======
const warns = new Map();
function addWarn(guildId, userId, authorId, reason) {
  const key = `${guildId}:${userId}`;
  if (!warns.has(key)) warns.set(key, []);
  warns.get(key).push({ ts: Date.now(), author: authorId, reason });
  return warns.get(key).length;
}

function logModerationAction(action) {
  const line = `[${new Date().toISOString()}] ${action.guildId || 'DM'} ${action.userId} ${action.type} ${action.penalty} ${action.reason}\n`;
  appendLog(MOD_LOG_FILE, line);
  if (DEBUG) console.log('[MOD LOG]', line.trim());
}

function buildPromptForGroq({ content, attachmentUrls }) {
  // Moderation rules are now loaded from moderationRules.txt
  let ruleText = '';
  try {
    ruleText = fs.readFileSync(path.join(__dirname, 'moderationRules.txt'), 'utf8').trim();
  } catch (e) {
    ruleText = 'Rules file not found.';
  }

  const attachmentText = (attachmentUrls || []).length
    ? `\n\nAttachment URLs:\n${attachmentUrls.join('\n')}`
    : '';

  return `You are a content moderation assistant. A user message is provided below. Determine whether it violates any of the moderation rules and classify it.

Moderation rules:
${ruleText}

Message content:
${content || '<empty>'}${attachmentText}

Respond with valid JSON EXACTLY in this format:
{
  "violates": true|false,
  "ruleId": number|null,
  "ruleName": string|null,
  "penalty": "none"|"warning"|"mute"|"ban",
  "duration": "0"|"15m"|"1h"|"2h"|"6h"|"24h"|"72h"|"permanent",
  "reason": string
}

If you are unsure, default to warning and indicate that the model was uncertain in the reason.`;
}

function validateModerationOutput(output) {
  const safe = {
    violates: false,
    ruleId: null,
    ruleName: null,
    penalty: 'none',
    duration: '0',
    severity: 'none',
    reason: 'Invalid model output'
  };

  if (!output || typeof output !== 'object') return safe;

  const { violates, ruleId, ruleName, penalty, duration, severity, reason } = output;

  const allowedPenalties = new Set(['none', 'warning', 'mute', 'ban']);
  const allowedDurations = new Set(['0', '15m', '1h', '2h', '6h', '24h', '72h', 'permanent']);
  const allowedSeverities = new Set(['none', 'mild', 'medium', 'severe']);

  return {
    violates: typeof violates === 'boolean' ? violates : false,
    ruleId: typeof ruleId === 'number' ? ruleId : null,
    ruleName: typeof ruleName === 'string' ? ruleName : null,
    penalty: allowedPenalties.has(penalty) ? penalty : 'none',
    duration: allowedDurations.has(duration) ? duration : '0',
    severity: allowedSeverities.has(severity) ? severity : 'none',
    reason: typeof reason === 'string' ? reason : 'Invalid model output'
  };
}

function normalizeText(text) {
  // Normalize text for moderation so that simple obfuscations like "n1gg3r" and
  // "k.y.s" are treated similarly to their plain forms.
  //
  // Preserve any letter from any script (Cyrillic, Latin, etc.) by using Unicode
  // letter property \p{L}.
  return (text || '')
    .toString()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^ -\p{L}0-9\s]/gu, '')
    // Collapse any non-space whitespace to a single space.
    .replace(/\s+/g, ' ');
}

function buildModerationCacheKey(content, attachmentUrls) {
  const normalized = normalizeText(content).trim().replace(/\s+/g, ' ');
  const attachments = (attachmentUrls || []).join('|');
  return `${normalized}||${attachments}`;
}

async function classifyContentWithGroq({ content, attachmentUrls }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set. Set it in the environment.');
  }

  const normalizedContent = normalizeText(content);

  // Cache moderation results for identical inputs (helps reduce token usage).
  const cacheKey = buildModerationCacheKey(normalizedContent, attachmentUrls);
  const now = Date.now();
  const cached = moderationCache.get(cacheKey);
  if (cached) {
    if (cached.expires > now) {
      if (DEBUG) console.log('[Cache] hit for moderation key:', cacheKey);
      return cached.value;
    }
    moderationCache.delete(cacheKey);
  }

  const prompt = buildPromptForGroq({ content: normalizedContent, attachmentUrls });

  let response;
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      response = await groqRateLimitedRequest(() => axios.post(
        `${GROQ_API_BASE}/responses`,
        {
          model: GROQ_MODEL,
          input: [
            { role: 'system', content: 'You are a helpful moderation assistant.' },
            { role: 'user', content: prompt }
          ],
          max_output_tokens: 512,
          temperature: 0.0
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      ));
      break;
    } catch (err) {
      const status = err?.response?.status;
      const isRetryable = [429, 500, 502, 503, 504].includes(status) ||
        err?.code === 'ECONNABORTED' ||
        err?.code === 'ENOTFOUND' ||
        err?.code === 'ETIMEDOUT';

      console.warn(`[Groq] request failed (attempt ${attempt}/${maxRetries})`,
        status ? `status=${status}` : '', err.message || err);

      if (attempt === maxRetries || !isRetryable) {
        console.error('[Groq] giving up after retries. Returning safe default.');
        return {
          violates: false,
          ruleId: null,
          ruleName: null,
          penalty: 'none',
          duration: '0',
          reason: 'Groq request failed'
        };
      }

      // Exponential backoff with jitter
      const backoffMs = Math.min(2000, 300 * Math.pow(2, attempt - 1));
      await sleep(backoffMs + Math.floor(Math.random() * 200));
    }
  }

  // Новый парсер для формата Groq
  let output = null;
  if (Array.isArray(response?.data?.output)) {
    // Найти объект типа 'message'
    const messageObj = response.data.output.find(o => o.type === 'message');
    if (messageObj && Array.isArray(messageObj.content) && messageObj.content[0]?.text) {
      output = messageObj.content[0].text;
    }
  }
  // Старые форматы (на всякий случай)
  if (!output) {
    output = response?.data?.output?.[0]?.content ||
      response?.data?.choices?.[0]?.message?.content ||
      response?.data?.choices?.[0]?.text;
  }
  if (!output) {
    // Dump a small slice for debugging.
    const snippet = JSON.stringify(response.data).slice(0, 1000);
    throw new Error(`Unexpected Groq response format. Response starts with: ${snippet}`);
  }
  // Парсим JSON из текста
  const jsonText = typeof output === 'string' ? output.trim() : JSON.stringify(output);
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    // Если не получилось, пробуем вытащить JSON из текста
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      console.error('Failed to parse moderation model output:', jsonText);
      throw err;
    }
  }

  const validated = validateModerationOutput(parsed);
  if (!validated.violates && parsed.violates) {
    // Если модель попыталась обойти (напр. вернула "violates": "no"), сохранить логи.
    console.warn('Moderation model output failed validation; using safe defaults.', parsed);
  }

  // Cache the result for a short time to reduce duplicate Groq calls.
  // Cache key is based on normalized content + attachment URLs.
  moderationCache.set(cacheKey, { value: validated, expires: now + MODERATION_CACHE_TTL_MS });
  if (moderationCache.size > MODERATION_CACHE_MAX_ENTRIES) {
    const firstKey = moderationCache.keys().next().value;
    moderationCache.delete(firstKey);
  }

  return validated;
}

async function classifyImageWithGroq(imageUrl, userId, messageId, guildId) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set. Set it in the environment.');
  }

  // Use the configured vision moderation rules so image moderation matches text moderation.
  const inappropriateList = (moderationConfig.visionModeration?.inappropriate || []);
  const allowedExceptionsList = (moderationConfig.visionModeration?.allowedExceptions || []);

  const inappropriate = inappropriateList
    .map((r, idx) => `${idx + 1}. ${r}`)
    .join('\n');
  const allowedExceptions = allowedExceptionsList
    .map((r, idx) => `${idx + 1}. ${r}`)
    .join('\n');

  const prompt = `You are an image moderation assistant. A user has uploaded an image. Determine whether it violates the moderation rules below (nudity, sexual content, violence, hate, etc.).\n\n` +
    `Inappropriate content categories (use the ID number in ruleId when applicable):\n${inappropriate}\n\n` +
    `Allowed exceptions (if the image matches these, do not consider it a violation):\n${allowedExceptions}\n\n` +
    `Important: If the image appears to be a screenshot, graphic, document, interface, or an image containing only numbers/letters/diagrams (no visible nudity or sexual acts), treat it as not violating. Only mark as a violation when the image clearly contains sexual content, nudity, or explicit adult acts.\n\n` +
    `Image URL: ${imageUrl}\n\nRespond with valid JSON EXACTLY in this format:\n{\n  "violates": true|false,\n  "ruleId": number|null,\n  "ruleName": string|null,\n  "penalty": "none"|"warning"|"mute"|"ban",\n  "duration": "0"|"15m"|"1h"|"2h"|"6h"|"24h"|"72h"|"permanent",\n  "severity": "none"|"mild"|"medium"|"severe",\n  "reason": string\n}\n\nIf you are unsure, default to warning and indicate that the model was uncertain in the reason.`;

  let response;
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      response = await groqRateLimitedRequest(() => axios.post(
        `${GROQ_API_BASE}/responses`,
        {
          model: GROQ_MODEL,
          input: [
            { role: 'system', content: 'You are a helpful moderation assistant.' },
            { role: 'user', content: prompt }
          ],
          max_output_tokens: 512,
          temperature: 0.0
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      ));
      break;
    } catch (err) {
      const status = err?.response?.status;
      const isRetryable = [429, 500, 502, 503, 504].includes(status) ||
        err?.code === 'ECONNABORTED' ||
        err?.code === 'ENOTFOUND' ||
        err?.code === 'ETIMEDOUT';

      console.warn(`[Groq] request failed (attempt ${attempt}/${maxRetries})`,
        status ? `status=${status}` : '', err.message || err);

      if (attempt === maxRetries || !isRetryable) {
        console.error('[Groq] giving up after retries. Returning safe default.');
        return {
          violates: false,
          ruleId: null,
          ruleName: null,
          penalty: 'none',
          duration: '0',
          reason: 'Groq image moderation request failed'
        };
      }

      const backoffMs = Math.min(2000, 300 * Math.pow(2, attempt - 1));
      await sleep(backoffMs + Math.floor(Math.random() * 200));
    }
  }

  // Parse response same as text moderation
  let output = null;
  if (Array.isArray(response?.data?.output)) {
    const messageObj = response.data.output.find(o => o.type === 'message');
    if (messageObj && Array.isArray(messageObj.content) && messageObj.content[0]?.text) {
      output = messageObj.content[0].text;
    }
  }
  if (!output) {
    output = response?.data?.output?.[0]?.content ||
      response?.data?.choices?.[0]?.message?.content ||
      response?.data?.choices?.[0]?.text;
  }
  if (!output) {
    const snippet = JSON.stringify(response.data).slice(0, 1000);
    throw new Error(`Unexpected Groq response format. Response starts with: ${snippet}`);
  }

  const jsonText = typeof output === 'string' ? output.trim() : JSON.stringify(output);
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      console.error('Failed to parse image moderation model output:', jsonText);
      throw err;
    }
  }

  const validated = validateModerationOutput(parsed);

  // If the model provided a ruleName but no ruleId, try to map it to the configured rules.
  if (validated.ruleName && !validated.ruleId) {
    const idx = inappropriateList.findIndex((r) => r.toLowerCase() === validated.ruleName.toLowerCase());
    if (idx !== -1) validated.ruleId = idx + 1;
  }

  if (!validated.violates && parsed.violates) {
    console.warn('Image moderation model output failed validation; using safe defaults.', parsed);
  }

  // Log image moderation decisions (for debugging / auditing)
  try {
    const now = formatLogTimestamp();
    const logLine = `[${now}] LLM image: guild=${guildId || 'unknown'} user=${userId} msg=${messageId} url=${imageUrl} => violates=${validated.violates} penalty=${validated.penalty} rule=${validated.ruleName || validated.ruleId} reason=${validated.reason} severity=${validated.severity}\n`;
    appendLog('llm_moderation.log', logLine);
  } catch {
    // best effort
  }

  return validated;
}


// ============================================================================
// Messaging helpers
// ============================================================================

// Удаление сообщений по списку id (bulk delete)
async function bulkDeleteMessages(channelId, messageIds) {
  if (!messageIds.length) return 0;
  try {
    await apiPost(`/channels/${channelId}/messages/bulk-delete`, { messages: messageIds });
    return messageIds.length;
  } catch {
    let deleted = 0;
    for (const id of messageIds) {
      try {
        await apiDelete(`/channels/${channelId}/messages/${id}`);
        deleted++;
      } catch (e) {
        if (DEBUG) console.error('[deleteMessage]', id, e.response?.data || e.message);
      }
    }
    return deleted;
  }
}

async function sendMessage(channelId, text, options = {}) {
  if (!channelId) return;
  return apiPost(`/channels/${channelId}/messages`, { content: text, ...options });
}

async function respondInteraction(interaction, text, ephemeral = false) {
  if (!interaction?.id || !interaction?.token) return;
  return apiPost(`/interactions/${interaction.id}/${interaction.token}/callback`, {
    type: 4,
    data: { content: text, flags: ephemeral ? 64 : 0 }
  });
}


function getDurationFromPenalty(penalty) {
  switch (penalty) {
    case 'warning':
      return '0';
    case 'mute':
      return '1h';
    case 'ban':
      return 'permanent';
    default:
      return '0';
  }
}

async function applyModerationAction({ guildId, channelId, userId, moderatorId, violation }) {
  const effectiveGuildId = guildId || globalThis.lastGuildId;
  if (!effectiveGuildId) {
    // No guild context (e.g. DM without prior guild activity). Cannot apply penalties via guild APIs.
    console.warn('[Moderation] No guildId provided (and no last known guild), skipping action.', { userId, moderatorId, violation });
    return;
  }

  // Only send notifications to a known channel. If we don't have a channelId, skip sending messages.
  const notifyChannelId = channelId || null;

  const { penalty, duration, reason, ruleId, ruleName } = violation;
  const action = {
    type: penalty,
    penalty,
    duration: duration || getDurationFromPenalty(penalty),
    reason: reason || 'Violation detected by moderator bot',
    ruleId,
    ruleName
  };

  const ruleInfo = (ruleName || ruleId)
    ? ` (правило: ${ruleName || 'n/a'}${ruleId ? ` [${ruleId}]` : ''})`
    : '';

  // Log the action
  logModerationAction({ guildId, userId, moderatorId, ...action });

  const safeSend = async (text) => {
    if (!notifyChannelId) {
      console.warn('[Moderation] No channel available to notify about action.', { guildId: effectiveGuildId, userId, moderatorId, action });
      return;
    }
    await sendMessage(notifyChannelId, text);
  };

  try {
    if (penalty === 'warning') {
      const warnCount = addWarn(effectiveGuildId, userId, moderatorId, reason);
      await safeSend(`⚠️ <@${userId}>, вы получили предупреждение: ${reason}${ruleInfo} (Всего варнов: ${warnCount})`);
      // Auto-ban after 3 warnings
      if (warnCount >= 3) {
        await banMember(effectiveGuildId, userId, 'Auto-ban: 3 warnings', 0);
        await safeSend(`⛔ <@${userId}> был автоматически забанен за 3 варна.`);
      }
    } else if (penalty === 'mute') {
      const durationMs = parseDurationStr(duration);
      const muted = await muteMember(effectiveGuildId, userId, durationMs);
      if (muted) {
        await safeSend(`🔇 <@${userId}> был замьючен на ${duration}. Причина: ${reason}${ruleInfo}`);
      } else {
        await safeSend(`❌ Не удалось замьютить <@${userId}>. Причина: ${reason}${ruleInfo}`);
      }
    } else if (penalty === 'ban') {
      await banMember(effectiveGuildId, userId, reason, 0);
      await safeSend(`⛔ <@${userId}> был забанен. Причина: ${reason}${ruleInfo}`);
    }
  } catch (err) {
    console.error('Failed to apply moderation action:', err?.response?.data || err.message || err);
  }
}

function extractAttachmentUrls(message) {
  if (!message) return [];
  // Support Astraof attachment format similar to Discord.
  if (Array.isArray(message.attachments)) {
    return message.attachments
      .map((att) => att.url || att.proxy_url || att.attachment)
      .filter(Boolean);
  }

  // Fallback: look for urls in content
  const urlRegex = /https?:\/\/[^\s]+/g;
  const found = (message.content || '').match(urlRegex);
  return found || [];
}

// ============================================================================
// Gateway
// ============================================================================

function connect() {
  console.log(`Connecting to ${GATEWAY_URL}...`);
  ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    console.log('Connected to gateway.');
    reconnectAttempts = 0;
    ws.send(
      JSON.stringify({
        op: 2,
        d: {
          token: TOKEN,
          properties: { os: 'linux', browser: 'astra-lib', device: 'astra-lib' },
          intents: 32767
        }
      })
    );
  });

  ws.on('message', async (data) => {
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }

    if (DEBUG) {
      // Log basic metadata so we can tell whether this is a guild channel or DM message.
      const meta = {
        t: payload.t,
        op: payload.op,
        guildId: payload.d?.guild_id || payload.d?.guildId,
        channelId: payload.d?.channel_id || payload.d?.channelId,
        authorId: payload.d?.author?.id,
        content: payload.d?.content
      };
      console.log('[WS metadata]', JSON.stringify(meta));
      console.log('[WS payload]', JSON.stringify(payload).slice(0, 300));
    }

    if (payload.op === 10) {
      heartbeatInterval = payload.d?.heartbeat_interval || heartbeatInterval;
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ op: 1, d: null }));
        }
      }, heartbeatInterval);
      return;
    }

    if (payload.op === 11) return;

    if (payload.t === 'READY') {
      const user = payload.d?.user;
      if (user) {
        botUserId = user.id;
        console.log(`Logged in as ${user.username} (ID: ${user.id})`);
      }
      return;
    }

    if (payload.t === 'MESSAGE_CREATE') {
      const msg = payload.d;
      if (!msg) return;

      // Ignore bot messages (including itself)
      if (msg.author?.bot) return;
      if (msg.author?.id === botUserId) return;

      handleMessage(msg).catch((err) => {
        console.error('Error handling message:', err);
      });
      return;
    }

    if (payload.t === 'INTERACTION_CREATE') {
      const interaction = payload.d;
      if (!interaction) return;
      await respondInteraction(interaction, 'Moderator bot is running.', true);
      return;
    }
  });

  ws.on('error', (err) => {
    console.error('[WS Error]', err.message);
  });

  ws.on('close', (code, reason) => {
    clearInterval(heartbeatTimer);
    console.log(`[WS Close] Code: ${code}, Reason: ${reason || 'unknown'}`);

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 60000);
      reconnectAttempts++;
      console.log(`Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})...`);
      setTimeout(connect, delay);
    } else {
      console.error('Max reconnect attempts reached.');
    }
  });
}

// ============================================================================
// Message Handling
// ============================================================================

async function handleMessage(msg) {
  const channelId = msg.channel_id || msg.channelId;
  const guildId = msg.guild_id || msg.guildId;
  const userId = msg.author?.id;
  const messageId = msg.id;
  const text = msg.content || '';
  const attachmentUrls = extractAttachmentUrls(msg);

  // Remember last guild seen; allow applying moderation actions for DMs if we have a guild context.
  if (guildId) globalThis.lastGuildId = guildId;

  const trimmed = text.trim();
  const isModCommand = trimmed.toLowerCase().startsWith('!mod');
  const normalizedText = normalizeText(trimmed);

  // Allow enabling/disabling moderation per channel via command (bot owner only)
  if (isModCommand) {
    const parts = trimmed.split(/\s+/);
    const action = (parts[1] || '').toLowerCase();
    if (BOT_OWNER_ID && userId !== BOT_OWNER_ID) {
      await sendMessage(channelId, 'Only the bot owner can change moderation settings.');
      return;
    }

    if (action === 'off' || action === 'disable') {
      setModerationEnabled(channelId, false);
      await sendMessage(channelId, '🔕 Модерация в этом канале отключена.');
      return;
    }
    if (action === 'on' || action === 'enable') {
      setModerationEnabled(channelId, true);
      await sendMessage(channelId, '🔔 Модерация в этом канале включена.');
      return;
    }
    if (action === 'status') {
      await sendMessage(channelId, `Модерация в этом канале ${isModerationEnabled(channelId) ? 'включена' : 'отключена'}.`);
      return;
    }

    await sendMessage(channelId, 'Команды: `!mod off`, `!mod on`, `!mod status`.');
    return;
  }

  // If moderation is disabled for this channel, do not run any checks.
  if (!isModerationEnabled(channelId)) return;

  const hasText = Boolean(trimmed);
  const hasAttachments = attachmentUrls.length > 0;

    // --- Perceptual hash moderation (pHash/dHash) ---
    if (hasAttachments) {
      const { getPHash, getDHash } = require('./moderation/hashUtils');
      const { checkImageHashes } = require('./moderation/bannedHashes');
      for (const att of msg.attachments || []) {
        const url = att.url || att.proxy_url;
        const contentType = att.content_type || '';
        const ext = (url || '').split('.').pop().toLowerCase();
        if (
          (contentType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) && url
        ) {
          try {
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
            if (!response || response.status !== 200) continue;
            const buffer = Buffer.from(response.data);
            const phash = await getPHash(buffer);
            const dhash = await getDHash(buffer);
            const result = await checkImageHashes(phash, dhash);
            if (result.banned) {
              await apiDelete(`/channels/${channelId}/messages/${messageId}`);
              appendLog('llm_moderation.log', `[${formatLogTimestamp()}] Забанено изображение: ${result.reason}, distance: ${result.distance}, user: ${userId}, msg: ${messageId}\n`);
              // Optionally: ban user or send log to mod channel
              break;
            } else if (result.distance && result.distance <= 14) {
              appendLog('llm_moderation.log', `[${formatLogTimestamp()}] Suspicious image: ${result.reason}, distance: ${result.distance}, user: ${userId}, msg: ${messageId}\n`);
            }
          } catch (err) {
            appendLog('llm_moderation.log', `[${formatLogTimestamp()}] Error hashing image: ${err.message}, url: ${url}, user: ${userId}, msg: ${messageId}\n`);
          }
        }
      }
    }

  // Truncate overly long messages to avoid token bloat / latency in the LLM request.
  const truncatedText = normalizedText.length > MAX_MESSAGE_CHARS
    ? normalizedText.slice(0, MAX_MESSAGE_CHARS)
    : normalizedText;
  const textForModeration = hasText ? truncatedText : '';

  // --- Text moderation (if there is any text) ---
  let textResult = null;
  if (hasText) {
    textResult = await classifyContentWithGroq({ content: textForModeration, attachmentUrls });
    if (textResult.violates) {
      await applyModerationAction({
        guildId,
        channelId,
        userId,
        moderatorId: botUserId,
        violation: {
          penalty: textResult.penalty || 'warning',
          duration: textResult.duration || '0',
          reason: textResult.reason || 'Text moderation violation',
          ruleId: textResult.ruleId || null,
          ruleName: textResult.ruleName || null
        }
      });
    }
  }

  // --- Attachment moderation (always run if attachments exist) ---
  const attachmentResults = hasAttachments
    ? await moderateMessagePipeline({ guildId, channelId, userId, messageId, attachmentUrls, suppressLog: true })
    : [];

  // --- Single log entry per message ---
  if (hasText || hasAttachments) {
    const now = formatLogTimestamp();

    const attachTypes = attachmentResults.map(r => r.type || 'unknown').join(', ');
    const attachList = attachmentResults.map(r => r.url).join(', ');

    const displayText = textForModeration.length < text.length
      ? `${textForModeration}…`
      : textForModeration;

    const penalties = [];
    if (textResult && textResult.penalty && textResult.penalty !== 'none') penalties.push(textResult.penalty);
    for (const r of attachmentResults) {
      if (r.penalty && r.penalty !== 'none') penalties.push(r.penalty);
    }
    const overallPenalty = penalties.includes('ban')
      ? 'ban'
      : penalties.includes('mute')
        ? 'mute'
        : penalties.includes('warning')
          ? 'warning'
          : 'none';

    const details = [];
    if (textResult && textResult.violates) {
      details.push(`text: ${textResult.reason || 'n/a'} (ruleId:${textResult.ruleId || 'n/a'} ruleName:${textResult.ruleName || 'n/a'})`);
    }
    for (const r of attachmentResults) {
      if (r.penalty && r.penalty !== 'none') {
        details.push(`attachment(${r.type || 'unknown'}): ${r.reason || 'n/a'} (ruleId:${r.ruleId || 'n/a'} ruleName:${r.ruleName || 'n/a'})`);
      }
    }
    const detailsStr = details.length ? ` | ${details.join(' ; ')}` : '';

    let logLine;
    if (hasAttachments && hasText) {
      logLine = `[${now}] LLM: guild=${guildId} получил сообщение от ${userId} с текстом: "${displayText.replace(/\n/g, ' ')}" (вложения: типы=[${attachTypes}], ссылки=[${attachList}]) => вывод: ${overallPenalty}${detailsStr}\n`;
    } else if (hasAttachments) {
      logLine = `[${now}] LLM: guild=${guildId} получил вложение от ${userId} (тип(ы): [${attachTypes}], ссылки: [${attachList}]) => вывод: ${overallPenalty}${detailsStr}\n`;
    } else {
      logLine = `[${now}] LLM: guild=${guildId} получил сообщение от ${userId} с текстом: "${displayText.replace(/\n/g, ' ')}" (нет вложений) => вывод: ${overallPenalty}${detailsStr}\n`;
    }

    appendLog('llm_moderation.log', logLine);
  }
}

// ============================================================================
// API utilities
// ============================================================================

// ====== API HELPERS из образец.js ======
function apiHeaders() {
    return {
        'Authorization': `Bot ${TOKEN}`,
        'Origin': 'https://astraof.com',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
}

async function apiGet(url) {
    return rateLimitedRequest(() => axios.get(`${API_BASE}${url}`, { headers: apiHeaders() }));
}

async function apiPost(url, data = {}) {
    return rateLimitedRequest(() => axios.post(`${API_BASE}${url}`, data, { headers: apiHeaders() }));
}

async function apiPatch(url, data = {}) {
    return rateLimitedRequest(() => axios.patch(`${API_BASE}${url}`, data, { headers: apiHeaders() }));
}

async function apiDelete(url, data = null) {
    const cfg = { headers: apiHeaders() };
    if (data) cfg.data = data;
    return rateLimitedRequest(() => axios.delete(`${API_BASE}${url}`, cfg));
}

async function apiPut(url, data = {}) {
    return rateLimitedRequest(() => axios.put(`${API_BASE}${url}`, data, { headers: apiHeaders() }));
}

// ============================================================================
// Startup
// ============================================================================

function startBot() {
  console.log('=======================================');
  console.log('  Astraof Moderator Bot — starting...');
  console.log(`  API: ${API_BASE}`);
  console.log(`  Gateway: ${GATEWAY_URL}`);
  console.log(`  Groq API: ${GROQ_API_BASE}`);
  console.log(`  Groq Model: ${GROQ_MODEL}`);
  console.log(`  Debug: ${DEBUG ? 'ON' : 'OFF'}`);
  console.log('=======================================');

  connect();
}

function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down...`);
  clearInterval(heartbeatTimer);
  if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, 'Shutdown');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

let TOKEN = process.env.BOT_TOKEN || process.env.TOKEN;

if (!TOKEN) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl.question('Enter bot token: ', (inputToken) => {
    if (!inputToken) {
      console.error('Token not provided.');
      process.exit(1);
    }
    rl.close();
    TOKEN = inputToken;
    startBot();
  });
} else {
  startBot();
}
