const fs = require('fs');
const path = require('path');
const https = require('https');
const WebSocket = require('ws');
const axios = require('axios');

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТКА ОШИБОК
// ═══════════════════════════════════════════════════════════════

process.on('unhandledRejection', (reason) => console.error('[UnhandledRejection]', reason));
process.on('uncaughtException', (err) => console.error('[UncaughtException]', err));

// ═══════════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЕ ДАННЫЕ
// ═══════════════════════════════════════════════════════════════

const russianJokes = [
    'Почему программисты путают Хэллоуин и Рождество? Потому что 31 OCT = 25 DEC.',
    'Объявление: Требуется программист. Зарплата — как в сказке: чем дальше, тем страшнее.',
    'Баг — это не ошибка, это неожиданная особенность.',
    '99 маленьких багов в коде, 99 багов в коде... Исправил один, стало 127 багов в коде.',
    'Самый страшный баг — тот, который исчезает, когда ты пытаешься его показать.',
    'Почему компьютер был холодным? Потому что он оставил свои окна открытыми.',
    'Сломался интернет — программист пошёл пить чай. Чайник тоже не работает.',
    '— Почему ты не спишь ночью? — Дебажу.',
    'Лучший способ ускорить компьютер — выбросить его в окно.',
    'Всё работает — не трогай!',
    'Программист заходит в бар и заказывает 1 пиво, 2 пива, 0 пива, -1 пиво, 999999 пива, NULL пива.',
    'Жена программиста послала его в магазин: «Купи батон, если будут яйца — возьми десяток». Вернулся с 10 батонами.',
    '— Дорогой, почини кран. — Я что, сантехник? — А компьютер починить? — Ну, я же программист!',
    'Заходит программист в лифт, а там — баг.',
    'Программист — единственный человек, который может 8 часов искать баг, а потом найти его в комментарии.',
    'Два программиста идут по улице. Один говорит: «Давай перейдём на другую сторону?» — «Зачем? Там то же самое.»',
    'Жизнь программиста: пишешь код → тестируешь → плачешь → повторяешь.',
    'Программист на вопрос «Стакан наполовину пуст или полон?» отвечает: «Буфер в два раза больше, чем нужно.»',
    'Программист — единственный человек, который считает до 1023 на пальцах.',
    'Зачем программисту очки? Потому что он не видит C#.'
];

const russianFacts = [
    'Самый длинный в мире поезд был длиной 7,353 км и состоял из 682 вагонов.',
    'В теле человека бактерий больше, чем клеток.',
    'Молния может ударить в одно и то же место дважды.',
    'Пингвины — единственные птицы, которые могут плавать, но не могут летать.',
    'Самая высокая температура, когда-либо зарегистрированная на Земле, составила 56,7°C.',
    'В Антарктиде есть только один торговый центр.',
    'У улитки три сердца.',
    'В Японии есть остров, населённый только кроликами.',
    'Самая большая снежинка была диаметром 38 см.',
    'В России больше всего озёр в мире.',
    'Мёд никогда не портится — археологи находили мёд в египетских гробницах, который был пригоден для еды.',
    'Осьминог имеет три сердца и голубую кровь.',
    'Человек за свою жизнь проходит расстояние, равное пяти экваторам Земли.',
    'Бананы — это ягоды, а клубника — нет.',
    'На Юпитере идут алмазные дожди.',
    'Средний человек за жизнь проходит расстояние, равное 3 кругосветным путешествиям.',
    'Сердце синего кита весит около 600 кг.',
    'На Земле больше деревьев, чем звёзд в Млечном Пути.',
    'Каждую секунду в Google делается более 100 000 запросов.',
    'Отпечатки пальцев коалы практически неотличимы от человеческих.'
];

const quotes = [
    'Не ошибается тот, кто ничего не делает. — Теодор Рузвельт',
    'Лучше сделать и пожалеть, чем не сделать и пожалеть. — Джованни Боккаччо',
    'Путь в тысячу ли начинается с одного шага. — Лао-цзы',
    'Великие дела начинаются с малого. — Конфуций',
    'Терпение и труд всё перетрут. — Русская пословица',
    'Будь собой; прочие роли уже заняты. — Оскар Уайльд',
    'Знание — сила. — Фрэнсис Бэкон',
    'Единственный способ делать великую работу — любить то, что делаешь. — Стив Джобс',
    'Жизнь — это то, что происходит с тобой, пока ты строишь другие планы. — Джон Леннон',
    'Никогда не поздно стать тем, кем ты мог бы быть. — Джордж Элиот',
    'Успех — это умение двигаться от неудачи к неудаче, не теряя энтузиазма. — Уинстон Черчилль',
    'Будущее принадлежит тем, кто верит в красоту своей мечты. — Элеонора Рузвельт',
    'Не бойся медленного движения, бойся стоять на месте. — Китайская пословица',
    'Делай то, что можешь, тем, что имеешь, там, где находишься. — Теодор Рузвельт',
    'Каждый удар мастера когда-то был ударом новичка. — Ральф Эмерсон'
];

const eightBallAnswers = [
    '✅ Безусловно да', '✅ Определённо да', '✅ Без сомнения',
    '🤔 Скорее всего да', '🤔 Перспективы хорошие', '🤔 Знаки говорят: да',
    '😐 Ответ туманен', '😐 Спроси позже', '😐 Лучше не рассказывать',
    '❌ Не рассчитывай на это', '❌ Мой ответ — нет', '❌ Весьма сомнительно',
    '💀 Абсолютно нет', '🤷 Кто знает?', '✨ Возможно!'
];

const funEmojis = ['😀','😂','😎','😍','🤔','😇','🥳','😱','😜','🤖','👾','🎉','🔥','🌈','🍀','🍕','🚀','⚡','💎','🎵','🦄','🐉','🌸','🎭','🏆','❤️','🌍','🎪','🎯','🎸'];

const compliments = [
    'Ты потрясающий человек! ✨',
    'С тобой мир становится лучше! 🌟',
    'Ты умнее, чем думаешь! 🧠',
    'У тебя отличное чувство юмора! 😄',
    'Ты вдохновляешь окружающих! 🌈',
    'Ты настоящая звезда! ⭐',
    'Твоя улыбка заразительна! 😊',
    'Ты делаешь этот сервер лучше! 💫',
    'Ты способен на великие дела! 🏆',
    'Ты невероятно крутой! 🔥'
];

const roasts = [
    'Ты настолько медленный, что даже улитки тебе сочувствуют. 🐌',
    'Если бы тупость была олимпийским видом спорта, ты бы взял золото. 🥇',
    'Ты как облако — когда исчезаешь, день становится лучше. ☁️',
    'Твой IQ меньше, чем количество пальцев на руке. 🖐️',
    'Ты как закладка в учебнике — никому не нужен, но все делают вид, что полезен. 📖',
    'Ты настолько скучный, что даже овцы не могут заснуть, считая тебя. 🐑',
    'Если бы я хотел покончить с собой, я бы забрался на уровень твоего ЧСВ и спрыгнул на уровень твоего IQ. 📉',
    'Ты не бесполезен — ты можешь служить плохим примером. 😏'
];

// ═══════════════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════════════════════

const API_BASE = process.env.ASTRAL_API_BASE || 'https://astraof.com/api';
const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
let PREFIX = process.env.BOT_PREFIX || '!';

const ECONOMY_FILE = path.join(__dirname, 'economy.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const SHOP_FILE = path.join(__dirname, 'shop.json');
const LEVELS_FILE = path.join(__dirname, 'levels.json');
const LOG_FILE = path.join(__dirname, 'modlog.json');

let economy = { global: {}, guilds: {} };
let config = {};
let shop = {};
let levels = {};
let modLogs = {};

// Антиспам
const spamTracker = new Map();
const SPAM_THRESHOLD = 5;
const SPAM_INTERVAL = 5000;
const SPAM_MUTE_DURATION = 180000; // 3 минуты!

// Rate limiter
const rateLimitQueue = [];
let rateLimitProcessing = false;
const RATE_LIMIT_DELAY = 250;

// Активные мьюты (для автоснятия)
const activeMutes = new Map();

// Напоминания и голосования
const reminders = [];
const activePolls = new Map();
const activeGiveaways = new Map();

// WebSocket
const rawGateway = process.env.ASTRAL_GATEWAY_URL || 'wss://astraof.com/gateway';
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
let botStartTime = Date.now();

// ═══════════════════════════════════════════════════════════════
// УТИЛИТЫ ЗАГРУЗКИ / СОХРАНЕНИЯ
// ═══════════════════════════════════════════════════════════════

function loadJsonFile(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return data || defaultValue;
        }
    } catch (err) {
        console.error(`Ошибка чтения ${filePath}:`, err.message);
    }
    return defaultValue;
}

function saveJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error(`Ошибка записи ${filePath}:`, err.message);
    }
}

function loadEconomy() {
    const raw = loadJsonFile(ECONOMY_FILE, {});
    if (raw && typeof raw === 'object' && (raw.global || raw.guilds)) {
        economy = { global: raw.global || {}, guilds: raw.guilds || {} };
    } else {
        economy = { global: raw || {}, guilds: {} };
    }
    if (!economy.global) economy.global = {};
    if (!economy.guilds) economy.guilds = {};
}

function saveEconomy() { saveJsonFile(ECONOMY_FILE, economy); }

function getDefaultConfig() {
    return {
        mods: { global: [] },
        automod: {},
        welcomeChannels: {},
        logChannels: {},
        muteRole: {},
        adminRoles: {},
        prefixes: {},
        autoRoles: {},
        levelUpMessages: {},
        disabledCommands: {},
        customCommands: {},
        antilink: {},
        maxWarnsAction: {},
        welcomeMessages: {},
        leaveChannels: {},
        leaveMessages: {}
    };
}

function loadConfig() {
    config = loadJsonFile(CONFIG_FILE, getDefaultConfig());
    // Миграция старого формата
    if (Array.isArray(config.mods)) {
        config.mods = { global: config.mods };
    }
    // Гарантируем все поля
    const def = getDefaultConfig();
    for (const key of Object.keys(def)) {
        if (config[key] === undefined || config[key] === null) {
            config[key] = def[key];
        }
    }
    if (!config.mods || typeof config.mods !== 'object') config.mods = { global: [] };
    if (!Array.isArray(config.mods.global)) config.mods.global = [];
}

function saveConfig() { saveJsonFile(CONFIG_FILE, config); }

function loadShop() { shop = loadJsonFile(SHOP_FILE, {}); }
function saveShop() { saveJsonFile(SHOP_FILE, shop); }

function loadLevels() { levels = loadJsonFile(LEVELS_FILE, {}); }
function saveLevels() { saveJsonFile(LEVELS_FILE, levels); }

function loadModLogs() { modLogs = loadJsonFile(LOG_FILE, {}); }
function saveModLogs() { saveJsonFile(LOG_FILE, modLogs); }

// Загрузка при старте
loadEconomy();
loadConfig();
loadShop();
loadLevels();
loadModLogs();

// ═══════════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

// ═══════════════════════════════════════════════════════════════
// API ХЕЛПЕРЫ
// ═══════════════════════════════════════════════════════════════

let TOKEN;

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

// ═══════════════════════════════════════════════════════════════
// УТИЛИТЫ ПАРСИНГА
// ═══════════════════════════════════════════════════════════════

function extractUserId(arg) {
    if (!arg) return null;
    const match = arg.match(/<@!?(\d+)>/);
    if (match) return match[1];
    if (/^\d+$/.test(arg)) return arg;
    return null;
}

function extractChannelId(arg) {
    if (!arg) return null;
    const match = arg.match(/<#(\d+)>/);
    if (match) return match[1];
    if (/^\d+$/.test(arg)) return arg;
    return null;
}

function extractRoleId(arg) {
    if (!arg) return null;
    const match = arg.match(/<@&(\d+)>/);
    if (match) return match[1];
    if (/^\d+$/.test(arg)) return arg;
    return null;
}

function sanitizeChannelName(name) {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9а-яё_-]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 90);
}

function parsePermissions(perms) {
    if (typeof perms === 'bigint') return perms;
    if (typeof perms === 'number' && Number.isFinite(perms)) return BigInt(perms);
    if (typeof perms === 'string' && /^\d+$/.test(perms)) return BigInt(perms);
    return null;
}

function formatDuration(ms) {
    if (ms < 0) ms = 0;
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (60 * 1000)) % 60;
    const hours = Math.floor(ms / (60 * 60 * 1000)) % 24;
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const parts = [];
    if (days > 0) parts.push(`${days}д`);
    if (hours > 0) parts.push(`${hours}ч`);
    if (minutes > 0) parts.push(`${minutes}м`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}с`);
    return parts.join(' ');
}

function parseDuration(str) {
    if (!str) return null;
    let total = 0;
    const regex = /(\d+)\s*(д|день|дн\w*|d|h|ч|час\w*|м|мин\w*|m|с|сек\w*|s)/gi;
    let match;
    while ((match = regex.exec(str)) !== null) {
        const val = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        if (unit.startsWith('д') || unit === 'd') total += val * 86400000;
        else if (unit.startsWith('ч') || unit === 'h') total += val * 3600000;
        else if (unit.startsWith('м') || unit === 'm') total += val * 60000;
        else if (unit.startsWith('с') || unit === 's') total += val * 1000;
    }
    if (total === 0) {
        const num = parseInt(str);
        if (!isNaN(num) && num > 0) total = num * 60000; // по умолчанию минуты
    }
    return total > 0 ? total : null;
}

function getGuildPrefix(guildId) {
    return (guildId && config.prefixes?.[guildId]) || PREFIX;
}

function createProgressBar(current, max, length = 10) {
    const filled = Math.round((current / max) * length);
    const empty = length - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty) + ` (${Math.round((current / max) * 100)}%)`;
}

function randomFromArray(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ═══════════════════════════════════════════════════════════════
// КЕШИ С TTL
// ═══════════════════════════════════════════════════════════════

class TTLCache {
    constructor(ttl = 300000) {
        this.cache = new Map();
        this.ttl = ttl;
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        if (Date.now() - entry.time > this.ttl) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value) {
        this.cache.set(key, { value, time: Date.now() });
    }
    has(key) { return this.get(key) !== undefined; }
    delete(key) { this.cache.delete(key); }
    clear() { this.cache.clear(); }
}

const guildOwnerCache = new TTLCache(600000);
const guildRolesCache = new TTLCache(300000);
const guildMembersCache = new TTLCache(120000);
const guildInfoCache = new TTLCache(300000);
const dmChannelCache = new TTLCache(3600000);

// ═══════════════════════════════════════════════════════════════
// FETCH ХЕЛПЕРЫ
// ═══════════════════════════════════════════════════════════════

async function fetchGuildOwner(guildId) {
    if (!guildId) return null;
    const cached = guildOwnerCache.get(guildId);
    if (cached) return cached;
    try {
        const res = await apiGet(`/guilds/${guildId}`);
        const data = res.data || {};
        const ownerId = data.owner_id || data.ownerId || data.owner?.id;
        if (ownerId) {
            guildOwnerCache.set(guildId, ownerId);
            return ownerId;
        }
    } catch (err) {
        if (DEBUG) console.error('[fetchGuildOwner]', err.response?.data || err.message);
    }
    return null;
}

async function fetchGuildRoles(guildId) {
    if (!guildId) return new Map();
    const cached = guildRolesCache.get(guildId);
    if (cached) return cached;
    try {
        const res = await apiGet(`/guilds/${guildId}/roles`);
        const roles = Array.isArray(res.data) ? res.data : [];
        const map = new Map();
        roles.forEach(r => { if (r && r.id) map.set(r.id, r); });
        guildRolesCache.set(guildId, map);
        return map;
    } catch (err) {
        if (DEBUG) console.error('[fetchGuildRoles]', err.response?.data || err.message);
        return new Map();
    }
}

async function fetchGuildMemberIds(guildId) {
    if (!guildId) return [];
    const cached = guildMembersCache.get(guildId);
    if (cached) return cached;
    try {
        const res = await apiGet(`/guilds/${guildId}/members?limit=1000`);
        const members = Array.isArray(res.data) ? res.data : [];
        const ids = members.map(m => m.user?.id).filter(Boolean);
        guildMembersCache.set(guildId, ids);
        return ids;
    } catch (err) {
        if (DEBUG) console.error('[fetchGuildMemberIds]', err.response?.data || err.message);
        return [];
    }
}

async function fetchGuildChannels(guildId) {
    if (!guildId) return [];
    try {
        const res = await apiGet(`/guilds/${guildId}/channels`);
        return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
        if (DEBUG) console.error('[fetchGuildChannels]', err.response?.data || err.message);
        return [];
    }
}

async function fetchGuildInfo(guildId) {
    if (!guildId) return null;
    const cached = guildInfoCache.get(guildId);
    if (cached) return cached;
    try {
        const res = await apiGet(`/guilds/${guildId}`);
        guildInfoCache.set(guildId, res.data);
        return res.data;
    } catch (err) {
        if (DEBUG) console.error('[fetchGuildInfo]', err.response?.data || err.message);
        return null;
    }
}

async function fetchMember(guildId, userId) {
    if (!guildId || !userId) return null;
    try {
        const res = await apiGet(`/guilds/${guildId}/members/${userId}`);
        return res.data;
    } catch (err) {
        if (DEBUG) console.error('[fetchMember]', err.response?.data || err.message);
        return null;
    }
}

async function fetchUser(userId) {
    if (!userId) return null;
    try {
        const res = await apiGet(`/users/${userId}`);
        return res.data;
    } catch (err) {
        if (DEBUG) console.error('[fetchUser]', err.response?.data || err.message);
        return null;
    }
}

function formatChannelList(channels) {
    if (!Array.isArray(channels) || channels.length === 0) return 'Каналов не найдено.';
    const typeNames = { 0: '💬 текстовый', 2: '🔊 голосовой', 4: '📁 категория', 5: '📰 новости', 13: '🎤 сцена' };
    const list = channels
        .filter(c => c && c.id && c.name)
        .slice(0, 30)
        .map(c => {
            const typeName = typeNames[c.type] || `тип ${c.type}`;
            return `• <#${c.id}> — ${c.name} (${typeName})`;
        })
        .join('\n');
    const extra = channels.length > 30 ? `\n...ещё ${channels.length - 30} каналов` : '';
    return `${list}${extra}`;
}

