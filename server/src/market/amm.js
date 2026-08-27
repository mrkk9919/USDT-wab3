import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');

export const POOL_CONTRACT = 'THYp7d4u4WLi7kJGEXqyytpcVdhYgCVYRN';
export const USTD_CONTRACT = 'TXQs7gk18BqwTeozuwBiUfZeCDARMBitkL';
export const FEE_RATE = 0.003; // 0.3%

let poolAbi = null;
try {
  poolAbi = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'UstdAmmPool.abi.json'), 'utf8'));
} catch (e) {
  console.warn('AMM ABI not found:', e.message);
}

export async function getPoolInfo(tronWeb) {
  if (!poolAbi) throw new Error('AMM ABI not loaded');
  const contract = await tronWeb.contract(poolAbi, POOL_CONTRACT);
  const [reserveUstd, reserveTrx, totalLp] = await Promise.all([
    contract.reserveUstd().call(),
    contract.reserveTrx().call(),
    contract.totalLp().call(),
  ]);
  const ustdNum = Number(reserveUstd) / 1e6;
  const trxNum = Number(reserveTrx) / 1e6;
  const priceTrxPerUstd = ustdNum > 0 ? trxNum / ustdNum : 0;
  const priceUsdPerUstd = 0.99; // 固定价格锚定
  return {
    reserveUstd: reserveUstd.toString(),
    reserveTrx: reserveTrx.toString(),
    reserveUstdFormatted: ustdNum.toFixed(2),
    reserveTrxFormatted: trxNum.toFixed(2),
    totalLp: totalLp.toString(),
    priceTrxPerUstd,
    priceUsdPerUstd,
    tvlUsd: ustdNum * priceUsdPerUstd + trxNum * 0.12, // TRX ~ $0.12
  };
}

export function calculateQuote(type, amount, poolInfo) {
  const amountNum = Number(amount);
  if (!amountNum || amountNum <= 0) return { output: '0', priceImpact: 0 };

  const reserveUstd = Number(poolInfo.reserveUstd);
  const reserveTrx = Number(poolInfo.reserveTrx);
  const k = reserveUstd * reserveTrx;
  const feeMultiplier = 1 - FEE_RATE;

  let output;
  if (type === 'buy') {
    // TRX -> USTD, amount in TRX (sun)
    const inputAfterFee = amountNum * feeMultiplier;
    const newTrx = reserveTrx + inputAfterFee;
    const newUstd = k / newTrx;
    output = reserveUstd - newUstd;
  } else {
    // USTD -> TRX, amount in USTD (raw)
    const inputAfterFee = amountNum * feeMultiplier;
    const newUstd = reserveUstd + inputAfterFee;
    const newTrx = k / newUstd;
    output = reserveTrx - newTrx;
  }

  const priceImpact = output > 0 ? ((amountNum / output - 1) * 100) : 0;
  return {
    output: output.toString(),
    outputFormatted: type === 'buy' ? (output / 1e6).toFixed(4) : (output / 1e6).toFixed(4),
    priceImpact: Math.abs(priceImpact),
  };
}

// 内存存储成交记录（生产环境用数据库）
const trades = [];

export function addTrade(txHash, user, isBuy, amountIn, amountOut, price) {
  trades.unshift({
    id: trades.length + 1,
    txHash,
    user,
    isBuy,
    amountIn: amountIn.toString(),
    amountOut: amountOut.toString(),
    price,
    ts: Date.now(),
  });
  if (trades.length > 100) trades.pop();
}

export function getRecentTrades(limit = 20) {
  return trades.slice(0, limit);
}

export function get24hStats() {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const dayTrades = trades.filter(t => t.ts >= dayAgo);
  const volumeUstd = dayTrades.reduce((sum, t) => {
    return sum + (t.isBuy ? Number(t.amountOut) : Number(t.amountIn));
  }, 0);
  return {
    volumeUstd: (volumeUstd / 1e6).toFixed(2),
    volumeUsd: (volumeUstd / 1e6 * 0.99).toFixed(2),
    tradeCount: dayTrades.length,
  };
}
