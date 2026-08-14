import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'contract', 'WAB3Token.sol');
const BUILD_DIR = path.join(ROOT, 'build');

const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
const contractName = 'WAB3Token';

const input = {
  language: 'Solidity',
  sources: {
    'WAB3Token.sol': { content: source },
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

const compiled = output.contracts['WAB3Token.sol'][contractName];
if (!compiled) {
  console.error('编译失败：未找到合约输出');
  process.exit(1);
}

fs.mkdirSync(BUILD_DIR, { recursive: true });

fs.writeFileSync(
  path.join(BUILD_DIR, 'WAB3Token.abi.json'),
  JSON.stringify(compiled.abi, null, 2)
);
fs.writeFileSync(
  path.join(BUILD_DIR, 'WAB3Token.bin'),
  compiled.evm.bytecode.object
);
fs.writeFileSync(
  path.join(BUILD_DIR, 'contract.json'),
  JSON.stringify(compiled, null, 2)
);

console.log('========== WAB3Token 编译成功 ==========');
console.log(`合约文件 : ${CONTRACT_PATH}`);
console.log(`ABI      : build/WAB3Token.abi.json`);
console.log(`Bytecode : build/WAB3Token.bin`);
console.log(`Bytecode 长度: ${(compiled.evm.bytecode.object.length - 2) / 2} bytes`);
console.log(`ABI 方法数: ${compiled.abi.length}`);

const metadata = JSON.parse(compiled.metadata);
const solidityVersion = metadata.compiler.version;
console.log(`solc 版本: ${solidityVersion}`);

const abiMethods = compiled.abi
  .filter((item) => item.type === 'function')
  .map((item) => `${item.name}(${item.inputs.map((i) => i.type).join(',')})`);
console.log('接口:');
for (const m of abiMethods) {
  console.log(`  - ${m}`);
}
