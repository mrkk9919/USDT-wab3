export function isValidTronAddress(address) {
  return typeof address === 'string' && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
}

export function isValidEthAddress(address) {
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function validateAddress(network, address) {
  if (network === 'tron') {
    if (!isValidTronAddress(address)) {
      throw new Error('无效的 TRON 地址，TRC20 地址应为 34 位以 T 开头的 Base58 字符串');
    }
  } else if (network === 'eth') {
    if (!isValidEthAddress(address)) {
      throw new Error('无效的以太坊地址，ERC20 地址应为 0x 开头的 40 位十六进制字符串');
    }
  } else {
    throw new Error('不支持的网络，可选 tron / eth');
  }
}