// ═══════════════════════════════════════════════════════════════
// МОДЕРАТОРЫ И ПРАВА
// ═══════════════════════════════════════════════════════════════

function getMods(guildId) {
    const envMods = (process.env.MOD_IDS || '').split(',').filter(Boolean);
    const globalMods = Array.isArray(config.mods?.global) ? config.mods.global : [];
    const guildMods = guildId && Array.isArray(config.mods?.[guildId]) ? config.mods[guildId] : [];
    return [...new Set([...globalMods, ...guildMods, ...envMods])];
}

function addMod(userId, guildId) {
    if (!config.mods || typeof config.mods !== 'object') config.mods = { global: [] };
    const key = guildId || 'global';
    if (!Array.isArray(config.mods[key])) config.mods[key] = [];
    if (!config.mods[key].includes(userId)) {
        config.mods[key].push(userId);
        saveConfig();
    }
}

function removeMod(userId, guildId) {
    if (!config.mods || typeof config.mods !== 'object') config.mods = { global: [] };
    const key = guildId || 'global';
    if (!Array.isArray(config.mods[key])) config.mods[key] = [];
    config.mods[key] = config.mods[key].filter(id => id !== userId);
    saveConfig();
}

async function isModerator(msg) {
    const userId = msg?.author?.id;
    if (!userId) return false;

    const guildId = msg?.guild_id || msg?.guildId;

    // Проверяем список модераторов
    const mods = getMods(guildId);
    if (mods.includes(userId)) return true;

    // Проверяем владельца сервера
    if (guildId) {
        const ownerId = await fetchGuildOwner(guildId);
        if (ownerId && ownerId === userId) return true;
    }

    const member = msg.member;
    if (member) {
        // Проверка через permissions (object)
        if (member.permissions && typeof member.permissions === 'object') {
            if (member.permissions.administrator === true || member.permissions.ADMINISTRATOR === true) return true;
        }

        // Проверка через permissions (bigint/string)
        const bits = parsePermissions(member.permissions);
        if (bits !== null && (bits & 0x8n)) return true;

        // Проверка через массив permissions
        if (Array.isArray(member.permissions) && (member.permissions.includes('ADMINISTRATOR') || member.permissions.includes('ADMIN'))) return true;

        // Проверка через admin roles
        const adminRoles = config.adminRoles?.[guildId] || [];
        const envAdminRoles = (process.env.ADMIN_ROLE_IDS || '').split(',').filter(Boolean);
        const allAdminRoles = [...adminRoles, ...envAdminRoles];

        if (allAdminRoles.length && Array.isArray(member.roles)) {
            if (member.roles.some(r => allAdminRoles.includes(String(r)))) return true;
        }
    }

    return false;
}

async function isOwner(msg) {
    const userId = msg?.author?.id;
    const guildId = msg?.guild_id || msg?.guildId;
    if (!userId || !guildId) return false;
    const ownerId = await fetchGuildOwner(guildId);
    return ownerId && ownerId === userId;
}

// ═══════════════════════════════════════════════════════════════
// ЭКОНОМИКА
// ═══════════════════════════════════════════════════════════════

function getEconomyContainer(guildId) {
    if (!economy.global) economy.global = {};
    if (!economy.guilds) economy.guilds = {};
    if (!guildId) return economy.global;
    if (!economy.guilds[guildId]) economy.guilds[guildId] = {};
    return economy.guilds[guildId];
}

function ensureUser(guildId, userId) {
    const container = getEconomyContainer(guildId);
    if (!container[userId] || typeof container[userId] === 'number') {
        const bal = typeof container[userId] === 'number' ? container[userId] : 0;
        container[userId] = {
            balance: bal, bonusLast: 0, warns: [], xp: 0, level: 0,
            totalMessages: 0, streak: 0, inventory: [], reputation: 0
        };
    }
    const user = container[userId];
    if (typeof user.balance !== 'number') user.balance = Number(user.balance) || 0;
    user.bonusLast = Number(user.bonusLast) || 0;
    if (!Array.isArray(user.warns)) user.warns = [];
    if (typeof user.xp !== 'number') user.xp = 0;
    if (typeof user.level !== 'number') user.level = 0;
    if (typeof user.totalMessages !== 'number') user.totalMessages = 0;
    if (typeof user.streak !== 'number') user.streak = 0;
    if (!Array.isArray(user.inventory)) user.inventory = [];
    if (typeof user.reputation !== 'number') user.reputation = 0;
    return user;
}

function getBalance(guildId, userId) { return ensureUser(guildId, userId).balance; }

function setBalance(guildId, userId, amount) {
    const user = ensureUser(guildId, userId);
    user.balance = Math.max(0, Math.floor(amount));
    saveEconomy();
    return user.balance;
}

function changeBalance(guildId, userId, amount) {
    const user = ensureUser(guildId, userId);
    user.balance = Math.max(0, Math.floor(user.balance + amount));
    saveEconomy();
    return user.balance;
}

function getBonusLast(guildId, userId) { return ensureUser(guildId, userId).bonusLast; }

function setBonusLast(guildId, userId, timestamp) {
    ensureUser(guildId, userId).bonusLast = timestamp;
    saveEconomy();
}

// ═══════════════════════════════════════════════════════════════
// ПРЕДУПРЕЖДЕНИЯ
// ═══════════════════════════════════════════════════════════════

function addWarn(guildId, userId, authorId, reason) {
    const user = ensureUser(guildId, userId);
    const warn = { id: Date.now().toString(36), timestamp: Date.now(), author: authorId, reason: reason || 'Не указана' };
    user.warns.push(warn);
    saveEconomy();
    return { warn, total: user.warns.length };
}

function getWarns(guildId, userId) { return ensureUser(guildId, userId).warns; }

function clearWarns(guildId, userId) {
    ensureUser(guildId, userId).warns = [];
    saveEconomy();
}

function removeWarn(guildId, userId, index) {
    const user = ensureUser(guildId, userId);
    if (index < 0 || index >= user.warns.length) return false;
    user.warns.splice(index, 1);
    saveEconomy();
    return true;
}

// ═══════════════════════════════════════════════════════════════
// УРОВНИ И ОПЫТ
// ═══════════════════════════════════════════════════════════════

function xpForLevel(level) { return Math.floor(100 * Math.pow(1.5, level)); }

function addXp(guildId, userId, amount = null) {
    const user = ensureUser(guildId, userId);
    const xpGain = amount || (Math.floor(Math.random() * 15) + 5);
    user.xp += xpGain;
    user.totalMessages++;

    let leveledUp = false;
    while (user.xp >= xpForLevel(user.level)) {
        user.xp -= xpForLevel(user.level);
        user.level++;
        leveledUp = true;
    }

    saveEconomy();
    return { leveledUp, level: user.level, xp: user.xp, needed: xpForLevel(user.level) };
}

function getUserLevel(guildId, userId) {
    const user = ensureUser(guildId, userId);
    return { level: user.level, xp: user.xp, needed: xpForLevel(user.level), totalMessages: user.totalMessages };
}

// ═══════════════════════════════════════════════════════════════
// МАГАЗИН
// ═══════════════════════════════════════════════════════════════

function getShop(guildId) {
    if (!guildId) return [];
    if (!shop[guildId]) shop[guildId] = [];
    return shop[guildId];
}

function addShopItem(guildId, item) {
    if (!shop[guildId]) shop[guildId] = [];
    item.id = Date.now().toString(36);
    shop[guildId].push(item);
    saveShop();
    return item;
}

function removeShopItem(guildId, itemId) {
    if (!shop[guildId]) return false;
    const idx = shop[guildId].findIndex(i => i.id === itemId);
    if (idx === -1) return false;
    shop[guildId].splice(idx, 1);
    saveShop();
    return true;
}

// ═══════════════════════════════════════════════════════════════
// ЛОГИРОВАНИЕ МОДЕРАЦИИ
// ═══════════════════════════════════════════════════════════════

function addModLog(guildId, entry) {
    if (!modLogs[guildId]) modLogs[guildId] = [];
    entry.timestamp = Date.now();
    entry.id = Date.now().toString(36);
    modLogs[guildId].push(entry);
    if (modLogs[guildId].length > 1000) modLogs[guildId] = modLogs[guildId].slice(-500);
    saveModLogs();
}

function getModLogs(guildId, count = 10) {
    if (!modLogs[guildId]) return [];
    return modLogs[guildId].slice(-count);
}

async function logModAction(guildId, action, moderatorId, targetId, reason) {
    addModLog(guildId, { action, moderator: moderatorId, target: targetId, reason });

    const logChannelId = config.logChannels?.[guildId];
    if (logChannelId) {
        const text = `📋 **${action}**\n👮 Модератор: <@${moderatorId}>\n🎯 Цель: <@${targetId}>\n📝 Причина: ${reason || 'Не указана'}\n🕐 Время: ${new Date().toLocaleString('ru-RU')}`;
        await sendMessage(logChannelId, text).catch(() => {});
    }
}

// ═══════════════════════════════════════════════════════════════
// АНТИСПАМ (ИСПРАВЛЕННЫЙ)
// ═══════════════════════════════════════════════════════════════

function checkSpam(userId, guildId) {
    if (!config.automod?.[guildId]?.antispam) return false;
    const key = `${guildId}:${userId}`;
    const now = Date.now();
    let timestamps = spamTracker.get(key) || [];
    timestamps = timestamps.filter(t => now - t < SPAM_INTERVAL);
    timestamps.push(now);
    spamTracker.set(key, timestamps);
    return timestamps.length > SPAM_THRESHOLD;
}

// ═══════════════════════════════════════════════════════════════
// ОТПРАВКА СООБЩЕНИЙ
// ═══════════════════════════════════════════════════════════════

async function sendMessage(channelId, text, options = {}) {
    try {
        // Проверка типа канала (только текстовые)
        const channelInfo = await apiGet(`/channels/${channelId}`);
        if (!channelInfo.data || (channelInfo.data.type !== 0 && channelInfo.data.type !== 5)) {
            console.error(`[sendMessage] Пропуск: канал ${channelId} не текстовый (type=${channelInfo.data?.type})`);
            return;
        }
        if (text.length > 2000) {
            const chunks = [];
            let remaining = text;
            while (remaining.length > 0) {
                let chunk = remaining.slice(0, 1990);
                const lastNewline = chunk.lastIndexOf('\n');
                if (lastNewline > 1500 && remaining.length > 2000) {
                    chunk = remaining.slice(0, lastNewline);
                }
                chunks.push(chunk);
                remaining = remaining.slice(chunk.length);
            }
            for (const chunk of chunks) {
                await apiPost(`/channels/${channelId}/messages`, { content: chunk, ...options });
            }
            return;
        }
        await apiPost(`/channels/${channelId}/messages`, { content: text, ...options });
    } catch (error) {
        console.error('[sendMessage]', error.response?.data || error.message);
    }
}

async function respondInteraction(interaction, text, ephemeral = false) {
    if (!interaction?.id || !interaction?.token) return;
    const data = { type: 4, data: { content: text } };
    if (ephemeral) data.data.flags = 64;
    try {
        await apiPost(`/interactions/${interaction.id}/${interaction.token}/callback`, data);
    } catch (error) {
        console.error('[respondInteraction]', error.response?.data || error.message);
    }
}

async function getDirectChannel(userId) {
    if (!userId) return null;
    const cached = dmChannelCache.get(userId);
    if (cached) return cached;
    try {
        const res = await apiPost('/users/@me/channels', { recipient_id: userId });
        const channelId = res.data?.id;
        if (channelId) {
            dmChannelCache.set(userId, channelId);
            return channelId;
        }
    } catch (err) {
        if (DEBUG) console.error('[getDirectChannel]', err.response?.data || err.message);
    }
    return null;
}

