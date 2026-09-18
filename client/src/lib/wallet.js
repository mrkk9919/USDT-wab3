// 多钱包统一接入层：支持 TronLink / OKX(欧易) / Binance(币安) Web3 / MetaMask
// 基于 EIP-6963 钱包发现标准 + TRON 原生 provider 检测

const listeners = new Set();
let state = {
  connected: false,
  name: '',
  address: '',
  icon: '',
  canSignTron: false,
  tronWeb: null,
};

function emit() {
  listeners.forEach((l) => l(state));
}
export function subscribe(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}
export function getState() {
  return state;
}
export function update(partial) {
  state = { ...state, ...partial };
  emit();
}
export function disconnect() {
  update({ connected: false, name: '', address: '', icon: '', canSignTron: false, tronWeb: null });
}

// ---- EIP-6963 钱包发现 ----
let announced = [];
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e) => {
    const d = e.detail;
    if (d && d.info && !announced.find((a) => a.info.uuid === d.info.uuid)) {
      announced.push(d);
    }
  });
  // 请求所有已安装钱包公告
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

function findAnnounced(re) {
  return announced.find(
    (a) => re.test(a.info.rdns || '') || re.test(a.info.name || '')
  );
}

// ---- 可用钱包列表 ----
export function getAvailableWallets() {
  const list = [];
  // TronLink（TRON 原生，支持交易签名）
  if (
    (typeof window !== 'undefined' && (window.tronLink || (window.tronWeb && window.tronWeb.ready)))
  ) {
    list.push({
      id: 'tronlink',
      name: 'TronLink',
      icon: '🔗',
      badge: 'TRON',
      desc: 'TRON 原生钱包，支持买卖交易签名',
    });
  }
  // OKX / 欧易（多链，切到 TRON 后可交易）
  const okxA = findAnnounced(/okx/i);
  if (typeof window !== 'undefined' && (window.okxwallet || okxA)) {
    list.push({
      id: 'okx',
      name: 'OKX Wallet',
      icon: '🟦',
      badge: '多链',
      desc: '欧易 Web3 钱包（在钱包内切到 Shasta/TRON 可签名交易）',
    });
  }
  // Binance / 币安 Web3
  const bnA = findAnnounced(/binance/i);
  if (typeof window !== 'undefined' && (window.binanceWeb3Wallet || bnA)) {
    list.push({
      id: 'binance',
      name: 'Binance Web3',
      icon: '🟨',
      badge: '币安',
      desc: '币安 Web3 钱包（EVM 连接，TRON 交易请用 TronLink/OKX）',
    });
  }
  // MetaMask / 其他 EVM
  const mmA = findAnnounced(/metamask/i);
  if (typeof window !== 'undefined' && (window.ethereum || mmA)) {
    list.push({
      id: 'metamask',
      name: 'MetaMask',
      icon: '🦊',
      badge: 'EVM',
      desc: '以太坊系列钱包（仅连接，TRON 交易请用 TronLink/OKX）',
    });
  }
  return list;
}

// 连接后检测 TRON 原生 provider（OKX/币安切到 TRON 后会注入 tronWeb）
function detectTronProvider() {
  const tw = window.tronWeb;
  const addr = tw && tw.defaultAddress ? tw.defaultAddress.base58 : '';
  return { tronWeb: tw || null, address: addr, canSign: Boolean(addr) };
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- 连接指定钱包 ----
export async function connectWallet(id) {
  if (id === 'tronlink') {
    const tw = window.tronWeb;
    if (!tw) throw new Error('未检测到 TronLink，请先安装或刷新页面');
    const accts = await tw.request({ method: 'tron_requestAccounts' });
    const addr = (accts && accts[0]) || tw.defaultAddress.base58;
    update({ connected: true, name: 'TronLink', icon: '🔗', address: addr, canSignTron: true, tronWeb: tw });
    return { name: 'TronLink', address: addr, canSign: true };
  }

  if (id === 'okx') {
    const okx = window.okxwallet;
    let evmAddr = '';
    if (okx) {
      try {
        const r = await okx.request({ method: 'eth_requestAccounts' });
        evmAddr = (r && r[0]) || '';
      } catch (e) { /* 用户拒绝或 EVM 不可用，继续尝试 TRON */ }
    }
    await wait(1000); // 等待 OKX 注入 TRON provider
    const tron = detectTronProvider();
    const addr = tron.address || evmAddr;
    update({
      connected: true,
      name: 'OKX Wallet',
      icon: '🟦',
      address: addr,
      canSignTron: tron.canSign,
      tronWeb: tron.tronWeb,
    });
    return { name: 'OKX Wallet', address: addr, canSign: tron.canSign };
  }

  if (id === 'binance') {
    const bn = window.binanceWeb3Wallet;
    let evmAddr = '';
    if (bn) {
      try {
        const r = await bn.request({ method: 'eth_requestAccounts' });
        evmAddr = (r && r[0]) || '';
      } catch (e) { /* ignore */ }
    }
    await wait(800);
    const tron = detectTronProvider();
    const addr = tron.address || evmAddr;
    update({
      connected: true,
      name: 'Binance Web3',
      icon: '🟨',
      address: addr,
      canSignTron: tron.canSign,
      tronWeb: tron.tronWeb,
    });
    return { name: 'Binance Web3', address: addr, canSign: tron.canSign };
  }

  if (id === 'metamask') {
    const mm = window.ethereum;
    if (!mm) throw new Error('未检测到 MetaMask');
    const r = await mm.request({ method: 'eth_requestAccounts' });
    const addr = (r && r[0]) || '';
    await wait(500);
    const tron = detectTronProvider();
    update({
      connected: true,
      name: 'MetaMask',
      icon: '🦊',
      address: tron.address || addr,
      canSignTron: tron.canSign,
      tronWeb: tron.tronWeb,
    });
    return { name: 'MetaMask', address: tron.address || addr, canSign: tron.canSign };
  }

  throw new Error('未知钱包类型');
}
