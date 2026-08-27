import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TronWeb } from 'tronweb';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const USTD_CONTRACT = process.env.WAB3_CONTRACT || 'TXQs7gk18BqwTeozuwBiUfZeCDARMBitkL';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const FULL_HOST = process.env.TRON_NETWORK === 'mainnet'
  ? 'https://api.trongrid.io'
  : 'https://api.shasta.trongrid.io';

if (!PRIVATE_KEY) {
  console.error('缺少 DEPLOYER_PRIVATE_KEY');
  process.exit(1);
}

const tronWeb = new TronWeb({
  fullHost: FULL_HOST,
  privateKey: PRIVATE_KEY,
});

const owner = tronWeb.address.fromPrivateKey(PRIVATE_KEY);
console.log('========== 部署 UstdAmmPool ==========');
console.log(`网络      : ${FULL_HOST}`);
console.log(`部署者    : ${owner}`);
console.log(`USTD合约  : ${USTD_CONTRACT}`);

// 检查部署者余额
const balance = await tronWeb.trx.getBalance(owner);
console.log(`TRX余额   : ${balance / 1_000_000} TRX`);
if (balance < 50_000_000) {
  console.error('TRX余额不足，需要至少50 TRX');
  process.exit(1);
}

const abi = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'UstdAmmPool.abi.json'), 'utf8'));
const bytecode = fs.readFileSync(path.join(ROOT, 'build', 'UstdAmmPool.bin'), 'utf8');

// 构造参数：USTD合约地址（hex格式）
const ustdHex = tronWeb.address.toHex(USTD_CONTRACT);

const tx = await tronWeb.transactionBuilder.createSmartContract({
  feeLimit: 500_000_000,
  callValue: 0,
  userFeePercentage: 30,
  originEnergyLimit: 10_000_000,
  abi: abi,
  bytecode: `0x${bytecode}`,
  parameters: [ustdHex],
  name: 'UstdAmmPool',
  owner_address: tronWeb.address.toHex(owner),
});

const signedTx = await tronWeb.trx.sign(tx);
const result = await tronWeb.trx.sendRawTransaction(signedTx);

if (!result.result) {
  console.error('交易发送失败:', JSON.stringify(result, null, 2));
  process.exit(1);
}

const txID = result.txid;
console.log(`交易 TXID : ${txID}`);
console.log('等待交易确认...');

let contractAddress = '';
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  try {
    const info = await tronWeb.trx.getTransactionInfo(txID);
    if (info.contractAddress) {
      contractAddress = tronWeb.address.fromHex(info.contractAddress);
      break;
    }
    if (info.receipt && info.receipt.result === 'FAILED') {
      console.error('交易失败:', JSON.stringify(info, null, 2));
      process.exit(1);
    }
  } catch (e) {
    // 继续等待
  }
  process.stdout.write('.');
}

if (!contractAddress) {
  console.error('\n未能获取合约地址，请稍后在 TronScan 查看');
  process.exit(1);
}

console.log(`\n合约地址  : ${contractAddress}`);
console.log(`TronScan  : https://shasta.tronscan.org/#/contract/${contractAddress}`);

// 保存部署信息
const deployInfo = {
  ammPoolContract: contractAddress,
  ustdContract: USTD_CONTRACT,
  network: FULL_HOST,
  deployer: owner,
  txID,
  deployedAt: new Date().toISOString(),
};
fs.writeFileSync(
  path.join(ROOT, 'amm-deploy.json'),
  JSON.stringify(deployInfo, null, 2)
);
console.log('部署信息已保存到 amm-deploy.json');
