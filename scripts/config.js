import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

export const NETWORKS = {
  mainnet: {
    id: 'mainnet',
    name: 'Mainnet',
    fullHost: 'https://api.trongrid.io',
    explorer: 'https://tronscan.org',
  },
  shasta: {
    id: 'shasta',
    name: 'Shasta Testnet',
    fullHost: 'https://api.shasta.trongrid.io',
    explorer: 'https://shasta.tronscan.org',
  },
  nile: {
    id: 'nile',
    name: 'Nile Testnet',
    fullHost: 'https://nile.trongrid.io',
    explorer: 'https://nile.tronscan.org',
  },
};

export function resolveNetwork(network) {
  const id = (network || '').toLowerCase();
  if (!NETWORKS[id]) {
    throw new Error(
      `无效的网络: "${network}"。可选值: ${Object.keys(NETWORKS).join(' / ')}`
    );
  }
  return NETWORKS[id];
}

export function getEnv(required = true) {
  const privateKey = (process.env.DEPLOYER_PRIVATE_KEY || '').trim();
  if (required && !privateKey) {
    throw new Error('缺少 DEPLOYER_PRIVATE_KEY 环境变量，请先在项目根目录 .env 中配置');
  }
  return {
    privateKey,
    contractAddress: (process.env.WAB3_CONTRACT || '').trim(),
    network: resolveNetwork(process.env.TRON_NETWORK || 'shasta'),
    ownerAddress: (process.env.WAB3_OWNER || '').trim(),
    supply: Number(process.env.INITIAL_SUPPLY || 0),
  };
}
