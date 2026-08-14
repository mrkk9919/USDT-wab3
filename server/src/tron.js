const TRONGRID_BASE = process.env.TRONGRID_BASE || 'https://api.trongrid.io';
const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_DECIMALS = 6;

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok) {
      const error = json.error || `HTTP ${res.status}`;
      if (/not activated|does not exist|no account/i.test(error)) {
        return { success: false, error, data: [] };
      }
      throw new Error(`TRONGrid 请求失败: ${error}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export async function getBalance(address) {
  const url = `${TRONGRID_BASE}/v1/accounts/${address}`;
  const json = await getJson(url);
  const data = json.data && json.data[0];
  if (!data) {
    return { raw: '0', formatted: '0', decimals: USDT_DECIMALS, found: false };
  }
  const trc20List = data.trc20 || [];
  let raw = '0';
  for (const item of trc20List) {
    const value = item[USDT_TRC20_CONTRACT];
    if (value !== undefined) {
      raw = value;
      break;
    }
  }
  return {
    raw,
    formatted: formatUsdt(raw),
    decimals: USDT_DECIMALS,
    found: true,
  };
}

export async function getTransactions(address, limit = 20) {
  const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const url =
    `${TRONGRID_BASE}/v1/accounts/${address}/transactions/trc20` +
    `?contract_address=${USDT_TRC20_CONTRACT}&limit=${max}&only_to=false&only_confirmed=true`;
  const json = await getJson(url);
  const items = (json.data || []).map((tx) => ({
    txId: tx.transaction_id,
    from: tx.from,
    to: tx.to,
    valueRaw: tx.value,
    value: formatUsdt(tx.value),
    timestamp: tx.block_timestamp,
    tokenName: tx.token_info ? tx.token_info.symbol : 'USDT',
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