async function sendDirectMessage(userId, text) {
    const dmChannelId = await getDirectChannel(userId);
    if (!dmChannelId) return false;
    try {
        await sendMessage(dmChannelId, text);
        return true;
    } catch {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
// КАНАЛЬНЫЕ И ГИЛЬДЕЙСКИЕ ОПЕРАЦИИ
// ═══════════════════════════════════════════════════════════════

async function createGuildChannel(guildId, payload) {
    const res = await apiPost(`/guilds/${guildId}/channels`, payload);
    return res.data;
}

async function deleteChannel(channelId) {
    try { await apiDelete(`/channels/${channelId}`); } catch (err) {
        console.error('[deleteChannel]', err.response?.data || err.message);
    }
}

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

async function fetchMessages(channelId, limit = 100) {
    try {
        const res = await apiGet(`/channels/${channelId}/messages?limit=${Math.min(limit, 100)}`);
        return Array.isArray(res.data) ? res.data : [];
    } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════
// МОДЕРАЦИЯ: КИК, БАН, МУТ (ИСПРАВЛЕННЫЙ)
// ═══════════════════════════════════════════════════════════════

async function kickMember(guildId, userId, reason) {
    await apiDelete(`/guilds/${guildId}/members/${userId}`, { reason });
}

async function banMember(guildId, userId, reason, deleteMessageDays = 0) {
    await apiPost(`/guilds/${guildId}/bans/${userId}`, { reason, delete_message_days: deleteMessageDays });
}

async function unbanMember(guildId, userId) {
    await apiDelete(`/guilds/${guildId}/bans/${userId}`);
}

async function addRole(guildId, userId, roleId) {
    try {
        await apiPut(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {});
    } catch (err) {
        if (DEBUG) console.error('[addRole]', err.response?.data || err.message);
        throw err;
    }
}

async function removeRole(guildId, userId, roleId) {
    await apiDelete(`/guilds/${guildId}/members/${userId}/roles/${roleId}`);
}

/**
 * ИСПРАВЛЕННЫЙ МУТ
 * Теперь корректно работает с пользователями, у которых есть роли.
 * Используем несколько методов: роль мута + timeout API
 */
async function muteMember(guildId, userId, duration) {
    let success = false;

    // Метод 1: Роль мута (работает всегда, даже с ролями у юзера)
    const muteRoleId = config.muteRole?.[guildId];
    if (muteRoleId) {
        try {
            await addRole(guildId, userId, muteRoleId);
            success = true;

            // Запоминаем для автоснятия
            if (duration) {
                const muteKey = `${guildId}:${userId}`;
                // Очищаем предыдущий таймер если есть
                if (activeMutes.has(muteKey)) {
                    clearTimeout(activeMutes.get(muteKey));
                }
                const timer = setTimeout(async () => {
                    try {
                        await removeRole(guildId, userId, muteRoleId);
                        activeMutes.delete(muteKey);
                    } catch (err) {
                        if (DEBUG) console.error('[auto-unmute role]', err.message);
                    }
                }, duration);
                activeMutes.set(muteKey, timer);
            }
        } catch (err) {
            console.error('[muteMember role]', err.response?.data || err.message);
        }
    }

    // Метод 2: Communication disabled (timeout) — дополнительно
    try {
        const until = duration ? new Date(Date.now() + Math.min(duration, 28 * 24 * 3600000)).toISOString() : null;
        await apiPatch(`/guilds/${guildId}/members/${userId}`, {
            communication_disabled_until: until
        });
        success = true;
    } catch (err) {
        if (DEBUG) console.error('[muteMember timeout]', err.response?.data || err.message);
        // Если timeout не работает, но роль выдана — всё ок
    }

    return success;
}

async function unmuteMember(guildId, userId) {
    const muteKey = `${guildId}:${userId}`;

    // Убираем таймер автоснятия
    if (activeMutes.has(muteKey)) {
        clearTimeout(activeMutes.get(muteKey));
        activeMutes.delete(muteKey);
    }

    // Снимаем роль мута
    const muteRoleId = config.muteRole?.[guildId];
    if (muteRoleId) {
        try { await removeRole(guildId, userId, muteRoleId); } catch {}
    }

    // Снимаем timeout
    try {
        await apiPatch(`/guilds/${guildId}/members/${userId}`, {
            communication_disabled_until: null
        });
    } catch {}

    return true;
}

// ═══════════════════════════════════════════════════════════════
// ДЕДУПЛИКАЦИЯ СООБЩЕНИЙ
// ═══════════════════════════════════════════════════════════════

const processedMessages = new Set();
const processedQueue = [];
const MAX_CACHED_MESSAGES = 1000;

function markProcessedMessage(id) {
    if (!id) return true;
    if (processedMessages.has(id)) return false;
    processedMessages.add(id);
    processedQueue.push(id);
    if (processedQueue.length > MAX_CACHED_MESSAGES) {
        const old = processedQueue.shift();
        processedMessages.delete(old);
    }
    return true;
}

// ═══════════════════════════════════════════════════════════════
// КОМАНДЫ — РЕГИСТРАЦИЯ
// ═══════════════════════════════════════════════════════════════

const commands = new Map();

function registerCommand(names, handler, options = {}) {
    if (!Array.isArray(names)) names = [names];
    for (const name of names) {
        commands.set(name.toLowerCase(), { handler, ...options });
    }
}

async function executeCommand(cmd, msg, args, channelId, guildId) {
    const entry = commands.get(cmd);
    if (!entry) {
        // Проверяем кастомные команды
        if (guildId && config.customCommands?.[guildId]?.[cmd]) {
            sendMessage(channelId, config.customCommands[guildId][cmd]);
            return true;
        }
        return false;
    }

    // Проверяем, не отключена ли команда
    if (guildId && config.disabledCommands?.[guildId]?.includes(cmd)) {
        sendMessage(channelId, '⛔ Эта команда отключена на этом сервере.');
        return true;
    }

    if (entry.modOnly && !(await isModerator(msg))) {
        sendMessage(channelId, '⛔ У вас нет прав для этой команды.');
        return true;
    }

    if (entry.ownerOnly && !(await isOwner(msg))) {
        sendMessage(channelId, '⛔ Только владелец сервера может использовать эту команду.');
        return true;
    }

    if (entry.guildOnly && !guildId) {
        sendMessage(channelId, '⛔ Эта команда работает только на сервере.');
        return true;
    }

    try {
        await entry.handler(msg, args, channelId, guildId);
    } catch (err) {
        console.error(`[Command ${cmd}]`, err);
        sendMessage(channelId, `❌ Произошла ошибка при выполнении команды: ${err.message}`);
    }

    return true;
}

// ═══════════════════════════════════════════════════════════════
// РЕГИСТРАЦИЯ ВСЕХ КОМАНД
// ═══════════════════════════════════════════════════════════════

// ==================== ОБЩИЕ КОМАНДЫ ====================

registerCommand(['привет', 'hello', 'hi', 'хай', 'здарова'], async (msg, args, channelId) => {
    const greetings = [
        `Привет, <@${msg.author.id}>! 👋`,
        `Здравствуй, <@${msg.author.id}>! 😊`,
        `Приветствую, <@${msg.author.id}>! 🙃`,
        `Здарова, <@${msg.author.id}>! 😁`,
        `Йо, <@${msg.author.id}>! ✌️`,
        `Приветики, <@${msg.author.id}>! 🎉`,
        `Хеллоу, <@${msg.author.id}>! 🌟`,
        `Салют, <@${msg.author.id}>! 🎊`
    ];
    sendMessage(channelId, randomFromArray(greetings));
});

registerCommand(['пинг', 'ping'], async (msg, args, channelId) => {
    const start = Date.now();
    await sendMessage(channelId, `🏓 Понг! Задержка: ~${Date.now() - start}мс | Аптайм: ${formatDuration(Date.now() - botStartTime)}`);
});

registerCommand(['help', 'помощь', 'команды', 'хелп'], async (msg, args, channelId, guildId) => {
    const p = getGuildPrefix(guildId);
    const category = args[0]?.toLowerCase();

    if (category === 'экономика' || category === 'economy') {
        sendMessage(channelId, `**💰 Экономика:**
\`${p}баланс [@user]\` — узнать баланс
\`${p}бонус\` — ежедневный бонус (стрик-система!)
\`${p}перевод @user сумма\` — перевести монеты
\`${p}топ\` — рейтинг по балансу
\`${p}магазин\` — магазин ролей
\`${p}купить ID\` — купить товар
\`${p}инвентарь\` — ваши покупки
\`${p}ограбить @user\` — попытаться ограбить (рискованно!)
\`${p}слоты [ставка]\` — игровой автомат
\`${p}рулетка цвет ставка\` — рулетка (красный/чёрный/зелёный)
\`${p}дуэль @user ставка\` — дуэль на монеты`);
        return;
    }

    if (category === 'развлечения' || category === 'fun') {
        sendMessage(channelId, `**🎮 Развлечения:**
\`${p}монетка [кол]\` — подбросить монетку
\`${p}рандом [мин] [макс]\` — случайное число
\`${p}8ball вопрос\` — магический шар
\`${p}шутка\` — случайная шутка
\`${p}факт\` — интересный факт
\`${p}цитата\` — мудрая цитата
\`${p}реверс текст\` — перевернуть текст
\`${p}эмодзи [кол]\` — случайный эмодзи
\`${p}кот\` — случайный котик
\`${p}пёс\` — случайная собака
\`${p}комплимент [@user]\` — комплимент
\`${p}роаст @user\` — роаст (шутка)
\`${p}выбор вар1 | вар2\` — выбор из вариантов
\`${p}кто вопрос\` — случайный участник
\`${p}совместимость @user1 @user2\` — совместимость
\`${p}рейт что-то\` — оценка от 0 до 10`);
        return;
    }

    if (category === 'инфо' || category === 'info') {
        sendMessage(channelId, `**ℹ️ Информация:**
\`${p}аватар [@user]\` — аватар
\`${p}профиль [@user]\` — полный профиль
\`${p}уровень [@user]\` — уровень и опыт
\`${p}топуровень\` — рейтинг по уровням
\`${p}сервер\` — инфо о сервере
\`${p}каналы\` — список каналов
\`${p}состав\` — команда Astral
\`${p}аптайм\` — время работы бота
\`${p}botinfo\` — информация о боте
\`${p}реп @user\` — повысить репутацию`);
        return;
    }

    if (category === 'утилиты' || category === 'utils') {
        sendMessage(channelId, `**🔧 Утилиты:**
\`${p}напомни время текст\` — напоминание
\`${p}таймер секунд\` — обратный отсчёт
\`${p}calc выражение\` — калькулятор
\`${p}погода город\` — погода
\`${p}голосование вопрос | вар1 | вар2\` — голосование
\`${p}v ID вариант\` — проголосовать
\`${p}результат ID\` — итоги голосования`);
        return;
    }

    sendMessage(channelId, `**🤖 Astra6 Bot — Справка**

📂 **Категории команд:**
\`${p}help экономика\` — 💰 Экономика и магазин
\`${p}help развлечения\` — 🎮 Игры и развлечения
\`${p}help инфо\` — ℹ️ Информация и профили
\`${p}help утилиты\` — 🔧 Утилиты и инструменты

🛡️ **Модерация:** \`${p}adminhelp\`
⚙️ **Настройки:** \`${p}settings\`

📌 Текущий префикс: \`${p}\`
💡 Используйте \`${p}help категория\` для подробностей.`);
});

registerCommand(['adminhelp', 'модпомощь', 'admhelp'], async (msg, args, channelId, guildId) => {
    const p = getGuildPrefix(guildId);
    sendMessage(channelId,
`**🛡️ Команды модерации:**

**👤 Управление участниками:**
\`${p}kick @user [причина]\` — кикнуть
\`${p}ban @user [причина]\` — забанить
\`${p}unban userID\` — разбанить
\`${p}mute @user [время] [причина]\` — замутить
\`${p}unmute @user\` — размутить
\`${p}setnick @user ник\` — сменить ник
\`${p}nickreset @user\` — сбросить ник
\`${p}setrole @user @role\` — выдать роль
\`${p}removerole @user @role\` — снять роль
\`${p}massrole @role add/remove\` — массовая выдача роли

**⚠️ Предупреждения:**
\`${p}warn @user причина\` — выдать варн
\`${p}warnlist @user\` — список варнов
\`${p}delwarn @user номер\` — удалить варн
\`${p}clearwarns @user\` — снять все варны

**📝 Каналы:**
\`${p}purge кол-во [@user]\` — удалить сообщения
\`${p}lock [#канал]\` — закрыть канал
\`${p}unlock [#канал]\` — открыть канал
\`${p}slowmode секунд\` — медленный режим
\`${p}say #канал текст\` — написать от бота
\`${p}embed #канал заголовок | текст\` — embed от бота
\`${p}private имя @user\` — приватный канал

**⚙️ Настройки: \`${p}settings\`**

**💰 Экономика (модер.):**
\`${p}дать @user сумма\` — выдать монеты
\`${p}забрать @user сумма\` — забрать монеты
\`${p}сбросить @user\` — обнулить баланс
\`${p}добавитьтовар @role цена имя\` — в магазин
\`${p}удалитьтовар ID\` — из магазина

**📊 Инфо (модер.):**
\`${p}userinfo @user\` — подробная инфо
\`${p}roles\` — список ролей
\`${p}modlogs [кол]\` — лог действий
\`${p}banlist\` — список банов`
    );
}, { modOnly: true });

// --- SETTINGS / НАСТРОЙКИ (НОВАЯ КОМПЛЕКСНАЯ КОМАНДА) ---

registerCommand(['settings', 'настройки', 'setup'], async (msg, args, channelId, guildId) => {
    const p = getGuildPrefix(guildId);
    const sub = args[0]?.toLowerCase();

    if (!sub) {
        const automodStatus = config.automod?.[guildId]?.antispam ? '✅' : '❌';
        const antilinkStatus = config.antilink?.[guildId] ? '✅' : '❌';
        const logCh = config.logChannels?.[guildId] ? `<#${config.logChannels[guildId]}>` : '❌ не установлен';
        const welcomeCh = config.welcomeChannels?.[guildId] ? `<#${config.welcomeChannels[guildId]}>` : '❌ не установлен';
        const leaveCh = config.leaveChannels?.[guildId] ? `<#${config.leaveChannels[guildId]}>` : '❌ не установлен';
        const muteR = config.muteRole?.[guildId] ? `<@&${config.muteRole[guildId]}>` : '❌ не установлена';
        const autoR = config.autoRoles?.[guildId] ? `<@&${config.autoRoles[guildId]}>` : '❌ не установлена';
        const lvlMsg = config.levelUpMessages?.[guildId] !== false ? '✅' : '❌';
        const maxWarns = config.maxWarnsAction?.[guildId] || { count: 5, action: 'ban' };
        const currentPrefix = getGuildPrefix(guildId);

        sendMessage(channelId,
`**⚙️ Настройки сервера**

📌 **Префикс:** \`${currentPrefix}\`
🛡️ **Антиспам:** ${automodStatus}
🔗 **Антиссылки:** ${antilinkStatus}
📝 **Лог-канал:** ${logCh}
👋 **Приветствие:** ${welcomeCh}
🚪 **Прощание:** ${leaveCh}
🔇 **Роль мута:** ${muteR}
🎭 **Авто-роль:** ${autoR}
🎉 **Сообщения о лвл-апе:** ${lvlMsg}
⚠️ **Авто-наказание:** ${maxWarns.count} варнов → ${maxWarns.action}

**Команды настройки:**
\`${p}settings prefix символ\` — сменить префикс
\`${p}settings antispam on/off\` — антиспам
\`${p}settings antilink on/off\` — антиссылки
\`${p}settings log #канал\` — лог-канал
\`${p}settings welcome #канал\` — приветствие
\`${p}settings leave #канал\` — прощание
\`${p}settings muterole @role\` — роль мута
\`${p}settings autorole @role\` — авто-роль новичкам
\`${p}settings levelup on/off\` — сообщения о лвл-апе
\`${p}settings maxwarns кол действие\` — авто-наказание
\`${p}settings adminrole @role\` — роль модератора
\`${p}settings addcmd !имя ответ\` — кастомная команда
\`${p}settings delcmd !имя\` — удалить кастомную команду
\`${p}settings disable cmd\` — отключить команду
\`${p}settings enable cmd\` — включить команду`
        );
        return;
    }

    // Подкоманды настроек
    switch (sub) {
        case 'prefix':
        case 'префикс': {
            const newPrefix = args[1];
            if (!newPrefix || newPrefix.length > 5) {
                sendMessage(channelId, '❌ Укажите префикс (макс. 5 символов).');
                return;
            }
            if (!config.prefixes) config.prefixes = {};
            config.prefixes[guildId] = newPrefix;
            saveConfig();
            sendMessage(channelId, `✅ Префикс изменён на: \`${newPrefix}\``);
            break;
        }

        case 'antispam':
        case 'антиспам': {
            const state = args[1]?.toLowerCase();
            if (state === 'on' || state === 'вкл' || state === '1') {
                if (!config.automod) config.automod = {};
                config.automod[guildId] = { ...(config.automod[guildId] || {}), antispam: true };
                saveConfig();
                sendMessage(channelId, '✅ Антиспам **включён**. Спамеры будут замучены на 3 минуты.');
            } else if (state === 'off' || state === 'выкл' || state === '0') {
                if (config.automod?.[guildId]) config.automod[guildId].antispam = false;
                saveConfig();
                sendMessage(channelId, '✅ Антиспам **выключен**.');
            } else {
                sendMessage(channelId, `Используйте: \`${p}settings antispam on/off\``);
            }
            break;
        }

        case 'antilink':
        case 'антиссылки': {
            const state = args[1]?.toLowerCase();
            if (state === 'on' || state === 'вкл') {
                if (!config.antilink) config.antilink = {};
                config.antilink[guildId] = true;
                saveConfig();
                sendMessage(channelId, '✅ Антиссылки **включены**.');
            } else if (state === 'off' || state === 'выкл') {
                if (config.antilink) config.antilink[guildId] = false;
                saveConfig();
                sendMessage(channelId, '✅ Антиссылки **выключены**.');
            } else {
                sendMessage(channelId, `Используйте: \`${p}settings antilink on/off\``);
            }
            break;
        }

        case 'log':
        case 'лог': {
            const ch = extractChannelId(args[1]);
            if (!ch) {
                if (config.logChannels?.[guildId]) {
                    delete config.logChannels[guildId];
                    saveConfig();
                    sendMessage(channelId, '✅ Лог-канал **отключён**.');
                } else {
                    sendMessage(channelId, `Используйте: \`${p}settings log #канал\``);
                }
                return;
            }
            config.logChannels[guildId] = ch;
            saveConfig();
            sendMessage(channelId, `✅ Лог-канал: <#${ch}>`);
            break;
        }

        case 'welcome':
        case 'приветствие': {
            const ch = extractChannelId(args[1]);
            if (!ch) {
                if (config.welcomeChannels?.[guildId]) {
                    delete config.welcomeChannels[guildId];
                    saveConfig();
                    sendMessage(channelId, '✅ Приветствие **отключено**.');
                } else {
                    sendMessage(channelId, `Используйте: \`${p}settings welcome #канал\``);
                }
                return;
            }
            config.welcomeChannels[guildId] = ch;
            // Можно также задать текст
            const customMsg = args.slice(2).join(' ');
            if (customMsg) {
                if (!config.welcomeMessages) config.welcomeMessages = {};
                config.welcomeMessages[guildId] = customMsg;
            }
            saveConfig();
            sendMessage(channelId, `✅ Приветственный канал: <#${ch}>${customMsg ? `\nТекст: ${customMsg}` : ''}`);
            break;
        }

        case 'leave':
        case 'прощание': {
            const ch = extractChannelId(args[1]);
            if (!ch) {
                if (config.leaveChannels?.[guildId]) {
                    delete config.leaveChannels[guildId];
                    saveConfig();
                    sendMessage(channelId, '✅ Прощание **отключено**.');
                } else {
                    sendMessage(channelId, `Используйте: \`${p}settings leave #канал\``);
                }
                return;
            }
            config.leaveChannels[guildId] = ch;
            saveConfig();
            sendMessage(channelId, `✅ Канал прощания: <#${ch}>`);
            break;
        }

        case 'muterole':
        case 'мутроль': {
            const roleId = extractRoleId(args[1]);
            if (!roleId) {
                sendMessage(channelId, `Используйте: \`${p}settings muterole @role\``);
                return;
            }
            if (!config.muteRole) config.muteRole = {};
            config.muteRole[guildId] = roleId;
            saveConfig();
            sendMessage(channelId, `✅ Роль мута: <@&${roleId}>`);
            break;
        }

        case 'autorole':
        case 'автороль': {
            const roleId = extractRoleId(args[1]);
            if (!roleId) {
                if (config.autoRoles?.[guildId]) {
                    delete config.autoRoles[guildId];
                    saveConfig();
                    sendMessage(channelId, '✅ Авто-роль **отключена**.');
                } else {
                    sendMessage(channelId, `Используйте: \`${p}settings autorole @role\``);
                }
                return;
            }
            if (!config.autoRoles) config.autoRoles = {};
            config.autoRoles[guildId] = roleId;
            saveConfig();
            sendMessage(channelId, `✅ Авто-роль для новичков: <@&${roleId}>`);
            break;
        }

        case 'levelup':
        case 'лвлап': {
            const state = args[1]?.toLowerCase();
            if (state === 'on' || state === 'вкл') {
                if (!config.levelUpMessages) config.levelUpMessages = {};
                config.levelUpMessages[guildId] = true;
                saveConfig();
                sendMessage(channelId, '✅ Сообщения о повышении уровня **включены**.');
            } else if (state === 'off' || state === 'выкл') {
                if (!config.levelUpMessages) config.levelUpMessages = {};
                config.levelUpMessages[guildId] = false;
                saveConfig();
                sendMessage(channelId, '✅ Сообщения о повышении уровня **выключены**.');
            } else {
                sendMessage(channelId, `Используйте: \`${p}settings levelup on/off\``);
            }
            break;
        }

        case 'maxwarns': {
            const count = parseInt(args[1]);
            const action = (args[2] || 'ban').toLowerCase();
            if (!count || count < 1 || !['ban', 'kick', 'mute'].includes(action)) {
                sendMessage(channelId, `Используйте: \`${p}settings maxwarns кол действие\`\nДействия: ban, kick, mute`);
                return;
            }
            if (!config.maxWarnsAction) config.maxWarnsAction = {};
            config.maxWarnsAction[guildId] = { count, action };
            saveConfig();
            sendMessage(channelId, `✅ При **${count}** варнах → **${action}**`);
            break;
        }

        case 'adminrole':
        case 'модроль': {
            const roleId = extractRoleId(args[1]);
            if (!roleId) {
                sendMessage(channelId, `Используйте: \`${p}settings adminrole @role\``);
                return;
            }
            if (!config.adminRoles) config.adminRoles = {};
            if (!Array.isArray(config.adminRoles[guildId])) config.adminRoles[guildId] = [];
            if (!config.adminRoles[guildId].includes(roleId)) {
                config.adminRoles[guildId].push(roleId);
            }
            saveConfig();
            sendMessage(channelId, `✅ Роль модератора добавлена: <@&${roleId}>`);
            break;
        }

        case 'addcmd': {
            const cmdName = args[1]?.toLowerCase()?.replace(/^!/, '');
            const response = args.slice(2).join(' ');
            if (!cmdName || !response) {
                sendMessage(channelId, `Используйте: \`${p}settings addcmd имя ответ\``);
                return;
            }
            if (!config.customCommands) config.customCommands = {};
            if (!config.customCommands[guildId]) config.customCommands[guildId] = {};
            config.customCommands[guildId][cmdName] = response;
            saveConfig();
            sendMessage(channelId, `✅ Команда \`${p}${cmdName}\` создана!`);
            break;
        }

        case 'delcmd': {
            const cmdName = args[1]?.toLowerCase()?.replace(/^!/, '');
            if (!cmdName || !config.customCommands?.[guildId]?.[cmdName]) {
                sendMessage(channelId, '❌ Команда не найдена.');
                return;
            }
            delete config.customCommands[guildId][cmdName];
            saveConfig();
            sendMessage(channelId, `✅ Команда \`${cmdName}\` удалена.`);
            break;
        }

        case 'disable': {
            const cmdName = args[1]?.toLowerCase();
            if (!cmdName) {
                sendMessage(channelId, `Используйте: \`${p}settings disable команда\``);
                return;
            }
            if (!config.disabledCommands) config.disabledCommands = {};
            if (!config.disabledCommands[guildId]) config.disabledCommands[guildId] = [];
            if (!config.disabledCommands[guildId].includes(cmdName)) {
                config.disabledCommands[guildId].push(cmdName);
            }
            saveConfig();
            sendMessage(channelId, `✅ Команда \`${cmdName}\` **отключена**.`);
            break;
        }

        case 'enable': {
            const cmdName = args[1]?.toLowerCase();
            if (!cmdName) {
                sendMessage(channelId, `Используйте: \`${p}settings enable команда\``);
                return;
            }
            if (config.disabledCommands?.[guildId]) {
                config.disabledCommands[guildId] = config.disabledCommands[guildId].filter(c => c !== cmdName);
                saveConfig();
            }
            sendMessage(channelId, `✅ Команда \`${cmdName}\` **включена**.`);
            break;
        }

        default:
            sendMessage(channelId, `❌ Неизвестная настройка. Используйте \`${p}settings\` для списка.`);
    }
}, { modOnly: true, guildOnly: true });

// ==================== ЭКОНОМИКА ====================

registerCommand(['баланс', 'balance', 'bal', 'деньги'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]) || msg.author.id;
    const balance = getBalance(guildId, userId);
    const user = ensureUser(guildId, userId);
    sendMessage(channelId, `💰 <@${userId}> имеет **${balance}** монет.\n🏅 Уровень: **${user.level}** | ⭐ Репутация: **${user.reputation}**`);
}, { guildOnly: true });

registerCommand(['бонус', 'daily', 'bonus'], async (msg, args, channelId, guildId) => {
    const userId = msg.author.id;
    const now = Date.now();
    const last = getBonusLast(guildId, userId);
    const oneDay = 24 * 60 * 60 * 1000;

    if (now - last < oneDay) {
        const left = oneDay - (now - last);
        sendMessage(channelId, `⏰ Бонус будет доступен через **${formatDuration(left)}**.`);
        return;
    }

    const user = ensureUser(guildId, userId);
    const isStreak = last > 0 && (now - last) < (oneDay * 2);
    user.streak = isStreak ? user.streak + 1 : 1;

    const baseAmount = 1000;
    const streakBonus = Math.min(user.streak * 100, 5000);
    const levelBonus = user.level * 25;
    const amount = baseAmount + streakBonus + levelBonus;

    changeBalance(guildId, userId, amount);
    setBonusLast(guildId, userId, now);

    let text = `🎁 Вы получили **${amount}** монет!`;
    if (user.streak > 1) text += `\n🔥 Стрик: **${user.streak}** дней (бонус: +${streakBonus})`;
    if (levelBonus > 0) text += `\n🏅 Бонус за уровень: +${levelBonus}`;
    text += `\n💰 Баланс: **${getBalance(guildId, userId)}** монет.`;
    sendMessage(channelId, text);
    saveEconomy();
}, { guildOnly: true });

registerCommand(['перевод', 'transfer', 'pay'], async (msg, args, channelId, guildId) => {
    const targetId = extractUserId(args[0]);
    const amount = Math.floor(Number(args[1]));
    if (!targetId || !amount || amount <= 0) {
        sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}перевод @user сумма\``);
        return;
    }
    if (targetId === msg.author.id) {
        sendMessage(channelId, '❌ Нельзя переводить монеты себе.');
        return;
    }
    const balance = getBalance(guildId, msg.author.id);
    if (balance < amount) {
        sendMessage(channelId, `❌ Недостаточно монет. У вас: **${balance}**.`);
        return;
    }
    changeBalance(guildId, msg.author.id, -amount);
    changeBalance(guildId, targetId, amount);
    sendMessage(channelId, `💸 <@${msg.author.id}> перевёл **${amount}** монет <@${targetId}>.\n💰 Ваш баланс: **${getBalance(guildId, msg.author.id)}**`);
}, { guildOnly: true });

