const USDT_ERC20_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDT_DECIMALS = 6;

const RPC_ENDPOINTS = [
  process.env.ETH_RPC_URL,
  'https://ethereum.publicnode.com',
  'https://eth.llamarpc.com',
  'https://rpc.ankr.com/eth',
].filter(Boolean);

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const ETHERSCAN_BASE = process.env.ETHERSCAN_BASE || 'https://api.etherscan.io/api';

async function rpcCall(method, params) {
  let lastError;
  for (const endpoint of RPC_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
      });
      if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || 'RPC error');
      return json.result;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`所有以太坊 RPC 节点均不可用: ${lastError ? lastError.message : 'unknown'}`);
}

function encodeBalanceOf(address) {
  const clean = address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return `0x70a08231${clean}`;
}

export async function getBalance(address) {
  const data = await rpcCall('eth_call', [
    { to: USDT_ERC20_CONTRACT, data: encodeBalanceOf(address) },
    'latest',
  ]);
  const raw = BigInt(data || '0x0').toString();
  return {
    raw,
    formatted: formatUsdt(raw),
    decimals: USDT_DECIMALS,
    found: true,
  };
}

export async function getTransactions(address, limit = 20) {
  if (!ETHERSCAN_API_KEY) {
    const err = new Error(
      '以太坊交易记录需要配置 ETHERSCAN_API_KEY 环境变量（https://etherscan.io 免费注册获取）'
    );
    err.code = 'NO_ETHERSCAN_KEY';
    throw err;
  }
  const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const url =
    `${ETHERSCAN_BASE}?module=account&action=tokentx` +
    `&contractaddress=${USDT_ERC20_CONTRACT}&address=${address}` +
    `&page=1&offset=${max}&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let json;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (json.status === '0') {
    if (/No transactions/i.test(json.message || '')) return [];
    throw new Error(json.message || 'Etherscan 查询失败');
  }
  const items = (json.result || []).map((tx) => ({
    txId: tx.hash,
    from: tx.from,
    to: tx.to,
    valueRaw: tx.value,
    value: formatUsdt(tx.value),
    timestamp: Number(tx.timeStamp) * 1000,
    tokenName: tx.tokenSymbol || 'USDT',
  }));
  return items;
}

function formatUsdt(raw) {
  const rawStr = String(raw || '0');
  if (rawStr.length <= USDT_DECIMALS) {
    const padded = rawStr.padStart(USDT_DECIMALS + 1, '0');
    const intPart = padded.slice(0, -USDT_DECIMALS);
    const fracPart = padded.slice(-USDT_DECIMALS).replace(/0+$/, '');
    return `${intPart}${fracPart ? `.${fracPart}` : ''}`;
  }
  const intPart = rawStr.slice(0, -USDT_DECIMALS);
  const fracPart = rawStr.slice(-USDT_DECIMALS).replace(/0+$/, '');
  return `${intPart}${fracPart ? `.${fracPart}` : ''}`;
}
