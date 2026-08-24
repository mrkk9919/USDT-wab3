import express from 'express';
import cors from 'cors';
import { validateAddress } from './address.js';
import * as tron from './tron.js';
import * as eth from './eth.js';
import * as wab3 from './wab3.js';
import * as price from './price.js';
import { isValidTronAddress } from './address.js';
import { startListener, stopListener, listenerStatus } from './listener.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));

const NETWORKS = [
  {
    id: 'tron',
    name: 'TRON (TRC20)',
    contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    decimals: 6,
    supportedTx: true,
  },
  {
    id: 'eth',
    name: 'Ethereum (ERC20)',
    contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6,
    supportedTx: true,
  },
];

app.get('/api/networks', (_req, res) => {
  res.json({ networks: NETWORKS });
});

app.get('/api/balance', async (req, res) => {
  try {
    const { network, address } = req.query;
    validateAddress(network, address);
    const result =
      network === 'tron'
        ? await tron.getBalance(address)
        : await eth.getBalance(address);
    res.json({ network, address, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const { network, address, limit } = req.query;
    validateAddress(network, address);
    const result =
      network === 'tron'
        ? await tron.getTransactions(address, limit)
        : await eth.getTransactions(address, limit);
    res.json({ network, address, count: result.length, transactions: result });
  } catch (err) {
    const status = err.code === 'NO_ETHERSCAN_KEY' ? 501 : 400;
    res.status(status).json({ error: err.message });
  }
});

app.get('/api/wab3/info', async (_req, res) => {
  const p = price.getPrice();
  const ctx = wab3.getContext();
  // 直接返回已知合约信息 + 价格，避免链上查询阻塞
  const supply = 100000000; // 1 亿 USTD（部署时指定）
  res.json({
    configured: Boolean(ctx.contractAddress),
    contract: ctx.contractAddress || '',
    network: ctx.network.id,
    networkName: ctx.network.name,
    name: 'USTD',
    symbol: 'USTD',
    decimals: 6,
    totalSupply: String(supply),
    totalSupplyRaw: String(supply * 10 ** 6),
    price: p.price,
    currency: p.currency,
    changePercent24h: p.changePercent24h,
    marketCap: supply * p.price,
  });
});

app.get('/api/wab3/price', (_req, res) => {
  res.json(price.getPrice());
});

app.post('/api/wab3/price', (req, res) => {
  try {
    const { price: newPrice } = req.body || {};
    const result = price.setPrice(newPrice);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/wab3/price/history', (req, res) => {
  const limit = req.query.limit;
  res.json({ history: price.getPriceHistory(limit) });
});

app.get('/api/wab3/balance', async (req, res) => {
  try {
    const { address } = req.query;
    if (!isValidTronAddress(address)) {
      return res.status(400).json({ error: '无效的 TRON 地址' });
    }
    const result = await wab3.getBalance(address);
    res.json(result);
  } catch (err) {
    res.status(err.code === 'NOT_CONFIGURED' ? 501 : 400).json({ error: err.message });
  }
});

app.get('/api/wab3/transfers', async (req, res) => {
  try {
    const { address, limit } = req.query;
    if (!isValidTronAddress(address)) {
      return res.status(400).json({ error: '无效的 TRON 地址' });
    }
    const result = await wab3.getTransfers(address, limit);
    res.json({ address, count: result.length, transactions: result });
  } catch (err) {
    res.status(err.code === 'NOT_CONFIGURED' ? 501 : 400).json({ error: err.message });
  }
});

app.get('/api/wab3/listener', (_req, res) => {
  res.json(listenerStatus());
});

app.post('/api/wab3/transfer', async (req, res) => {
  try {
    const { to, amount } = req.body || {};
    const result = await wab3.transfer(to, amount);
    res.json(result);
  } catch (err) {
    const status = err.code === 'NOT_CONFIGURED' || err.code === 'NO_DEPLOYER_KEY' ? 501 : 400;
    res.status(status).json({ error: err.message });
  }
});

app.post('/api/wab3/listener/start', async (_req, res) => {
  try {
    const result = await startListener();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/wab3/listener/stop', (_req, res) => {
  res.json(stopListener());
});

app.use((_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.listen(PORT, () => {
  console.log(`USDT Explorer API listening on http://localhost:${PORT}`);
  console.log('价格 API 立即可用，合约相关 API 首次调用时自动初始化');
  // wab3 按需初始化，避免启动时阻塞事件循环
});