registerCommand(['топ', 'leaderboard', 'top'], async (msg, args, channelId, guildId) => {
    const container = getEconomyContainer(guildId);
    const entries = Object.entries(container)
        .map(([id, data]) => ({ id, balance: Number(data?.balance) || 0 }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 15);

    if (!entries.length) { sendMessage(channelId, 'Нет данных.'); return; }
    const medals = ['🥇', '🥈', '🥉'];
    const list = entries.map((e, idx) => {
        const medal = medals[idx] || `**${idx + 1}.**`;
        return `${medal} <@${e.id}> — **${e.balance}** монет`;
    }).join('\n');
    sendMessage(channelId, `**🏆 Топ по балансу:**\n\n${list}`);
}, { guildOnly: true });

// --- Ограбление ---
registerCommand(['ограбить', 'rob', 'грабить'], async (msg, args, channelId, guildId) => {
    const targetId = extractUserId(args[0]);
    if (!targetId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}ограбить @user\``); return; }
    if (targetId === msg.author.id) { sendMessage(channelId, '❌ Нельзя ограбить себя.'); return; }

    const myBalance = getBalance(guildId, msg.author.id);
    if (myBalance < 100) { sendMessage(channelId, '❌ Нужно минимум **100** монет для ограбления (залог).'); return; }

    const targetBalance = getBalance(guildId, targetId);
    if (targetBalance < 50) { sendMessage(channelId, '❌ У жертвы слишком мало монет.'); return; }

    const success = Math.random() < 0.4; // 40% шанс успеха

    if (success) {
        const stolen = Math.floor(Math.random() * Math.min(targetBalance * 0.3, 500)) + 50;
        changeBalance(guildId, msg.author.id, stolen);
        changeBalance(guildId, targetId, -stolen);
        sendMessage(channelId, `💰 <@${msg.author.id}> успешно ограбил <@${targetId}> и украл **${stolen}** монет! 🦹`);
    } else {
        const fine = Math.floor(myBalance * 0.2);
        changeBalance(guildId, msg.author.id, -fine);
        sendMessage(channelId, `🚔 <@${msg.author.id}> попался при ограблении <@${targetId}>! Штраф: **${fine}** монет.`);
    }
}, { guildOnly: true });

// --- Слоты ---
registerCommand(['слоты', 'slots', 'slot'], async (msg, args, channelId, guildId) => {
    const bet = Math.floor(Number(args[0])) || 50;
    if (bet < 10) { sendMessage(channelId, '❌ Минимальная ставка: **10** монет.'); return; }
    const balance = getBalance(guildId, msg.author.id);
    if (balance < bet) { sendMessage(channelId, `❌ Недостаточно монет. У вас: **${balance}**.`); return; }

    const symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣', '⭐'];
    const s1 = randomFromArray(symbols);
    const s2 = randomFromArray(symbols);
    const s3 = randomFromArray(symbols);

    let winnings = 0;
    if (s1 === s2 && s2 === s3) {
        winnings = s1 === '💎' ? bet * 10 : s1 === '7️⃣' ? bet * 7 : bet * 5;
    } else if (s1 === s2 || s2 === s3 || s1 === s3) {
        winnings = Math.floor(bet * 1.5);
    }

    changeBalance(guildId, msg.author.id, winnings - bet);

    const result = `🎰 [ ${s1} | ${s2} | ${s3} ]`;
    if (winnings > 0) {
        sendMessage(channelId, `${result}\n🎉 <@${msg.author.id}> выиграл **${winnings}** монет!\n💰 Баланс: **${getBalance(guildId, msg.author.id)}**`);
    } else {
        sendMessage(channelId, `${result}\n😢 <@${msg.author.id}> проиграл **${bet}** монет.\n💰 Баланс: **${getBalance(guildId, msg.author.id)}**`);
    }
}, { guildOnly: true });

// --- Рулетка ---
registerCommand(['рулетка', 'roulette'], async (msg, args, channelId, guildId) => {
    const color = args[0]?.toLowerCase();
    const bet = Math.floor(Number(args[1])) || 50;

    const validColors = { 'красный': 'red', 'red': 'red', 'чёрный': 'black', 'черный': 'black', 'black': 'black', 'зелёный': 'green', 'зеленый': 'green', 'green': 'green' };
    const chosen = validColors[color];

    if (!chosen) {
        sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}рулетка красный/чёрный/зелёный ставка\``);
        return;
    }

    if (bet < 10) { sendMessage(channelId, '❌ Минимальная ставка: **10** монет.'); return; }
    const balance = getBalance(guildId, msg.author.id);
    if (balance < bet) { sendMessage(channelId, `❌ Недостаточно монет.`); return; }

    const number = Math.floor(Math.random() * 37);
    const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    const resultColor = number === 0 ? 'green' : redNumbers.includes(number) ? 'red' : 'black';
    const colorEmoji = { red: '🔴', black: '⚫', green: '🟢' };
    const colorName = { red: 'красный', black: 'чёрный', green: 'зелёный' };

    let winnings = 0;
    if (chosen === resultColor) {
        winnings = chosen === 'green' ? bet * 14 : bet * 2;
    }

    changeBalance(guildId, msg.author.id, winnings - bet);

    const text = `🎡 Рулетка: **${number}** ${colorEmoji[resultColor]} (${colorName[resultColor]})`;
    if (winnings > 0) {
        sendMessage(channelId, `${text}\n🎉 Вы выиграли **${winnings}** монет!\n💰 Баланс: **${getBalance(guildId, msg.author.id)}**`);
    } else {
        sendMessage(channelId, `${text}\n😢 Вы проиграли **${bet}** монет.\n💰 Баланс: **${getBalance(guildId, msg.author.id)}**`);
    }
}, { guildOnly: true });

