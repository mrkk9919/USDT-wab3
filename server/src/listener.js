import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getContext, initWab3, formatAmount } from './wab3.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const POLL_INTERVAL_MS = 8000;
const MAX_BUFFER = 200;

function apiKey() {
  return (process.env.TRONGRID_API_KEY || '').trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 3) {
  let lastStatus;
  for (let attempt = 0; attempt < retries; attempt++) {
    const headers = { Accept: 'application/json' };
    const key = apiKey();
    if (key) headers['TRON-PRO-API-KEY'] = key;
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      lastStatus = 429;
      await sleep(6000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      throw new Error(`监听轮询失败: HTTP ${res.status}`);
    }
    return res;
  }
  throw new Error(`监听轮询失败: 请求过于频繁 (HTTP ${lastStatus})，可配置 TRONGRID_API_KEY 提升限额`);
}

let tronWeb = null;
let timer = null;
let running = false;
let lastSeenTimestamp = null;
let lastError = null;
let lastPollAt = null;
let lastEventAt = null;
let buffer = [];
let stats = { totalDetected: 0, income: 0, expense: 0, lastTxId: null };

function normalizeHex(raw) {
  if (!raw) return '';
  let hex = String(raw).trim().toLowerCase();
  if (hex.startsWith('0x')) hex = hex.slice(2);
  if (/^[0-9a-f]{40}$/.test(hex)) return `41${hex}`;
  const idx = hex.lastIndexOf('41');
  if (idx >= 0 && hex.length - idx <= 64) {
    hex = hex.slice(idx);
  }
  if (hex.length > 42) hex = hex.slice(hex.length - 42);
  return hex;
}

function toHex(addressBase58) {
  try {
    return tronWeb.address.toHex(addressBase58).toLowerCase();
  } catch {
    return normalizeHex(addressBase58);
  }
}

function toBase58(rawHex) {
  try {
    return tronWeb.address.fromHex(normalizeHex(rawHex));
  } catch {
    return String(rawHex || '');
  }
}

function resolveMonitorAddresses() {
  const configured = (process.env.WAB3_MONITOR_ADDRESSES || '').trim();
  if (configured) {
    return configured.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const owner = (process.env.WAB3_OWNER || '').trim();
  if (owner) return [owner];
  const deploymentFile = path.join(ROOT, 'deployment.json');
  if (fs.existsSync(deploymentFile)) {
    try {
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
      if (deployment.owner) return [deployment.owner];
    } catch {
      /* ignore */
    }
  }
  return [];
}

export function listenerStatus() {
  const context = getContext();
  return {
    running,
    network: context.network.id,
    contract: context.contractAddress,
    monitorAddresses: resolveMonitorAddresses(),
    lastSeenTimestamp,
    pollIntervalMs: POLL_INTERVAL_MS,
    lastPollAt,
    lastEventAt,
    lastError,
    bufferCount: buffer.length,
    stats,
    logs: buffer.slice(),
  };
}

async function pollOnce() {
  const context = getContext();
  if (!context.contractAddress) {
    lastError = '未配置 WAB3_CONTRACT，监听器无法启动';
    return;
  }
  lastPollAt = new Date().toISOString();
  let url =
    `${context.network.fullHost}/v1/contracts/${context.contractAddress}/events` +
    `?event_name=Transfer&limit=100&order_by=block_timestamp,asc`;
  if (lastSeenTimestamp) {
    url += `&min_block_timestamp=${lastSeenTimestamp + 1}`;
  }

  let allEvents = [];
  let fingerprint = null;
  do {
    let pageUrl = url;
    if (fingerprint) pageUrl += `&fingerprint=${fingerprint}`;
    const res = await fetchWithRetry(pageUrl);
    const json = await res.json();
    const events = json.data || [];
    allEvents = allEvents.concat(events);
    fingerprint = (json.meta && json.meta.fingerprint) || null;
    if (fingerprint && allEvents.length < 500) {
      await sleep(400);
    }
  } while (fingerprint && allEvents.length < 500);

  if (allEvents.length > 0) {
    await handleEvents(allEvents);
  }
}

async function handleEvents(events) {
  const monitorAddresses = resolveMonitorAddresses();
  const monitorHex = monitorAddresses.map(toHex).filter(Boolean);

  for (const event of events) {
    if (event._unconfirmed === true) continue;
    const result = event.result || {};
    const fromHex = normalizeHex(result.from || '');
    const toHexValue = normalizeHex(result.to || '');
    const isRelevant =
      monitorHex.length === 0 || monitorHex.includes(fromHex) || monitorHex.includes(toHexValue);
    if (!isRelevant) continue;

    const ts = Number(event.block_timestamp);
    if (ts > (lastSeenTimestamp || 0)) lastSeenTimestamp = ts;
    const direction = monitorHex.includes(toHexValue) ? 'income' : 'expense';
    const value = String(result.value || '0');

    const record = {
      txId: event.transaction_id,
      block: event.block_number,
      timestamp: ts ? new Date(ts).toISOString() : null,
      from: toBase58(fromHex),
      to: toBase58(toHexValue),
      valueRaw: value,
      value: formatAmount(value, 6),
      direction,
      eventIndex: event.event_index,
    };

    buffer.push(record);
    if (buffer.length > MAX_BUFFER) {
      buffer = buffer.slice(-MAX_BUFFER);
    }
    stats.totalDetected += 1;
    stats.lastTxId = record.txId;
    if (direction === 'income') stats.income += 1;
    else stats.expense += 1;
    lastEventAt = new Date().toISOString();
    console.log(
      `[WAB3 监听] ${direction === 'income' ? '收入' : '支出'} ${record.value} WAB3 | ` +
        `${record.from.slice(0, 8)}.. -> ${record.to.slice(0, 8)}.. | TXID: ${record.txId}`
    );
  }
}

export async function startListener() {
  initWab3();
  const context = getContext();
  if (!context.contractAddress) {
    throw new Error('尚未配置 WAB3_CONTRACT，请先部署合约并配置环境变量');
  }
  if (running) return { running: true, message: '监听器已在运行' };
  const { TronWeb } = await import('tronweb');
  tronWeb = new TronWeb({ fullHost: context.network.fullHost });
  running = true;
  lastError = null;
  if (!lastSeenTimestamp) {
    lastSeenTimestamp = Date.now() - 60 * 1000;
  }

  const loop = async () => {
    if (!running) return;
    try {
      await pollOnce();
    } catch (err) {
      lastError = err.message;
      console.error(`[WAB3 监听] 轮询出错: ${err.message}`);
    }
    timer = setTimeout(loop, POLL_INTERVAL_MS);
  };

  try {
    await pollOnce();
  } catch (err) {
    lastError = err.message;
    console.error(`[WAB3 监听] 首次轮询出错: ${err.message}`);
  }
  timer = setTimeout(loop, POLL_INTERVAL_MS);

  return {
    running: true,
    network: context.network.id,
    contract: context.contractAddress,
    monitorAddresses: resolveMonitorAddresses(),
  };
}

export function stopListener() {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return { running: false };
}
