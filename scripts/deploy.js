import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TronWeb } from 'tronweb';
import { getEnv } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const abi = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'WAB3Token.abi.json'), 'utf8'));
const bytecode = fs.readFileSync(path.join(ROOT, 'build', 'WAB3Token.bin'), 'utf8');

const env = getEnv();
if (!env.supply || env.supply <= 0) {
  console.error('缺少 INITIAL_SUPPLY 环境变量（部署时指定总发行量，单位: 枚）。示例: INITIAL_SUPPLY=100000000');
  process.exit(1);
}

const tronWeb = new TronWeb({
  fullHost: env.network.fullHost,
  privateKey: env.privateKey,
});

const owner = tronWeb.address.fromPrivateKey(env.privateKey);

console.log('========== 部署 USTD Token ==========');
console.log(`Token     : USTD · TRC-20 · 6 decimals`);
console.log(`网络      : ${env.network.name} (${env.network.fullHost})`);
console.log(`部署者    : ${owner}`);
console.log(`总发行量  : ${env.supply.toLocaleString('en-US')} USTD`);

const tx = await tronWeb.transactionBuilder.createSmartContract({
  feeLimit: 500_000_000,
  callValue: 0,
  userFeePercentage: 30,
  originEnergyLimit: 10_000_000,
  abi: abi,
  bytecode: `0x${bytecode}`,
  parameters: [env.supply],
  name: 'WAB3Token',
  owner_address: tronWeb.address.toHex(owner),
});

const signedTx = await tronWeb.trx.sign(tx);
const result = await tronWeb.trx.sendRawTransaction(signedTx);

if (!result.result) {
  console.error('交易发送失败:', JSON.stringify(result, null, 2));
  process.exit(1);
}

const txID = result.txid;
console.log(`交易 TXID  : ${txID}`);
console.log('等待交易确认，获取合约地址...');

let contractAddress = '';
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  try {
    const info = await tronWeb.trx.getTransactionInfo(txID);
    if (info && info.contract_address) {
      contractAddress = info.contract_address;
      break;
    }
  } catch {
    // 尚未确认，继续等待
  }
}

if (!contractAddress) {
  console.error('合约地址获取超时，请通过区块浏览器确认交易状态。');
  console.error(`TXID: ${txID}`);
  process.exit(1);
}

const contractAddressBase58 = tronWeb.address.fromHex(contractAddress);

const deployment = {
  name: 'USTD',
  symbol: 'USTD',
  decimals: 6,
  network: env.network.id,
  networkName: env.network.name,
  contractAddress: contractAddressBase58,
  owner: owner,
  supply: env.supply,
  supplyRaw: (BigInt(env.supply) * 10n ** 6n).toString(),
  txID,
  explorer: `${env.network.explorer}/#/transaction/${txID}`,
  deployedAt: new Date().toISOString(),
};

fs.writeFileSync(
  path.join(ROOT, 'deployment.json'),
  JSON.stringify(deployment, null, 2)
);

console.log('');
console.log(`contractAddress = ${contractAddressBase58}`);
console.log(`区块浏览器     : ${deployment.explorer}`);
console.log('');
console.log('部署信息已保存到 deployment.json');
console.log('可将该合约地址填入 .env 的 WAB3_CONTRACT，然后启动后端使用查询/转账/监听功能');