// --- Дуэль ---
registerCommand(['дуэль', 'duel'], async (msg, args, channelId, guildId) => {
    const targetId = extractUserId(args[0]);
    const bet = Math.floor(Number(args[1])) || 100;

    if (!targetId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}дуэль @user [ставка]\``); return; }
    if (targetId === msg.author.id) { sendMessage(channelId, '❌ Нельзя бросить вызов себе.'); return; }
    if (bet < 10) { sendMessage(channelId, '❌ Минимальная ставка: **10** монет.'); return; }

    const myBal = getBalance(guildId, msg.author.id);
    const theirBal = getBalance(guildId, targetId);

    if (myBal < bet) { sendMessage(channelId, `❌ У вас недостаточно монет.`); return; }
    if (theirBal < bet) { sendMessage(channelId, `❌ У оппонента недостаточно монет.`); return; }

    const winnerId = Math.random() < 0.5 ? msg.author.id : targetId;
    const loserId = winnerId === msg.author.id ? targetId : msg.author.id;

    changeBalance(guildId, winnerId, bet);
    changeBalance(guildId, loserId, -bet);

    sendMessage(channelId, `⚔️ **Дуэль!**\n<@${msg.author.id}> vs <@${targetId}>\n\n🏆 Победитель: <@${winnerId}>! (+**${bet}** монет)\n😢 Проигравший: <@${loserId}> (-**${bet}** монет)`);
}, { guildOnly: true });

// --- Репутация ---
registerCommand(['реп', 'rep', 'репутация'], async (msg, args, channelId, guildId) => {
    const targetId = extractUserId(args[0]);
    if (!targetId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}реп @user\``); return; }
    if (targetId === msg.author.id) { sendMessage(channelId, '❌ Нельзя повысить репутацию себе.'); return; }

    const user = ensureUser(guildId, targetId);
    user.reputation = (user.reputation || 0) + 1;
    saveEconomy();

    sendMessage(channelId, `⭐ <@${msg.author.id}> повысил репутацию <@${targetId}>! Репутация: **${user.reputation}**`);
}, { guildOnly: true });

// --- Инвентарь ---
registerCommand(['инвентарь', 'inventory', 'inv'], async (msg, args, channelId, guildId) => {
    const user = ensureUser(guildId, msg.author.id);
    if (!user.inventory.length) {
        sendMessage(channelId, '🎒 Ваш инвентарь пуст.');
        return;
    }
    const list = user.inventory.map((item, idx) => `**${idx + 1}.** ${item.name}`).join('\n');
    sendMessage(channelId, `**🎒 Инвентарь <@${msg.author.id}>:**\n${list}`);
}, { guildOnly: true });

// --- Модер. экономика ---

registerCommand(['дать', 'give', 'addmoney'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    const amount = Math.floor(Number(args[1]));
    if (!userId || !amount || amount <= 0) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}дать @user сумма\``); return; }
    changeBalance(guildId, userId, amount);
    sendMessage(channelId, `✅ <@${userId}> получил **${amount}** монет. Баланс: **${getBalance(guildId, userId)}**.`);
    await logModAction(guildId, 'GIVE_MONEY', msg.author.id, userId, `${amount} монет`);
}, { modOnly: true, guildOnly: true });

registerCommand(['забрать', 'take', 'removemoney'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    const amount = Math.floor(Number(args[1]));
    if (!userId || !amount || amount <= 0) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}забрать @user сумма\``); return; }
    changeBalance(guildId, userId, -amount);
    sendMessage(channelId, `✅ У <@${userId}> забрано **${amount}** монет. Баланс: **${getBalance(guildId, userId)}**.`);
    await logModAction(guildId, 'TAKE_MONEY', msg.author.id, userId, `${amount} монет`);
}, { modOnly: true, guildOnly: true });

registerCommand(['сбросить', 'resetbalance'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    if (!userId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}сбросить @user\``); return; }
    setBalance(guildId, userId, 0);
    sendMessage(channelId, `✅ Баланс <@${userId}> обнулён.`);
    await logModAction(guildId, 'RESET_BALANCE', msg.author.id, userId, 'Обнулён баланс');
}, { modOnly: true, guildOnly: true });

// --- Магазин ---

registerCommand(['магазин', 'shop', 'store'], async (msg, args, channelId, guildId) => {
    const items = getShop(guildId);
    if (!items.length) {
        sendMessage(channelId, `🏪 Магазин пуст. Модераторы могут добавить товары: \`${getGuildPrefix(guildId)}добавитьтовар\``);
        return;
    }
    const list = items.map((item, idx) => {
        return `**${idx + 1}.** ${item.name} — **${item.price}** монет (ID: \`${item.id}\`)${item.roleId ? ` → <@&${item.roleId}>` : ''}`;
    }).join('\n');
    sendMessage(channelId, `**🏪 Магазин:**\n\n${list}\n\nДля покупки: \`${getGuildPrefix(guildId)}купить ID\``);
}, { guildOnly: true });

registerCommand(['купить', 'buy'], async (msg, args, channelId, guildId) => {
    const itemId = args[0];
    if (!itemId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}купить ID\``); return; }

    const items = getShop(guildId);
    let item = items.find(i => i.id === itemId);

    if (!item) {
        const idx = parseInt(itemId) - 1;
        if (idx >= 0 && idx < items.length) item = items[idx];
    }

    if (!item) { sendMessage(channelId, '❌ Товар не найден.'); return; }

    const balance = getBalance(guildId, msg.author.id);
    if (balance < item.price) {
        sendMessage(channelId, `❌ Недостаточно монет. Нужно: **${item.price}**, у вас: **${balance}**.`);
        return;
    }

    changeBalance(guildId, msg.author.id, -item.price);

    // Добавляем в инвентарь
    const user = ensureUser(guildId, msg.author.id);
    user.inventory.push({ name: item.name, boughtAt: Date.now() });
    saveEconomy();

    if (item.roleId) {
        try {
            await addRole(guildId, msg.author.id, item.roleId);
            sendMessage(channelId, `✅ Вы купили **${item.name}** за **${item.price}** монет! Роль выдана.`);
        } catch (err) {
            changeBalance(guildId, msg.author.id, item.price);
            sendMessage(channelId, '❌ Не удалось выдать роль. Монеты возвращены.');
        }
    } else {
        sendMessage(channelId, `✅ Вы купили **${item.name}** за **${item.price}** монет!`);
    }
}, { guildOnly: true });

registerCommand(['добавитьтовар', 'addshopitem', 'additem'], async (msg, args, channelId, guildId) => {
    const roleId = extractRoleId(args[0]);
    const price = Math.floor(Number(args[1]));
    const name = args.slice(2).join(' ').trim();
    if (!price || price <= 0 || !name) {
        sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}добавитьтовар @role цена название\``);
        return;
    }
    const item = addShopItem(guildId, { name, price, roleId: roleId || null });
    sendMessage(channelId, `✅ Товар **${name}** добавлен за **${price}** монет (ID: \`${item.id}\`).`);
}, { modOnly: true, guildOnly: true });

registerCommand(['удалитьтовар', 'removeshopitem', 'delitem'], async (msg, args, channelId, guildId) => {
    const itemId = args[0];
    if (!itemId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}удалитьтовар ID\``); return; }
    if (removeShopItem(guildId, itemId)) {
        sendMessage(channelId, `✅ Товар удалён из магазина.`);
    } else {
        sendMessage(channelId, `❌ Товар не найден.`);
    }
}, { modOnly: true, guildOnly: true });

// ==================== УРОВНИ ====================

registerCommand(['уровень', 'level', 'lvl', 'rank'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]) || msg.author.id;
    const data = getUserLevel(guildId, userId);
    const progressBar = createProgressBar(data.xp, data.needed);
    sendMessage(channelId, `📊 <@${userId}>\n🏅 Уровень: **${data.level}**\n✨ Опыт: **${data.xp}/${data.needed}** ${progressBar}\n💬 Сообщений: **${data.totalMessages}**`);
}, { guildOnly: true });

registerCommand(['топуровень', 'toplevel', 'lvltop'], async (msg, args, channelId, guildId) => {
    const container = getEconomyContainer(guildId);
    const entries = Object.entries(container)
        .map(([id, data]) => ({ id, level: data?.level || 0, xp: data?.xp || 0 }))
        .sort((a, b) => b.level - a.level || b.xp - a.xp)
        .slice(0, 10);

    if (!entries.length) { sendMessage(channelId, 'Нет данных.'); return; }
    const medals = ['🥇', '🥈', '🥉'];
    const list = entries.map((e, idx) => {
        const medal = medals[idx] || `**${idx + 1}.**`;
        return `${medal} <@${e.id}> — уровень **${e.level}** (${e.xp} XP)`;
    }).join('\n');
    sendMessage(channelId, `**🏆 Топ по уровням:**\n\n${list}`);
}, { guildOnly: true });

// ==================== ПРОФИЛЬ ====================

registerCommand(['профиль', 'profile', 'me'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]) || msg.author.id;
    const member = await fetchMember(guildId, userId);
    const username = member?.user?.username || `Пользователь`;
    const joined = member?.joined_at ? new Date(member.joined_at).toLocaleString('ru-RU') : '—';
    const balance = getBalance(guildId, userId);
    const warns = getWarns(guildId, userId).length;
    const lvlData = getUserLevel(guildId, userId);
    const user = ensureUser(guildId, userId);
    const progressBar = createProgressBar(lvlData.xp, lvlData.needed);
    const roles = Array.isArray(member?.roles) && member.roles.length
        ? member.roles.map(r => `<@&${r}>`).join(', ') : '—';

    sendMessage(channelId,
`╔══════════════════════════╗
  👤 **Профиль ${username}**
╚══════════════════════════╝

🏅 Уровень: **${lvlData.level}** | XP: ${lvlData.xp}/${lvlData.needed}
${progressBar}
💰 Баланс: **${balance}** монет
⭐ Репутация: **${user.reputation || 0}**
💬 Сообщений: **${lvlData.totalMessages}**
⚠️ Варнов: **${warns}**
🔥 Стрик: **${user.streak || 0}** дней
🎒 В инвентаре: **${user.inventory?.length || 0}** предметов
📅 На сервере с: ${joined}
🏷️ Роли: ${roles}`
    );
}, { guildOnly: true });

// ==================== РАЗВЛЕЧЕНИЯ ====================

registerCommand(['монетка', 'coin', 'flip'], async (msg, args, channelId) => {
    let count = Math.min(Math.max(parseInt(args[0]) || 1, 1), 20);
    const results = [];
    for (let i = 0; i < count; i++) results.push(Math.random() < 0.5 ? 'Орёл' : 'Решка');

    if (count === 1) {
        sendMessage(channelId, `${results[0] === 'Орёл' ? '🦅' : '🪙'} **${results[0]}!**`);
    } else {
        const heads = results.filter(x => x === 'Орёл').length;
        sendMessage(channelId, `🪙 ${results.join(', ')}\n🦅 Орлов: **${heads}** | 🪙 Решек: **${count - heads}**`);
    }
});

registerCommand(['рандом', 'random', 'rand'], async (msg, args, channelId) => {
    let min = 1, max = 100;
    if (args.length >= 2) { min = parseInt(args[0]) || 1; max = parseInt(args[1]) || 100; }
    else if (args.length === 1) { max = parseInt(args[0]) || 100; }
    if (min > max) [min, max] = [max, min];
    sendMessage(channelId, `🎲 Число от ${min} до ${max}: **${Math.floor(Math.random() * (max - min + 1)) + min}**`);
});

registerCommand(['8ball', 'шар', '8шар'], async (msg, args, channelId) => {
    const question = args.join(' ');
    if (!question) { sendMessage(channelId, `Задайте вопрос: \`${PREFIX}8ball ваш вопрос\``); return; }
    sendMessage(channelId, `🎱 *${question}*\n\n**${randomFromArray(eightBallAnswers)}**`);
});

registerCommand(['шутка', 'joke', 'анекдот'], async (msg, args, channelId) => {
    sendMessage(channelId, `😂 ${randomFromArray(russianJokes)}`);
});

registerCommand(['факт', 'fact'], async (msg, args, channelId) => {
    sendMessage(channelId, `📚 ${randomFromArray(russianFacts)}`);
});

registerCommand(['цитата', 'quote'], async (msg, args, channelId) => {
    sendMessage(channelId, `💬 ${randomFromArray(quotes)}`);
});

registerCommand(['реверс', 'reverse'], async (msg, args, channelId) => {
    const text = args.join(' ');
    if (!text) { sendMessage(channelId, `Используйте: \`${PREFIX}реверс текст\``); return; }
    sendMessage(channelId, `🔄 ${[...text].reverse().join('')}`);
});

registerCommand(['эмодзи', 'emoji', 'randemoji'], async (msg, args, channelId) => {
    const count = Math.min(Math.max(parseInt(args[0]) || 1, 1), 10);
    const result = [];
    for (let i = 0; i < count; i++) result.push(randomFromArray(funEmojis));
    sendMessage(channelId, result.join(' '));
});

registerCommand(['кот', 'cat', 'котик'], async (msg, args, channelId) => {
    try {
        const res = await axios.get('https://api.thecatapi.com/v1/images/search');
        sendMessage(channelId, `🐱 ${res.data[0]?.url || 'Не удалось.'}`);
    } catch { sendMessage(channelId, '😿 Не удалось получить котика.'); }
});

registerCommand(['пёс', 'dog', 'собака', 'пес'], async (msg, args, channelId) => {
    try {
        const res = await axios.get('https://dog.ceo/api/breeds/image/random');
        sendMessage(channelId, `🐶 ${res.data?.message || 'Не удалось.'}`);
    } catch { sendMessage(channelId, '🐕 Не удалось получить собаку.'); }
});

registerCommand(['комплимент', 'compliment'], async (msg, args, channelId) => {
    const targetId = extractUserId(args[0]) || msg.author.id;
    sendMessage(channelId, `💖 <@${targetId}>, ${randomFromArray(compliments)}`);
});

registerCommand(['роаст', 'roast'], async (msg, args, channelId) => {
    const targetId = extractUserId(args[0]);
    if (!targetId) { sendMessage(channelId, `Используйте: \`${PREFIX}роаст @user\``); return; }
    if (targetId === botUserId) { sendMessage(channelId, '🤖 Ха-ха, нет. Я неуязвим.'); return; }
    sendMessage(channelId, `🔥 <@${targetId}>, ${randomFromArray(roasts)}`);
});

registerCommand(['выбор', 'choose', 'choice'], async (msg, args, channelId) => {
    const text = args.join(' ');
    const options = text.split('|').map(s => s.trim()).filter(Boolean);
    if (options.length < 2) {
        sendMessage(channelId, `Используйте: \`${PREFIX}выбор вариант 1 | вариант 2 | ...\``);
        return;
    }
    sendMessage(channelId, `🤔 Я выбираю: **${randomFromArray(options)}**`);
});

