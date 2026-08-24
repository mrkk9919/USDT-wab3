import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const MAX_HISTORY = 288; // 24h * 12 (5min interval) — enough for 24h stats
const PRICE_FILE = path.join(ROOT, 'price-state.json');

let currentPrice = Number(process.env.WAB3_INITIAL_PRICE) || 1.0;
let priceHistory = [];
let lastUpdateAt = null;

function loadState() {
  if (fs.existsSync(PRICE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PRICE_FILE, 'utf8'));
      if (typeof data.price === 'number' && data.price > 0) {
        currentPrice = data.price;
      }
      if (Array.isArray(data.history)) {
        priceHistory = data.history.slice(-MAX_HISTORY);
      }
      if (data.lastUpdateAt) {
        lastUpdateAt = data.lastUpdateAt;
      }
    } catch {
      /* ignore corrupt state */
    }
  }
  if (priceHistory.length === 0) {
    const now = Date.now();
    priceHistory.push({ price: currentPrice, timestamp: now });
    lastUpdateAt = now;
  }
}

function saveState() {
  try {
    fs.writeFileSync(
      PRICE_FILE,
      JSON.stringify({ price: currentPrice, history: priceHistory, lastUpdateAt }, null, 2)
    );
  } catch {
    /* non-fatal */
  }
}

loadState();

export function getPrice() {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const recent = priceHistory.filter((p) => p.timestamp >= dayAgo);
  const price24hAgo = recent.length > 0 ? recent[0].price : currentPrice;
  const high24h = recent.length > 0 ? Math.max(...recent.map((p) => p.price)) : currentPrice;
  const low24h = recent.length > 0 ? Math.min(...recent.map((p) => p.price)) : currentPrice;
  const change24h = currentPrice - price24hAgo;
  const changePercent24h = price24hAgo > 0 ? (change24h / price24hAgo) * 100 : 0;

  return {
    price: currentPrice,
    currency: 'USD',
    lastUpdateAt,
    change24h: round(change24h, 6),
    changePercent24h: round(changePercent24h, 2),
    high24h: round(high24h, 6),
    low24h: round(low24h, 6),
    price24hAgo: round(price24hAgo, 6),
  };
}

export function setPrice(newPrice) {
  const price = Number(newPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('无效的价格，必须为大于 0 的数字');
  }
  if (price > 1_000_000) {
    throw new Error('价格超出合理范围');
  }

  currentPrice = round(price, 6);
  lastUpdateAt = Date.now();
  priceHistory.push({ price: currentPrice, timestamp: lastUpdateAt });
  if (priceHistory.length > MAX_HISTORY) {
    priceHistory = priceHistory.slice(-MAX_HISTORY);
  }
  saveState();
  return getPrice();
}

export function getPriceHistory(limit = 48) {
  const max = Math.min(Math.max(Number(limit) || 48, 1), MAX_HISTORY);
  return priceHistory.slice(-max);
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}
