import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'contract', 'UstdAmmPool.sol');
const BUILD_DIR = path.join(ROOT, 'build');

const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
const contractName = 'UstdAmmPool';

const input = {
  language: 'Solidity',
  sources: {
    'UstdAmmPool.sol': { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'istanbul',
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.opcodes', 'metadata'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const errors = output.errors.filter((e) => e.severity === 'error');
  const warnings = output.errors.filter((e) => e.severity === 'warning');
  for (const w of warnings) {
    console.warn(`[warning] ${w.formattedMessage}`);
  }
  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`[error] ${e.formattedMessage}`);
    }
    process.exit(1);
  }
}

const compiled = output.contracts['UstdAmmPool.sol'][contractName];
if (!compiled) {
  console.error('编译失败：未找到合约输出');
  process.exit(1);
}

fs.mkdirSync(BUILD_DIR, { recursive: true });
fs.writeFileSync(
  path.join(BUILD_DIR, 'UstdAmmPool.abi.json'),
  JSON.stringify(compiled.abi, null, 2)
);
fs.writeFileSync(
  path.join(BUILD_DIR, 'UstdAmmPool.bin'),
  compiled.evm.bytecode.object
);

console.log('========== UstdAmmPool 编译成功 ==========');
console.log(`ABI      : build/UstdAmmPool.abi.json`);
console.log(`Bytecode : build/UstdAmmPool.bin`);
console.log(`Bytecode 长度: ${(compiled.evm.bytecode.object.length - 2) / 2} bytes`);
console.log(`ABI 方法数: ${compiled.abi.length}`);

const abiMethods = compiled.abi
  .filter((item) => item.type === 'function')
  .map((item) => `${item.name}(${item.inputs.map((i) => i.type).join(',')})`);
console.log('接口:');
for (const m of abiMethods) {
  console.log(`  - ${m}`);
}