registerCommand(['кто', 'who'], async (msg, args, channelId, guildId) => {
    const question = args.join(' ') || 'это?';
    const memberIds = await fetchGuildMemberIds(guildId);
    if (!memberIds.length) { sendMessage(channelId, '❌ Не удалось получить участников.'); return; }
    const randomMember = randomFromArray(memberIds);
    sendMessage(channelId, `🎯 Кто ${question}\n**Ответ:** <@${randomMember}>!`);
}, { guildOnly: true });

registerCommand(['совместимость', 'love', 'ship'], async (msg, args, channelId) => {
    const user1 = extractUserId(args[0]);
    const user2 = extractUserId(args[1]) || msg.author.id;
    if (!user1) { sendMessage(channelId, `Используйте: \`${PREFIX}совместимость @user1 @user2\``); return; }

    // Детерминированный результат по ID
    const combined = (BigInt(user1) + BigInt(user2)) % 101n;
    const percent = Number(combined);

    let emoji, text;
    if (percent >= 90) { emoji = '💕💕💕'; text = 'Идеальная пара!'; }
    else if (percent >= 70) { emoji = '💖💖'; text = 'Отличная совместимость!'; }
    else if (percent >= 50) { emoji = '💛'; text = 'Неплохо!'; }
    else if (percent >= 30) { emoji = '💔'; text = 'Слабовато...'; }
    else { emoji = '💀'; text = 'Лучше не надо.'; }

    sendMessage(channelId, `${emoji} Совместимость <@${user1}> и <@${user2}>: **${percent}%**\n${text}`);
});

registerCommand(['рейт', 'rate'], async (msg, args, channelId) => {
    const thing = args.join(' ');
    if (!thing) { sendMessage(channelId, `Используйте: \`${PREFIX}рейт что-нибудь\``); return; }
    const rating = Math.floor(Math.random() * 11);
    const stars = '⭐'.repeat(Math.ceil(rating / 2)) + '☆'.repeat(5 - Math.ceil(rating / 2));
    sendMessage(channelId, `📊 Оценка "${thing}": **${rating}/10** ${stars}`);
});

registerCommand(['числофакт', 'numberfact'], async (msg, args, channelId) => {
    const num = parseInt(args[0]);
    if (isNaN(num)) { sendMessage(channelId, `Используйте: \`${PREFIX}числофакт число\``); return; }
    try {
        const res = await axios.get(`http://numbersapi.com/${num}/trivia`);
        sendMessage(channelId, `🔢 ${res.data}`);
    } catch { sendMessage(channelId, 'Не удалось получить факт о числе.'); }
});

registerCommand(['аптайм', 'uptime'], async (msg, args, channelId) => {
    sendMessage(channelId, `🤖 Бот работает уже: **${formatDuration(Date.now() - botStartTime)}**`);
});

registerCommand(['botinfo', 'ботинфо', 'bot'], async (msg, args, channelId) => {
    const memUsage = process.memoryUsage();
    sendMessage(channelId,
`**🤖 Astra6 Bot**
⏱️ Аптайм: **${formatDuration(Date.now() - botStartTime)}**
📌 Префикс: \`${PREFIX}\`
📝 Команд: **${commands.size}**
💾 RAM: **${Math.round(memUsage.heapUsed / 1024 / 1024)}MB** / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB
🖥️ Node.js: **${process.version}**
🔌 API: ${API_BASE}`);
});

// ==================== ГОЛОСОВАНИЕ ====================

registerCommand(['голосование', 'poll', 'vote'], async (msg, args, channelId, guildId) => {
    const text = args.join(' ');
    if (!text) {
        sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}голосование Вопрос? | Вариант 1 | Вариант 2\``);
        return;
    }

    const parts = text.split('|').map(s => s.trim()).filter(Boolean);
    const pollId = Date.now().toString(36);

    if (parts.length < 2) {
        activePolls.set(pollId, {
            question: text, options: ['Да', 'Нет'],
            votes: { 'да': new Set(), 'нет': new Set() },
            channelId, guildId, authorId: msg.author.id
        });
        sendMessage(channelId,
`📊 **Голосование:** ${text}

Ответьте: \`${getGuildPrefix(guildId)}v ${pollId} да\` или \`${getGuildPrefix(guildId)}v ${pollId} нет\`
📌 ID: \`${pollId}\` | Создал: <@${msg.author.id}>`);
        return;
    }

    const question = parts[0];
    const options = parts.slice(1);
    const votes = {};
    options.forEach((_, i) => { votes[i + 1] = new Set(); });

    activePolls.set(pollId, { question, options, votes, channelId, guildId, authorId: msg.author.id });

    const numberEmojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    const optionsList = options.map((opt, i) => `${numberEmojis[i] || `${i+1}.`} ${opt}`).join('\n');
    sendMessage(channelId,
`📊 **${question}**

${optionsList}

Голосуйте: \`${getGuildPrefix(guildId)}v ${pollId} номер\`
📌 ID: \`${pollId}\` | Создал: <@${msg.author.id}>`);
});

registerCommand(['v', 'голос'], async (msg, args, channelId) => {
    const pollId = args[0];
    const choice = args[1]?.toLowerCase();
    if (!pollId || !choice) { sendMessage(channelId, 'Используйте: `!v ID вариант`'); return; }

    const poll = activePolls.get(pollId);
    if (!poll) { sendMessage(channelId, '❌ Голосование не найдено.'); return; }

    // Убираем предыдущий голос
    for (const key in poll.votes) { poll.votes[key].delete(msg.author.id); }

    if (choice === 'да' || choice === 'yes') { poll.votes['да']?.add(msg.author.id); }
    else if (choice === 'нет' || choice === 'no') { poll.votes['нет']?.add(msg.author.id); }
    else {
        const num = parseInt(choice);
        if (num && poll.votes[num]) { poll.votes[num].add(msg.author.id); }
        else { sendMessage(channelId, '❌ Некорректный вариант.'); return; }
    }
    sendMessage(channelId, `✅ <@${msg.author.id}> проголосовал!`);
});

registerCommand(['результат', 'pollresult', 'итоги'], async (msg, args, channelId) => {
    const pollId = args[0];
    if (!pollId) { sendMessage(channelId, 'Используйте: `!результат ID`'); return; }

    const poll = activePolls.get(pollId);
    if (!poll) { sendMessage(channelId, '❌ Голосование не найдено.'); return; }

    let text = `📊 **Итоги:** ${poll.question}\n\n`;
    if (poll.votes['да'] !== undefined) {
        text += `✅ Да: **${poll.votes['да'].size}**\n❌ Нет: **${poll.votes['нет'].size}**`;
    } else {
        text += poll.options.map((opt, i) => {
            const count = poll.votes[i + 1]?.size || 0;
            return `**${i + 1}.** ${opt} — **${count}** голосов`;
        }).join('\n');
    }
    sendMessage(channelId, text);
});

// ==================== УТИЛИТЫ ====================

registerCommand(['напомни', 'remind', 'reminder'], async (msg, args, channelId) => {
    if (args.length < 2) {
        sendMessage(channelId, `Используйте: \`${PREFIX}напомни 30м текст\`\nФорматы: 10с, 5м, 2ч, 1д`);
        return;
    }
    const duration = parseDuration(args[0]);
    if (!duration || duration > 7 * 24 * 3600000) {
        sendMessage(channelId, '❌ Некорректное время (макс. 7 дней).');
        return;
    }
    const text = args.slice(1).join(' ');
    const timer = setTimeout(() => {
        sendMessage(channelId, `⏰ <@${msg.author.id}>, напоминание: **${text}**`);
    }, duration);
    reminders.push({ timer, userId: msg.author.id, text, time: Date.now() + duration });
    sendMessage(channelId, `✅ Напоминание через **${formatDuration(duration)}**.`);
});

registerCommand(['таймер', 'timer'], async (msg, args, channelId) => {
    const seconds = parseInt(args[0]);
    if (!seconds || seconds < 1 || seconds > 300) {
        sendMessage(channelId, `Используйте: \`${PREFIX}таймер секунд\` (1-300)`);
        return;
    }
    sendMessage(channelId, `⏱️ Таймер: **${seconds}** сек.`);
    setTimeout(() => { sendMessage(channelId, `⏰ <@${msg.author.id}> Время вышло! (**${seconds}с**)`); }, seconds * 1000);
});

registerCommand(['calc', 'калькулятор', 'считай'], async (msg, args, channelId) => {
    const expr = args.join(' ');
    if (!expr) { sendMessage(channelId, `Используйте: \`${PREFIX}calc 2 + 2 * 3\``); return; }

    const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '');
    try {
        const result = Function(`"use strict"; return (${sanitized})`)();
        if (typeof result !== 'number' || !isFinite(result)) throw new Error();
        sendMessage(channelId, `🔢 ${expr} = **${result}**`);
    } catch { sendMessage(channelId, '❌ Ошибка вычисления.'); }
});

registerCommand(['погода', 'weather'], async (msg, args, channelId) => {
    const city = args.join(' ');
    if (!city) { sendMessage(channelId, `Используйте: \`${PREFIX}погода город\``); return; }
    try {
        const res = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=3&lang=ru`);
        sendMessage(channelId, `🌤️ ${res.data}`);
    } catch { sendMessage(channelId, '❌ Не удалось получить погоду.'); }
});

// ==================== ИНФО ====================

registerCommand(['аватар', 'avatar', 'ava'], async (msg, args, channelId) => {
    const userId = extractUserId(args[0]) || msg.author.id;
    try {
        const user = await fetchUser(userId);
        const avatar = user?.avatar_url || user?.avatar;
        sendMessage(channelId, avatar ? `🖼️ Аватар <@${userId}>:\n${avatar}` : '🖼️ Аватар не найден.');
    } catch { sendMessage(channelId, '❌ Не удалось получить аватар.'); }
});

registerCommand(['сервер', 'server', 'serverinfo'], async (msg, args, channelId, guildId) => {
    try {
        const g = await fetchGuildInfo(guildId);
        if (!g) { sendMessage(channelId, '❌ Не удалось получить инфо.'); return; }
        const channels = await fetchGuildChannels(guildId);
        const textCh = channels.filter(c => c.type === 0).length;
        const voiceCh = channels.filter(c => c.type === 2).length;
        const categories = channels.filter(c => c.type === 4).length;
        const roles = await fetchGuildRoles(guildId);

        sendMessage(channelId,
`╔══════════════════════════╗
  🏠 **${g.name}**
╚══════════════════════════╝
👥 Участников: **${g.member_count || g.members?.length || '?'}**
📝 Текстовых: **${textCh}** | 🔊 Голосовых: **${voiceCh}** | 📁 Категорий: **${categories}**
🏷️ Ролей: **${roles.size}**
👑 Владелец: <@${g.owner_id || g.ownerId || '?'}>
🆔 \`${guildId}\``);
    } catch { sendMessage(channelId, '❌ Ошибка.'); }
}, { guildOnly: true });

registerCommand(['каналы', 'channels'], async (msg, args, channelId, guildId) => {
    const channels = await fetchGuildChannels(guildId);
    sendMessage(channelId, `**📋 Каналы:**\n${formatChannelList(channels)}`);
}, { guildOnly: true });

registerCommand(['состав', 'team'], async (msg, args, channelId) => {
    sendMessage(channelId,
`**👥 Команда Astral**

🔧 **Разработчик:** <@Ivan>
⭐ **Staff:** <@SandP1ay> <@H4ndee> <@calcto> <@Dark_qx> <@Infinit> <@Rolex>

*Администрация Astral желает всем удачи! 😁*`);
});

// ==================== МОДЕРАЦИЯ ====================

registerCommand(['kick', 'кик'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    if (!userId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}kick @user [причина]\``); return; }
    if (userId === msg.author.id) { sendMessage(channelId, '❌ Нельзя кикнуть себя.'); return; }
    if (userId === botUserId) { sendMessage(channelId, '❌ Нельзя кикнуть бота.'); return; }
    const reason = args.slice(1).join(' ') || 'Не указана';
    try {
        await sendDirectMessage(userId, `⚠️ Вы были кикнуты. Причина: ${reason}`);
        await kickMember(guildId, userId, reason);
        sendMessage(channelId, `✅ <@${userId}> кикнут. Причина: **${reason}**`);
        await logModAction(guildId, 'KICK', msg.author.id, userId, reason);
    } catch (err) {
        sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`);
    }
}, { modOnly: true, guildOnly: true });

registerCommand(['ban', 'бан'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    if (!userId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}ban @user [причина]\``); return; }
    if (userId === msg.author.id) { sendMessage(channelId, '❌ Нельзя забанить себя.'); return; }
    if (userId === botUserId) { sendMessage(channelId, '❌ Нельзя забанить бота.'); return; }
    const reason = args.slice(1).join(' ') || 'Не указана';
    try {
        await sendDirectMessage(userId, `⛔ Вы забанены. Причина: ${reason}`);
        await banMember(guildId, userId, reason);
        sendMessage(channelId, `✅ <@${userId}> забанен. Причина: **${reason}**`);
        await logModAction(guildId, 'BAN', msg.author.id, userId, reason);
    } catch (err) {
        sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`);
    }
}, { modOnly: true, guildOnly: true });

registerCommand(['unban', 'разбан'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    if (!userId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}unban userID\``); return; }
    try {
        await unbanMember(guildId, userId);
        sendMessage(channelId, `✅ <@${userId}> разбанен.`);
        await logModAction(guildId, 'UNBAN', msg.author.id, userId, '');
    } catch (err) {
        sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`);
    }
}, { modOnly: true, guildOnly: true });

registerCommand(['banlist', 'баны', 'банлист'], async (msg, args, channelId, guildId) => {
    try {
        const res = await apiGet(`/guilds/${guildId}/bans`);
        const bans = Array.isArray(res.data) ? res.data : [];
        if (!bans.length) { sendMessage(channelId, '✅ Список банов пуст.'); return; }
        const list = bans.slice(0, 20).map(b =>
            `• <@${b.user?.id}> — ${b.reason || 'причина не указана'}`
        ).join('\n');
        sendMessage(channelId, `**🔨 Баны (${bans.length}):**\n${list}${bans.length > 20 ? '\n...и ещё' : ''}`);
    } catch (err) {
        sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`);
    }
}, { modOnly: true, guildOnly: true });

// --- МУТ (ИСПРАВЛЕННЫЙ) ---

registerCommand(['mute', 'мут'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    if (!userId) {
        sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}mute @user [время] [причина]\`\nПример: \`!mute @user 30м спам\``);
        return;
    }
    if (userId === msg.author.id) { sendMessage(channelId, '❌ Нельзя замутить себя.'); return; }
    if (userId === botUserId) { sendMessage(channelId, '❌ Нельзя замутить бота.'); return; }

    let duration = parseDuration(args[1]);
    const reasonStart = duration ? 2 : 1;
    const reason = args.slice(reasonStart).join(' ') || 'Не указана';

    if (!duration) duration = 3600000; // 1 час по умолчанию

    try {
        const result = await muteMember(guildId, userId, duration);
        if (result) {
            sendMessage(channelId, `🔇 <@${userId}> замучен на **${formatDuration(duration)}**. Причина: **${reason}**`);
            await sendDirectMessage(userId, `🔇 Вы замучены на ${formatDuration(duration)}. Причина: ${reason}`);
            await logModAction(guildId, 'MUTE', msg.author.id, userId, `${formatDuration(duration)} — ${reason}`);
        } else {
            sendMessage(channelId, `❌ Не удалось замутить. Настройте роль мута: \`${getGuildPrefix(guildId)}settings muterole @role\``);
        }
    } catch (err) {
        sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`);
    }
}, { modOnly: true, guildOnly: true });

registerCommand(['unmute', 'размут'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    if (!userId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}unmute @user\``); return; }
    try {
        await unmuteMember(guildId, userId);
        sendMessage(channelId, `🔊 <@${userId}> размучен.`);
        await logModAction(guildId, 'UNMUTE', msg.author.id, userId, '');
    } catch (err) {
        sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`);
    }
}, { modOnly: true, guildOnly: true });

// --- Варны (с настраиваемым авто-наказанием) ---

registerCommand(['warn', 'варн', 'предупреждение'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    if (!userId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}warn @user причина\``); return; }
    const reason = args.slice(1).join(' ') || 'Не указана';
    const { warn, total } = addWarn(guildId, userId, msg.author.id, reason);

    let text = `⚠️ <@${userId}> получил предупреждение (#${total}). Причина: **${reason}**`;

    // Настраиваемое авто-наказание
    const maxWarns = config.maxWarnsAction?.[guildId] || { count: 5, action: 'ban' };
    const halfWarns = Math.ceil(maxWarns.count / 2);

    if (total >= maxWarns.count) {
        try {
            if (maxWarns.action === 'ban') {
                await banMember(guildId, userId, `Автобан: ${total} предупреждений`);
                text += `\n⛔ **Автобан** за ${total} предупреждений!`;
            } else if (maxWarns.action === 'kick') {
                await kickMember(guildId, userId, `Автокик: ${total} предупреждений`);
                text += `\n👢 **Автокик** за ${total} предупреждений!`;
            } else if (maxWarns.action === 'mute') {
                await muteMember(guildId, userId, 24 * 3600000);
                text += `\n🔇 **Автомут** на 24 часа за ${total} предупреждений!`;
            }
        } catch {}
    } else if (total >= halfWarns) {
        try {
            await muteMember(guildId, userId, 3600000);
            text += `\n🔇 **Автомут** на 1 час за ${total} предупреждения!`;
        } catch {}
    }

    sendMessage(channelId, text);
    await sendDirectMessage(userId, `⚠️ Предупреждение (#${total}). Причина: ${reason}`);
    await logModAction(guildId, 'WARN', msg.author.id, userId, reason);
}, { modOnly: true, guildOnly: true });

