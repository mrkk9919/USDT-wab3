# WAB 3 (WAB3) Token Kit — TRC-20

WAB3 是基于 TRON 的独立 TRC-20 代币，固定发行量由部署时指定，6 位小数。

> 重要：WAB3 是独立代币，**不是 Tether 官方 USDT**。Token 名称设置为 "WAB 3"、符号 "WAB3"，避免收款人误认为它是真正的 USDT。

## 技术规格

| 项目 | 值 |
|------|-----|
| Name | WAB 3 |
| Symbol | WAB3 |
| Network | TRON |
| Standard | TRC-20 |
| Decimals | 6 |
| Logo | `client/public/wab3-logo.svg` |
| Supply | 部署时指定（`INITIAL_SUPPLY`） |

合约实现 `transfer` / `transferFrom` / `approve` / `allowance` / `balanceOf` / `totalSupply` 等标准 TRC-20 接口。

---

## 代码运行顺序

在服务器或本地：

```bash
unzip wab3-token-kit.zip
cd wab3-token-kit

# 安装依赖
npm install

# 编译合约
npm run compile
```

然后配置环境变量：

```bash
cp .env.example .env
```

测试网先填写：

```dotenv
TRON_NETWORK=shasta
DEPLOYER_PRIVATE_KEY=你的测试钱包私钥
INITIAL_SUPPLY=100000000
```

然后部署：

```bash
npm run deploy
```

成功以后会生成 `deployment.json`，里面会出现：

```json
{
  "contractAddress": "Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "txID": "...",
  "network": "shasta",
  "owner": "...",
  "supply": 100000000
}
```

`contractAddress` 就是你的 WAB3 合约地址。TRON 官方部署流程也是先选择正确的 Shasta/Nile/Mainnet 网络，再通过 TronLink / Tron IDE 等方式部署。

---

## 转账

后端已包含 TRC-20 转账逻辑，核心流程：

```
WAB3 Contract
      ↓
transfer(address,uint256)
      ↓
签名
      ↓
广播
      ↓
TXID
      ↓
TRON 区块确认
```

TronWeb 官方推荐使用 `triggerSmartContract` 构造状态变更交易，然后签名并广播；TRC-20 转账就是这个模式。

HTTP 接口：

```bash
curl -X POST http://localhost:3001/api/wab3/transfer \
  -H "Content-Type: application/json" \
  -d '{"to": "T收款地址", "amount": 100}'
```

响应：

```json
{
  "txID": "b2b345...",
  "from": "T部署者地址",
  "to": "T收款地址",
  "amount": "100",
  "broadcast": true
}
```

> 转账需要配置 `DEPLOYER_PRIVATE_KEY`（从该钱包转出并支付能量费用）。

---

## 收入记录

代码中的监听器会查询 TRC-20 Transfer 事件：

```
TRC-20 Transfer
        ↓
from
to
value
txid
timestamp
```

然后判断：

```
to == 我的地址
        ↓
收入 + WAB3

to != 我的地址
        ↓
支出 - WAB3
```

TRON 官方 TronGrid API 支持按照地址 + Token 合约地址查询 TRC-20 历史，可用来建立交易记录系统。

监听器接口：

```bash
# 查看监听器状态与最近事件
curl http://localhost:3001/api/wab3/listener

# 启动监听器（需配置 WAB3_CONTRACT 与监控地址）
curl -X POST http://localhost:3001/api/wab3/listener/start
```

---

## 币价与 USDT 估值
WAB3 内置价格管理模块，以 USDT 计价，支持动态设置币价并自动计算 USD 估值。

价格数据持久化在项目根目录 `price-state.json`，服务重启后自动恢复。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/wab3/price` | 当前价格、24h 涨跌幅、24h 最高/最低 |
| POST | `/api/wab3/price` | 设置新价格，body: `{"price": 1.25}` |
| GET | `/api/wab3/price/history` | 价格历史（`?limit=48`） |

前端 WAB3 页面会自动展示：
- 当前币价 `1 WAB3 = X USDT` 及 24h 涨跌幅
- 总市值（总发行量 × 当前价格）
- 地址余额的 USDT 估值
- 每笔转账记录的 USDT 价值
- 管理员可点击「设置」按钮直接调整币价

初始价格通过 `.env` 配置：
```dotenv
WAB3_INITIAL_PRICE=1.00
```

## 后端 API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/wab3/info` | Token 信息（名称/符号/精度/总发行量/合约地址/当前价格/市值） |
| GET | `/api/wab3/price` | 当前价格与 24h 涨跌统计 |
| POST | `/api/wab3/price` | 设置 WAB3 价格（USDT） |
| GET | `/api/wab3/price/history` | 价格历史记录 |
| GET | `/api/wab3/balance?address=` | 查询 WAB3 余额 |
| GET | `/api/wab3/transfers?address=` | 查询 TRC-20 转账历史 |
| POST | `/api/wab3/transfer` | 发起 WAB3 转账，返回 TXID |
| GET | `/api/wab3/listener` | 监听器状态与最近事件 |
| POST | `/api/wab3/listener/start` | 启动监听器 |
| POST | `/api/wab3/listener/stop` | 停止监听器 |

## imToken 对接

WAB3 能在 TRON 链上真实存在、真实转账，但不代表一定自动出现在 imToken 官方资产列表（TRON 账户目前不支持通用 Custom Token 功能，显示方式取决于 imToken 版本与资产收录）。正确路径：**Mainnet 真实合约 → imToken TRON 地址 → 链上余额 → TXID / Transfer Record**。

详见 `docs/imtoken.md`。

## 目录结构

```
.
├── contract/
│   └── WAB3Token.sol        # TRC-20 合约源码
├── scripts/
│   ├── compile.js           # 编译脚本 (npm run compile)
│   ├── deploy.js            # 部署脚本 (npm run deploy)
│   └── config.js            # 网络配置与环境变量读取
├── server/
│   └── src/
│       ├── index.js         # Express 后端 API
│       ├── wab3.js          # 查询 / 转账逻辑
│       ├── listener.js      # 交易监听器
│       └── tron.js/eth.js   # USDT Explorer 模块
├── client/                  # Web 查询界面（USDT Explorer / WAB3 页）
├── build/                   # 编译产物 (ABI / bytecode)
├── deployment.json          # 部署结果（部署后生成）
├── .env.example             # 环境变量模板
└── docs/imtoken.md          # imToken 对接说明
```
