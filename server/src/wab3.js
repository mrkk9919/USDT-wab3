import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
// tronweb 改为动态导入，避免模块加载阶段卡住导致服务器无法启动

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const NETWORKS = {
  mainnet: { fullHost: 'https://api.trongrid.io', name: 'Mainnet' },
  shasta: { fullHost: 'https://api.shasta.trongrid.io', name: 'Shasta Testnet' },
  nile: { fullHost: 'https://nile.trongrid.io', name: 'Nile Testnet' },
};

function loadNetwork() {
  const id = (process.env.TRON_NETWORK || 'shasta').toLowerCase();
  const network = NETWORKS[id] || NETWORKS.shasta;
  return { id: Object.keys(NETWORKS).includes(id) ? id : 'shasta', ...network };
}

function loadContract() {
  const contractAddress = (process.env.WAB3_CONTRACT || '').trim();
  if (!contractAddress) {
    const deploymentFile = path.join(ROOT, 'deployment.json');
    if (fs.existsSync(deploymentFile)) {
      try {
        const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
        return deployment.contractAddress;
      } catch {
        /* ignore */
      }
    }
  }
  return contractAddress || '';
}

let tronWeb;
let network = loadNetwork();
let contractAddress = loadContract();

export async function initWab3() {
  network = loadNetwork();
  contractAddress = loadContract();
  if (!tronWeb || tronWeb.fullNode.host !== network.fullHost) {
    const { TronWeb } = await import('tronweb');
    const pk = (process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || '').trim();
    if (pk) {
      tronWeb = new TronWeb({ fullHost: network.fullHost, privateKey: pk });
    } else {
      const temp = new TronWeb({ fullHost: network.fullHost });
      const generated = await temp.createAccount();
      tronWeb = new TronWeb({ fullHost: network.fullHost, privateKey: generated.privateKey });
    }
  }
  return { network, contractAddress };
}

export function getContext() {
  return { network, contractAddress };
}

export function isConfigured() {
  return Boolean(contractAddress);
}

export async function getTokenInfo() {
  initWab3();
  if (!contractAddress) {
    return {
      configured: false,
      contract: '',
      network: network.id,
      message: '尚未配置 WAB3_CONTRACT，请先部署合约并配置环境变量',
    };
  }
  const contract = await getContract();
  const name = await contract.name().call();
  const symbol = await contract.symbol().call();
  const decimals = Number(await contract.decimals().call());
  const totalSupply = await contract.totalSupply().call();
  return {
    configured: true,
    contract: contractAddress,
    network: network.id,
    networkName: network.name,
    name,
    symbol,
    decimals: Number(decimals),
    totalSupplyRaw: totalSupply.toString(),
    totalSupply: formatAmount(totalSupply.toString(), Number(decimals)),
  };
}

export async function getBalance(address) {
  initWab3();
  if (!contractAddress) throw Object.assign(new Error('尚未配置 WAB3_CONTRACT'), { code: 'NOT_CONFIGURED' });
  const contract = await getContract();
  const decimals = await getDecimals();
  const balance = await contract.balanceOf(address).call();
  return {
    contract: contractAddress,
    network: network.id,
    address,
    raw: balance.toString(),
    formatted: formatAmount(balance.toString(), decimals),
  };
}

export async function getTransfers(address, limit = 20) {
  initWab3();
  if (!contractAddress) throw Object.assign(new Error('尚未配置 WAB3_CONTRACT'), { code: 'NOT_CONFIGURED' });
  const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const url =
    `${network.fullHost}/v1/accounts/${address}/transactions/trc20` +
    `?contract_address=${contractAddress}&limit=${max}&only_confirmed=true`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`TRONGrid 请求失败: HTTP ${res.status}`);
  const json = await res.json();
  const decimals = await getDecimals();
  return (json.data || []).map((tx) => ({
    txId: tx.transaction_id,
    from: tx.from,
    to: tx.to,
    valueRaw: tx.value,
    value: formatAmount(tx.value, decimals),
    timestamp: tx.block_timestamp,
    tokenName: tx.token_info ? tx.token_info.symbol : 'WAB3',
  }));
}

let decimalsCache;

function loadTokenAbi() {
  const abiPath = path.join(ROOT, 'build', 'WAB3Token.abi.json');
  if (fs.existsSync(abiPath)) {
    try {
      return JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    } catch {
      return [];
    }
  }
  return [];
}

async function getContract() {
  if (!tronWeb) await initWab3();
  const abi = loadTokenAbi();
  if (abi.length === 0) {
    throw new Error('缺少合约 ABI，请先运行编译脚本: cd scripts && npm run compile');
  }
  return tronWeb.contract(abi, contractAddress);
}

async function getDecimals() {
  if (decimalsCache !== undefined) return decimalsCache;
  try {
    const contract = await getContract();
    decimalsCache = Number(await contract.decimals().call());
  } catch {
    decimalsCache = 6;
  }
  return decimalsCache;
}

export function formatAmount(raw, decimals = 6) {
  const rawStr = String(raw || '0');
  const pad = Math.max(decimals, 0);
  if (rawStr.length <= pad) {
    const padded = rawStr.padStart(pad + 1, '0');
    const intPart = padded.slice(0, -pad);
    const fracPart = padded.slice(-pad).replace(/0+$/, '');
    return `${intPart}${fracPart ? `.${fracPart}` : ''}`;
  }
  const intPart = rawStr.slice(0, -pad);
  const fracPart = rawStr.slice(-pad).replace(/0+$/, '');
  return `${intPart}${fracPart ? `.${fracPart}` : ''}`;
}

export async function transfer(to, amount) {
  await initWab3();
  if (!contractAddress) {
    throw Object.assign(new Error('尚未配置 WAB3_CONTRACT'), { code: 'NOT_CONFIGURED' });
  }
  const pk = (process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || '').trim();
  if (!pk) {
    throw Object.assign(
      new Error('未配置 DEPLOYER_PRIVATE_KEY，无法签名并广播 WAB3 转账'),
      { code: 'NO_DEPLOYER_KEY' }
    );
  }
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new Error('无效的转账金额');
  }
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(to)) {
    throw new Error('无效的收款 TRON 地址');
  }

  const decimals = await getDecimals();
  const rawValue = BigInt(Math.round(amountNum * 10 ** decimals));
  const from = tronWeb.address.fromPrivateKey(pk);

  const txObject = await tronWeb.transactionBuilder.triggerSmartContract(
    contractAddress,
    'transfer(address,uint256)',
    { feeLimit: 500_000_000, callValue: 0 },
    [
      { type: 'address', value: to },
      { type: 'uint256', value: rawValue.toString() },
    ],
    tronWeb.address.toHex(from)
  );

  const signedTx = await tronWeb.trx.sign(txObject.transaction, pk);
  const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);
  if (!broadcast.result) {
    throw new Error(`交易广播失败: ${broadcast.code || 'unknown'} ${broadcast.message || ''}`);
  }

  return {
    txID: broadcast.txid,
    from,
    to,
    amount: formatAmount(rawValue.toString(), decimals),
    rawValue: rawValue.toString(),
    contract: contractAddress,
    network: network.id,
    broadcast: true,
  };
}