registerCommand(['warnlist', 'варны', 'предупреждения'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]) || msg.author.id;
    const warns = getWarns(guildId, userId);
    if (!warns.length) { sendMessage(channelId, `✅ У <@${userId}> нет предупреждений.`); return; }
    const list = warns.map((w, idx) =>
        `**${idx + 1}.** ${new Date(w.timestamp).toLocaleString('ru-RU')} от <@${w.author}>: ${w.reason}`
    ).join('\n');
    sendMessage(channelId, `⚠️ Предупреждения <@${userId}> (${warns.length}):\n${list}`);
}, { guildOnly: true });

registerCommand(['delwarn', 'удалитьварн'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    const index = parseInt(args[1]) - 1;
    if (!userId || isNaN(index)) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}delwarn @user номер\``); return; }
    if (removeWarn(guildId, userId, index)) {
        sendMessage(channelId, `✅ Предупреждение #${index + 1} удалено у <@${userId}>.`);
    } else {
        sendMessage(channelId, '❌ Предупреждение не найдено.');
    }
}, { modOnly: true, guildOnly: true });

registerCommand(['clearwarns', 'снятьварны'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    if (!userId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}clearwarns @user\``); return; }
    clearWarns(guildId, userId);
    sendMessage(channelId, `✅ Все предупреждения <@${userId}> сняты.`);
    await logModAction(guildId, 'CLEARWARNS', msg.author.id, userId, '');
}, { modOnly: true, guildOnly: true });

// --- Очистка ---

registerCommand(['purge', 'cc', 'сс', 'clear', 'очистить'], async (msg, args, channelId, guildId) => {
    const count = Math.min(Math.max(parseInt(args[0]) || 0, 1), 500);
    const targetUser = extractUserId(args[1]); // Опционально: чистить только от конкретного юзера

    try {
        let totalDeleted = 0;
        let remaining = count;
        while (remaining > 0) {
            const batch = Math.min(remaining, 100);
            const messages = await fetchMessages(channelId, batch);
            if (!messages.length) break;

            let ids = messages.map(m => m.id);
            if (targetUser) {
                ids = messages.filter(m => m.author?.id === targetUser).map(m => m.id);
            }
            ids = ids.slice(0, batch);

            if (!ids.length) break;
            const deleted = await bulkDeleteMessages(channelId, ids);
            totalDeleted += deleted;
            remaining -= deleted;
            if (deleted < batch) break;
        }
        sendMessage(channelId, `✅ Удалено **${totalDeleted}** сообщений.`);
        await logModAction(guildId, 'PURGE', msg.author.id, channelId, `${totalDeleted} сообщений${targetUser ? ` от <@${targetUser}>` : ''}`);
    } catch (err) {
        sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`);
    }
}, { modOnly: true, guildOnly: true });

// --- Каналы ---

registerCommand(['lock', 'закрыть'], async (msg, args, channelId, guildId) => {
    const targetChannel = extractChannelId(args[0]) || channelId;
    try {
        await apiPatch(`/channels/${targetChannel}`, {
            permission_overwrites: [{ id: guildId, type: 0, deny: 'SEND_MESSAGES' }]
        });
        sendMessage(channelId, `🔒 Канал <#${targetChannel}> закрыт.`);
        await logModAction(guildId, 'LOCK', msg.author.id, targetChannel, '');
    } catch (err) { sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`); }
}, { modOnly: true, guildOnly: true });

registerCommand(['unlock', 'открыть'], async (msg, args, channelId, guildId) => {
    const targetChannel = extractChannelId(args[0]) || channelId;
    try {
        await apiPatch(`/channels/${targetChannel}`, {
            permission_overwrites: [{ id: guildId, type: 0, allow: 'SEND_MESSAGES' }]
        });
        sendMessage(channelId, `🔓 Канал <#${targetChannel}> открыт.`);
        await logModAction(guildId, 'UNLOCK', msg.author.id, targetChannel, '');
    } catch (err) { sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`); }
}, { modOnly: true, guildOnly: true });

registerCommand(['slowmode', 'медленныйрежим'], async (msg, args, channelId) => {
    const seconds = parseInt(args[0]);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
        sendMessage(channelId, `Используйте: \`${PREFIX}slowmode секунд\` (0-21600)`);
        return;
    }
    try {
        await apiPatch(`/channels/${channelId}`, { rate_limit_per_user: seconds });
        sendMessage(channelId, seconds === 0 ? '✅ Медленный режим отключён.' : `🐢 Медленный режим: **${seconds}с**`);
    } catch (err) { sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`); }
}, { modOnly: true, guildOnly: true });

registerCommand(['say', 'скажи', 'announce'], async (msg, args, channelId) => {
    const targetChannel = extractChannelId(args[0]);
    const text = args.slice(1).join(' ').trim();
    if (!targetChannel || !text) { sendMessage(channelId, `Используйте: \`${PREFIX}say #канал текст\``); return; }
    await sendMessage(targetChannel, text);
    sendMessage(channelId, `✅ Отправлено в <#${targetChannel}>.`);
}, { modOnly: true });

registerCommand(['embed'], async (msg, args, channelId) => {
    const targetChannel = extractChannelId(args[0]);
    const text = args.slice(1).join(' ');
    const parts = text.split('|').map(s => s.trim());

    if (!targetChannel || !parts[0]) {
        sendMessage(channelId, `Используйте: \`${PREFIX}embed #канал заголовок | описание\``);
        return;
    }

    // Простой embed через форматирование
    const title = parts[0];
    const desc = parts[1] || '';
    const embedText = `**${title}**${desc ? `\n\n${desc}` : ''}`;
    await sendMessage(targetChannel, embedText);
    sendMessage(channelId, `✅ Отправлено в <#${targetChannel}>.`);
}, { modOnly: true });

// --- Приватный канал ---

registerCommand(['private', 'приват'], async (msg, args, channelId, guildId) => {
    const nameArg = args[0];
    if (!nameArg) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}private имя @user [@user2]\``); return; }
    const targetUsers = args.slice(1).map(extractUserId).filter(Boolean);
    if (!targetUsers.length) { sendMessage(channelId, 'Укажите хотя бы одного пользователя.'); return; }

    const name = sanitizeChannelName(nameArg);
    const mods = getMods(guildId);

    const overwrites = [
        { id: guildId, type: 0, deny: 'VIEW_CHANNEL' },
        { id: msg.author.id, type: 1, allow: 'VIEW_CHANNEL,SEND_MESSAGES' }
    ];
    targetUsers.forEach(id => overwrites.push({ id, type: 1, allow: 'VIEW_CHANNEL,SEND_MESSAGES' }));
    mods.forEach(id => overwrites.push({ id, type: 1, allow: 'VIEW_CHANNEL,SEND_MESSAGES' }));

    try {
        const channel = await createGuildChannel(guildId, { name, type: 0, permission_overwrites: overwrites });
        sendMessage(channelId, `✅ Приватный канал: <#${channel.id}>`);
        await sendMessage(channel.id, `🔒 Приватный канал для: ${targetUsers.map(u => `<@${u}>`).join(', ')}.`);
    } catch (err) {
        sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`);
    }
}, { modOnly: true, guildOnly: true });

// --- Роли ---

registerCommand(['setrole', 'выдатьроль', 'giverole'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    const roleId = extractRoleId(args[1]);
    if (!userId || !roleId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}setrole @user @role\``); return; }
    try {
        await addRole(guildId, userId, roleId);
        sendMessage(channelId, `✅ Роль <@&${roleId}> выдана <@${userId}>.`);
        await logModAction(guildId, 'SETROLE', msg.author.id, userId, `Роль: ${roleId}`);
    } catch (err) { sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`); }
}, { modOnly: true, guildOnly: true });

registerCommand(['removerole', 'снятьроль', 'takerole'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    const roleId = extractRoleId(args[1]);
    if (!userId || !roleId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}removerole @user @role\``); return; }
    try {
        await removeRole(guildId, userId, roleId);
        sendMessage(channelId, `✅ Роль <@&${roleId}> снята с <@${userId}>.`);
        await logModAction(guildId, 'REMOVEROLE', msg.author.id, userId, `Роль: ${roleId}`);
    } catch (err) { sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`); }
}, { modOnly: true, guildOnly: true });

registerCommand(['massrole', 'массроль'], async (msg, args, channelId, guildId) => {
    const roleId = extractRoleId(args[0]);
    const action = args[1]?.toLowerCase();
    if (!roleId || !['add', 'remove'].includes(action)) {
        sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}massrole @role add/remove\``);
        return;
    }

    sendMessage(channelId, `⏳ Начинаю массовую ${action === 'add' ? 'выдачу' : 'снятие'} роль...`);

    try {
        const memberIds = await fetchGuildMemberIds(guildId);
        let processed = 0;
        for (const memberId of memberIds) {
            try {
                if (action === 'add') await addRole(guildId, memberId, roleId);
                else await removeRole(guildId, memberId, roleId);
                processed++;
            } catch {}
            await sleep(500); // Чтобы не попасть в рейт лимит
        }
        sendMessage(channelId, `✅ Роль ${action === 'add' ? 'выдана' : 'снята'} у **${processed}** участников.`);
    } catch (err) {
        sendMessage(channelId, `❌ Ошибка: ${err.message}`);
    }
}, { modOnly: true, guildOnly: true });

registerCommand(['roles', 'роли'], async (msg, args, channelId, guildId) => {
    const roleMap = await fetchGuildRoles(guildId);
    if (!roleMap.size) { sendMessage(channelId, 'Нет ролей.'); return; }
    const list = [];
    roleMap.forEach((role, id) => {
        const name = typeof role === 'object' ? role.name : role;
        list.push(`<@&${id}> — ${name}`);
    });
    sendMessage(channelId, `**🏷️ Роли сервера (${list.length}):**\n${list.slice(0, 25).join('\n')}${list.length > 25 ? '\n...и ещё' : ''}`);
}, { modOnly: true, guildOnly: true });

// --- Ники ---

registerCommand(['setnick', 'ник', 'setname'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    const newNick = args.slice(1).join(' ').trim();
    if (!userId || !newNick) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}setnick @user новый_ник\``); return; }
    try {
        await apiPatch(`/guilds/${guildId}/members/${userId}`, { nick: newNick });
        sendMessage(channelId, `✏️ Ник <@${userId}> → **${newNick}**`);
    } catch (err) { sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`); }
}, { modOnly: true, guildOnly: true });

registerCommand(['nickreset', 'сбросник'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    if (!userId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}nickreset @user\``); return; }
    try {
        await apiPatch(`/guilds/${guildId}/members/${userId}`, { nick: null });
        sendMessage(channelId, `🔄 Ник <@${userId}> сброшен.`);
    } catch (err) { sendMessage(channelId, `❌ Ошибка: ${err.response?.data?.message || err.message}`); }
}, { modOnly: true, guildOnly: true });

// --- Модераторы ---

registerCommand(['mods', 'модераторы'], async (msg, args, channelId, guildId) => {
    const mods = getMods(guildId);
    if (!mods.length) { sendMessage(channelId, `Список пуст. Используйте \`${getGuildPrefix(guildId)}bootmod\`.`); return; }
    sendMessage(channelId, `**🛡️ Модераторы:**\n${mods.map(id => `<@${id}>`).join('\n')}`);
}, { guildOnly: true });

registerCommand(['setmod', 'сетмод', 'добавитьмод'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    if (!userId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}setmod @user\``); return; }
    addMod(userId, guildId);
    sendMessage(channelId, `✅ <@${userId}> добавлен в модераторы.`);
}, { modOnly: true, guildOnly: true });

registerCommand(['delmod', 'делмод', 'удалитьмод'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]);
    if (!userId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}delmod @user\``); return; }
    removeMod(userId, guildId);
    sendMessage(channelId, `✅ <@${userId}> удалён из модераторов.`);
}, { modOnly: true, guildOnly: true });

registerCommand(['bootmod', 'первыймод'], async (msg, args, channelId, guildId) => {
    const guildMods = Array.isArray(config.mods?.[guildId]) ? config.mods[guildId] : [];
    if (guildMods.length > 0) { sendMessage(channelId, 'Модераторы уже есть.'); return; }
    const userId = extractUserId(args[0]) || msg.author.id;
    addMod(userId, guildId);
    sendMessage(channelId, `✅ <@${userId}> — первый модератор!`);
}, { guildOnly: true });

// Алиасы
registerCommand(['setlog', 'логканал'], async (msg, args, channelId, guildId) => {
    const logChannel = extractChannelId(args[0]);
    if (!logChannel) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}setlog #канал\``); return; }
    config.logChannels[guildId] = logChannel;
    saveConfig();
    sendMessage(channelId, `✅ Лог-канал: <#${logChannel}>`);
}, { modOnly: true, guildOnly: true });

registerCommand(['setmuterole', 'мутроль'], async (msg, args, channelId, guildId) => {
    const roleId = extractRoleId(args[0]);
    if (!roleId) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}setmuterole @role\``); return; }
    if (!config.muteRole) config.muteRole = {};
    config.muteRole[guildId] = roleId;
    saveConfig();
    sendMessage(channelId, `✅ Роль мута: <@&${roleId}>`);
}, { modOnly: true, guildOnly: true });

registerCommand(['automod', 'автомод', 'антиспам'], async (msg, args, channelId, guildId) => {
    const state = (args[0] || '').toLowerCase();
    if (state === 'on' || state === 'вкл' || state === '1') {
        if (!config.automod) config.automod = {};
        config.automod[guildId] = { ...(config.automod[guildId] || {}), antispam: true };
        saveConfig();
        sendMessage(channelId, '✅ Антиспам включён. Спамеры будут замучены на **3 минуты**.');
    } else if (state === 'off' || state === 'выкл' || state === '0') {
        if (config.automod?.[guildId]) config.automod[guildId].antispam = false;
        saveConfig();
        sendMessage(channelId, '✅ Антиспам выключен.');
    } else {
        const current = config.automod?.[guildId]?.antispam ? 'включён' : 'выключен';
        sendMessage(channelId, `Антиспам: **${current}**\nИспользуйте: \`${getGuildPrefix(guildId)}automod on/off\``);
    }
}, { modOnly: true, guildOnly: true });

