# WAB 3 (WAB3) Token × imToken 对接说明

本文档说明 WAB3（TRC-20）与 imToken 钱包的对接方式、注意事项，以及 DApp 集成 imToken 钱包 API 的要点。

## 1. WAB3 合约信息

| 项目 | 值 |
|------|-----|
| Token 名称 | **WAB 3** |
| Token 符号 | **WAB3** |
| 网络 | TRON |
| 标准 | TRC-20 |
| 精度 (decimals) | 6 |
| Logo | WAB3（见 `client/public/wab3-logo.svg`） |
| 总发行量 | 部署时指定（`INITIAL_SUPPLY`） |
| 合约地址 | 部署后见根目录 `deployment.json` 的 `contractAddress` |

> 重要：WAB3 是独立代币，**不是 Tether 官方 USDT**。名称 "WAB 3" 与符号 "WAB3" 明确区分，避免收款人误认为其是真正的 USDT。

## 2. 关于 imToken 的支持范围

imToken 官方支持 TRON 网络与 TRC-20 Token，但需要明确两点：

1. **WAB3 能在 TRON 链上真实存在、真实转账**，这由链上合约保证，与钱包无关。
2. **WAB3 不一定自动出现在 imToken 官方资产列表**。imToken 当前文档说明可以通过合约地址搜索 Token，但同时说明 **TRON 账户目前不支持通用 Custom Token（自定义代币）功能**，最终显示方式取决于 imToken 当前版本和资产收录情况。

因此不要依赖 imToken 的手动添加功能作为核心能力；正确路径是「真实合约 → 链上余额 → 链上交易记录」。

## 3. 正确对接流程

```
WAB3 合约 (contract/WAB3Token.sol)
   ↓ 部署到 TRON Mainnet
真实 Contract Address (deployment.json → contractAddress)
   ↓
真实 WAB3 转账 (transfer / approve / transferFrom)
   ↓
imToken TRON 地址持有 WAB3
   ↓
链上余额 (contract.balanceOf)
   ↓
TXID / Transfer Record (TRONGrid 查询)
```

- 资产真实性由链上合约保证；钱包只是查看链上余额的入口。
- 业务系统以 **TRON 主网数据**（TRONGrid API / 区块浏览器）为准做账，不应依赖钱包展示。

## 4. 在 imToken 中查看 WAB3（取决于版本）

- **已收录场景**：imToken 资产页直接搜索 `WAB3` 或 `WAB 3` 添加。
- **未收录场景**：若当前 imToken 版本对 TRON 账户支持自定义 Token，可通过「添加 Token → 自定义 → TRON → 合约地址」尝试添加；若该版本 TRON 不支持自定义 Token，则无法在资产列表显示，但链上余额与转账始终真实存在，可通过 Tronscan 或本项目查询页面查看。

## 5. DApp 集成 imToken 钱包 API

若业务需要用户在钱包内直接进行 WAB3 转账 / approve，可通过 imToken 内置 DApp 浏览器打开页面，钱包注入 Provider：

### 5.1 检测 imToken 环境

```js
const ua = navigator.userAgent.toLowerCase();
const isImTokenBrowser = ua.includes('imtoken');
```

### 5.2 使用 TronWeb 与钱包交互

```js
if (window.tronWeb && window.tronWeb.defaultAddress.base58) {
  const userAddress = window.tronWeb.defaultAddress.base58;
  const contract = await window.tronWeb.contract().at(WAB3_CONTRACT);

  // WAB3 转账（transfer）
  const result = await contract.transfer(toAddress, amount).send({
    feeLimit: 100_000_000,
    shouldPollResponse: true,
  });
  // result 即 TXID
}
```

### 5.3 常见交互场景

| 场景 | 调用接口 | 说明 |
|------|---------|------|
| 查询余额 | `contract.balanceOf(address).call()` | 返回原始值（需除以 1e6） |
| 转账 | `contract.transfer(to, value).send({ feeLimit })` | 用户需确认签名 |
| 授权 | `contract.approve(spender, value).send({ feeLimit })` | 用于 DEX / 合约代扣 |
| 代扣 | `contract.transferFrom(from, to, value).send(...)` | 需先完成 approve |

### 5.4 前端金额换算

```js
const DECIMALS = 6;
const raw = BigInt(Math.round(parseFloat(input) * 10 ** DECIMALS)); // 用户输入(枚) → 原始值
const amount = Number(raw) / 10 ** DECIMALS;                        // 原始值 → 展示(枚)
```

## 6. 官方部署流程参考

TRON 官方部署 TRC-20 合约的标准方式：

1. 选择正确的网络：**Shasta（测试）→ Nile（测试）→ Mainnet（主网）**
2. 方式 A：使用本项目 `npm run deploy`（脚本构造 `CreateSmartContract` 交易 → 签名 → 广播）
3. 方式 B：通过 **TronLink 钱包 / Tron IDE / Remix（TRON 插件）** 部署，上传 `contract/WAB3Token.sol`，部署参数填写 `INITIAL_SUPPLY`

> 测试网（Shasta / Nile）请先在对应水龙头领取测试 TRX 用于支付部署/转账费用。

## 7. 关联文件

| 文件 | 说明 |
|------|------|
| `contract/WAB3Token.sol` | TRC-20 合约源码（Name: WAB 3, Symbol: WAB3, 6 decimals） |
| `scripts/compile.js` | 编译脚本（`npm run compile`） |
| `scripts/deploy.js` | 部署脚本（`npm run deploy`，产出 `deployment.json`） |
| `server/src/wab3.js` | 后端查询 / 转账 API |
| `server/src/listener.js` | 交易监听器（TXID、收入/支出方向解析） |
| `.env.example` | 环境变量模板 |
