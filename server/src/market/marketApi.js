import { Router } from 'express';
import {
  getPoolInfo,
  calculateQuote,
  getRecentTrades,
  get24hStats,
  POOL_CONTRACT,
  USTD_CONTRACT,
} from './amm.js';

const router = Router();

// 池子信息
router.get('/pool', async (req, res) => {
  try {
    const tronWeb = req.app.locals.tronWeb;
    if (!tronWeb) return res.status(500).json({ error: 'TronWeb not initialized' });
    const pool = await getPoolInfo(tronWeb);
    res.json({ code: 0, data: { ...pool, poolContract: POOL_CONTRACT, ustdContract: USTD_CONTRACT } });
  } catch (e) {
    res.json({ code: -1, error: e.message });
  }
});

// 报价计算
router.get('/quote', async (req, res) => {
  try {
    const { type, amount } = req.query;
    if (!type || !amount) return res.json({ code: -1, error: 'type and amount required' });
    const tronWeb = req.app.locals.tronWeb;
    const pool = await getPoolInfo(tronWeb);
    // amount 单位：buy 时是 TRX(sun)，sell 时是 USTD(raw)
    const rawAmount = type === 'buy' ? Number(amount) * 1e6 : Number(amount) * 1e6;
    const quote = calculateQuote(type, rawAmount, pool);
    res.json({ code: 0, data: quote });
  } catch (e) {
    res.json({ code: -1, error: e.message });
  }
});

// 成交历史
router.get('/trades', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json({ code: 0, data: getRecentTrades(limit) });
});

// 24h 统计
router.get('/stats', (req, res) => {
  res.json({ code: 0, data: get24hStats() });
});

// 合约地址
router.get('/contracts', (req, res) => {
  res.json({ code: 0, data: { pool: POOL_CONTRACT, ustd: USTD_CONTRACT } });
});

export default router;