// --- Инфо команды (модер.) ---

registerCommand(['userinfo', 'инфо', 'юзеринфо'], async (msg, args, channelId, guildId) => {
    const userId = extractUserId(args[0]) || msg.author.id;
    try {
        const member = await fetchMember(guildId, userId);
        if (!member) { sendMessage(channelId, '❌ Не найден.'); return; }
        const username = member.user?.username || `Пользователь`;
        const joined = member.joined_at ? new Date(member.joined_at).toLocaleString('ru-RU') : '—';
        const roles = Array.isArray(member.roles) && member.roles.length
            ? member.roles.map(r => `<@&${r}>`).join(', ') : '—';
        const lvl = getUserLevel(guildId, userId);
        const user = ensureUser(guildId, userId);

        sendMessage(channelId,
`**👁️ <@${userId}> (${username})**
🆔 \`${userId}\`
🏅 Уровень: **${lvl.level}** | XP: ${lvl.xp}/${lvl.needed}
💰 Баланс: **${user.balance}** | ⭐ Реп: **${user.reputation}**
⚠️ Варнов: **${user.warns.length}**
💬 Сообщений: **${lvl.totalMessages}**
📅 На сервере: ${joined}
🏷️ Роли: ${roles}`);
    } catch { sendMessage(channelId, '❌ Ошибка.'); }
}, { modOnly: true, guildOnly: true });

registerCommand(['modlogs', 'модлоги', 'логи'], async (msg, args, channelId, guildId) => {
    const count = Math.min(parseInt(args[0]) || 10, 25);
    const logs = getModLogs(guildId, count);
    if (!logs.length) { sendMessage(channelId, '📋 Лог пуст.'); return; }
    const list = logs.map(l =>
        `\`${new Date(l.timestamp).toLocaleString('ru-RU')}\` **${l.action}** <@${l.moderator}> → <@${l.target}>${l.reason ? ` — ${l.reason}` : ''}`
    ).join('\n');
    sendMessage(channelId, `**📋 Логи (${logs.length}):**\n${list}`);
}, { modOnly: true, guildOnly: true });

registerCommand(['usersearch', 'поискюзера', 'поиск'], async (msg, args, channelId, guildId) => {
    const query = args.join(' ').toLowerCase();
    if (!query) { sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}usersearch имя\``); return; }
    try {
        const res = await apiGet(`/guilds/${guildId}/members?limit=1000`);
        const found = (res.data || []).filter(m => m.user?.username?.toLowerCase().includes(query)).slice(0, 15);
        if (!found.length) { sendMessage(channelId, 'Не найдено.'); return; }
        sendMessage(channelId, `🔍 Найдено:\n${found.map(m => `<@${m.user.id}> — ${m.user.username}`).join('\n')}`);
    } catch { sendMessage(channelId, '❌ Ошибка.'); }
}, { modOnly: true, guildOnly: true });

// --- Приветствие ---

registerCommand(['setwelcome', 'приветканал'], async (msg, args, channelId, guildId) => {
    const targetChannel = extractChannelId(args[0]);
    if (!targetChannel) {
        if (config.welcomeChannels?.[guildId]) {
            delete config.welcomeChannels[guildId];
            saveConfig();
            sendMessage(channelId, '✅ Приветствие отключено.');
        } else {
            sendMessage(channelId, `Используйте: \`${getGuildPrefix(guildId)}setwelcome #канал\``);
        }
        return;
    }
    config.welcomeChannels[guildId] = targetChannel;
    saveConfig();
    sendMessage(channelId, `✅ Приветственный канал: <#${targetChannel}>`);
}, { modOnly: true, guildOnly: true });

// --- Модер панель ---

registerCommand(['modpanel', 'модпанель'], async (msg, args, channelId, guildId) => {
    const p = getGuildPrefix(guildId);
    const automodStatus = config.automod?.[guildId]?.antispam ? '✅' : '❌';
    const logCh = config.logChannels?.[guildId] ? `<#${config.logChannels[guildId]}>` : 'не установлен';
    const muteR = config.muteRole?.[guildId] ? `<@&${config.muteRole[guildId]}>` : 'не установлена';
    const mods = getMods(guildId);
    const maxWarns = config.maxWarnsAction?.[guildId] || { count: 5, action: 'ban' };

    sendMessage(channelId,
`╔══════════════════════════╗
  🛡️ **Модераторская панель**
╚══════════════════════════╝

**Статус:**
🤖 Антиспам: ${automodStatus}
📝 Логи: ${logCh}
🔇 Роль мута: ${muteR}
👮 Модераторов: **${mods.length}**
⚠️ Авто: ${maxWarns.count} варнов → ${maxWarns.action}

**Быстрые команды:**
\`${p}kick/ban/mute/warn @user\`
\`${p}purge число\` | \`${p}lock\` | \`${p}slowmode\`
\`${p}settings\` — все настройки
\`${p}adminhelp\` — полный список`);
}, { modOnly: true, guildOnly: true });

// ═══════════════════════════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════════════════════════

function connect() {
    console.log(`🔌 Подключение к ${GATEWAY_URL}...`);
    ws = new WebSocket(GATEWAY_URL);

    ws.on('open', () => {
        console.log('✅ Бот подключился к Astral!');
        reconnectAttempts = 0;
        ws.send(JSON.stringify({
            op: 2,
            d: {
                token: TOKEN,
                properties: { os: 'linux', browser: 'astra-lib', device: 'astra-lib' },
                intents: 32767
            }
        }));
    });

    ws.on('message', async (data) => {
        let payload;
        try { payload = JSON.parse(data); } catch { return; }

        if (DEBUG) console.log('[WS]', JSON.stringify(payload).slice(0, 300));

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
                console.log(`🤖 Авторизован как: ${user.username} (ID: ${user.id})`);
            }
            return;
        }

        if (payload.t === 'GUILD_CREATE') {
            const guild = payload.d;
            if (guild?.id) {
                guildInfoCache.set(guild.id, guild);
                if (guild.owner_id) guildOwnerCache.set(guild.id, guild.owner_id);
                console.log(`📁 Сервер: ${guild.name} (${guild.id})`);
            }
            return;
        }

        // Member Join
        if (payload.t === 'GUILD_MEMBER_ADD') {
            const member = payload.d;
            const guildId = member?.guild_id;
            const userId = member?.user?.id;
            const username = member?.user?.username || 'Новый участник';

            // Приветствие
            if (guildId && config.welcomeChannels?.[guildId]) {
                const welcomeMsg = config.welcomeMessages?.[guildId]
                    || `🎉 Добро пожаловать, <@${userId}>! 👋\nРады видеть тебя, **${username}**!\nНапиши \`${getGuildPrefix(guildId)}help\` для списка команд.`;
                const finalMsg = welcomeMsg
                    .replace(/{user}/g, `<@${userId}>`)
                    .replace(/{username}/g, username)
                    .replace(/{server}/g, 'сервер');
                sendMessage(config.welcomeChannels[guildId], finalMsg);
            }

            // Авто-роль
            if (guildId && config.autoRoles?.[guildId]) {
                try {
                    await addRole(guildId, userId, config.autoRoles[guildId]);
                } catch (err) {
                    if (DEBUG) console.error('[AutoRole]', err.message);
                }
            }

            guildMembersCache.delete(guildId);
            return;
        }

        // Member Leave
        if (payload.t === 'GUILD_MEMBER_REMOVE') {
            const guildId = payload.d?.guild_id;
            const userId = payload.d?.user?.id;
            const username = payload.d?.user?.username || 'Участник';

            if (guildId && config.leaveChannels?.[guildId]) {
                const leaveMsg = config.leaveMessages?.[guildId]
                    || `👋 **${username}** покинул сервер.`;
                sendMessage(config.leaveChannels[guildId], leaveMsg.replace(/{username}/g, username));
            }

            if (guildId) guildMembersCache.delete(guildId);
            return;
        }

        if (payload.t === 'INTERACTION_CREATE') {
            await handleInteraction(payload.d);
            return;
        }

        if (payload.t === 'MESSAGE_CREATE') {
            await handleMessage(payload.d);
            return;
        }
    });

    ws.on('error', (err) => { console.error('[WS Error]', err.message); });

    ws.on('close', (code, reason) => {
        clearInterval(heartbeatTimer);
        console.log(`[WS Close] Код: ${code}, Причина: ${reason || 'неизвестна'}`);

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 60000);
            reconnectAttempts++;
            console.log(`🔄 Реконнект через ${delay / 1000}с (попытка ${reconnectAttempts})...`);
            setTimeout(connect, delay);
        } else {
            console.error('❌ Превышено максимальное количество попыток.');
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТКА ИНТЕРАКЦИЙ
// ═══════════════════════════════════════════════════════════════

async function handleInteraction(interaction) {
    const customId = interaction.data?.custom_id;
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const channelId = interaction.channel_id;
    const guildId = interaction.guild_id;

    const reply = async (text, ephemeral = false) => {
        await respondInteraction(interaction, text, ephemeral);
    };

    if (!customId) { await reply('Неизвестное действие.', true); return; }

    if (customId === 'menu_help') {
        await reply(`Напишите \`${getGuildPrefix(guildId)}help\` для команд.`, true);
        return;
    }
    if (customId === 'menu_channels') {
        if (!guildId) { await reply('Только на сервере.', true); return; }
        const channels = await fetchGuildChannels(guildId);
        await reply(`📋 Каналы:\n${formatChannelList(channels)}`, true);
        return;
    }
    if (customId === 'menu_private') {
        const fakeMsg = { author: { id: userId }, guild_id: guildId, member: interaction.member };
        if (!(await isModerator(fakeMsg))) { await reply('⛔ Нет прав.', true); return; }
        const name = sanitizeChannelName(`private-${interaction.member?.user?.username || userId}`);
        const mods = getMods(guildId);
        const overwrites = [
            { id: guildId, type: 0, deny: 'VIEW_CHANNEL' },
            { id: userId, type: 1, allow: 'VIEW_CHANNEL,SEND_MESSAGES' }
        ];
        mods.forEach(id => overwrites.push({ id, type: 1, allow: 'VIEW_CHANNEL,SEND_MESSAGES' }));
        try {
            const channel = await createGuildChannel(guildId, { name, type: 0, permission_overwrites: overwrites });
            await reply(`✅ Приватный канал: <#${channel.id}>`, true);
        } catch { await reply('❌ Не удалось создать канал.', true); }
        return;
    }
    await reply('Неизвестная кнопка.', true);
}

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТКА СООБЩЕНИЙ (ИСПРАВЛЕННАЯ)
// ═══════════════════════════════════════════════════════════════

async function handleMessage(msg) {
    const content = msg.content?.trim();
    const channelId = msg.channel_id;
    const guildId = msg.guild_id || msg.guildId;

    if (msg.author?.bot) return;
    if (msg.author?.id === botUserId) return;
    if (!content) return;
    if (!markProcessedMessage(msg.id)) return;

    if (DEBUG) console.log(`[MSG] ${msg.author.username}: ${content}`);

    // === АНТИСПАМ (мут только после превышения лимита, не return после mute) ===
    if (guildId && checkSpam(msg.author.id, guildId)) {
        try {
            const muted = await muteMember(guildId, msg.author.id, SPAM_MUTE_DURATION); // 3 минуты!
            if (muted) {
                sendMessage(channelId, `🔇 <@${msg.author.id}> замучен на **3 минуты** за спам.`);
                await logModAction(guildId, 'AUTO_MUTE', 'BOT', msg.author.id, 'Антиспам — 3 минуты');
            }
        } catch (err) {
            if (DEBUG) console.error('[Antispam mute error]', err.message);
        }
        // Не return — продолжаем обработку сообщения
    }

    // === АНТИССЫЛКИ ===
    if (guildId && config.antilink?.[guildId]) {
        const urlRegex = /(https?:\/\/\S+|discord\.gg\/\S+|discordapp\.com\/invite\/\S+)/gi;
        if (urlRegex.test(content)) {
            // Модераторы могут постить ссылки
            const isMod = await isModerator(msg);
            if (!isMod) {
                try {
                    await apiDelete(`/channels/${channelId}/messages/${msg.id}`);
                } catch (e) {
                    if (DEBUG) console.error('[ANTILINK delete]', e.response?.data || e.message);
                }
                sendMessage(channelId, `🔗 <@${msg.author.id}>, ссылки запрещены на этом сервере!`);
                await logModAction(guildId, 'ANTILINK', 'BOT', msg.author.id, 'Удалена ссылка');
                // Не return — продолжаем обработку
            }
        }
    }

    // === Система уровней ===
    if (guildId) {
        const xpResult = addXp(guildId, msg.author.id);
        if (xpResult.leveledUp) {
            const showLevelUp = config.levelUpMessages?.[guildId] !== false;
            if (showLevelUp) {
                const bonus = xpResult.level * 50;
                changeBalance(guildId, msg.author.id, bonus);
                sendMessage(channelId, `🎉 <@${msg.author.id}> достиг **${xpResult.level}** уровня! (+${bonus} монет)`);
            }
        }
    }

    // === Проверяем команду ===
    const prefix = getGuildPrefix(guildId);
    if (!content.startsWith(prefix)) return;
    const cmd = content.slice(prefix.length).split(/\s+/)[0].toLowerCase();

    // Получаем аргументы команды (без самого названия команды)
    const args = content.slice(prefix.length).trim().split(/\s+/).slice(1);

    const executed = await executeCommand(cmd, msg, args, channelId, guildId);
    if (!executed && DEBUG) {
        console.log(`[CMD] Неизвестная: ${cmd}`);
    }
}

// ═══════════════════════════════════════════════════════════════
// ЗАПУСК
// ═══════════════════════════════════════════════════════════════

function startBot() {
    console.log('═══════════════════════════════════════');
    console.log('  🤖 Astra6 Bot — запуск...');
    console.log(`  📡 API: ${API_BASE}`);
    console.log(`  🔌 Gateway: ${GATEWAY_URL}`);
    console.log(`  📌 Prefix: ${PREFIX}`);
    console.log(`  🐛 Debug: ${DEBUG ? 'ON' : 'OFF'}`);
    console.log(`  📝 Команд: ${commands.size}`);
    console.log('═══════════════════════════════════════');

    connect();

    // Автосохранение
    setInterval(() => {
        saveEconomy(); saveLevels(); saveModLogs(); saveShop(); saveConfig();
    }, 300000);

    // Очистка кешей
    setInterval(() => { guildMembersCache.clear(); }, 600000);

    // Очистка спам-трекера
    setInterval(() => {
        const now = Date.now();
        for (const [key, timestamps] of spamTracker.entries()) {
            const filtered = timestamps.filter(t => now - t < SPAM_INTERVAL * 2);
            if (filtered.length === 0) spamTracker.delete(key);
            else spamTracker.set(key, filtered);
        }
    }, 3000);
}

// Graceful shutdown
function gracefulShutdown(signal) {
    console.log(`\n📴 ${signal}. Сохранение...`);
    saveEconomy(); saveLevels(); saveModLogs(); saveShop(); saveConfig();
    clearInterval(heartbeatTimer);
    reminders.forEach(r => clearTimeout(r.timer));
    // Очищаем таймеры мутов
    for (const timer of activeMutes.values()) clearTimeout(timer);
    if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, 'Shutdown');
    console.log('✅ Сохранено. Выход.');
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ═══════════════════════════════════════════════════════════════
// ПОЛУЧЕНИЕ ТОКЕНА И ЗАПУСК
// ═══════════════════════════════════════════════════════════════

TOKEN = process.env.BOT_TOKEN || process.env.TOKEN;

if (!TOKEN) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question('Введите токен бота: ', (inputToken) => {
        if (!inputToken) { console.error('❌ Токен не введён.'); process.exit(1); }
        rl.close();
        TOKEN = inputToken;
        startBot();
    });
} else {
    startBot();
}