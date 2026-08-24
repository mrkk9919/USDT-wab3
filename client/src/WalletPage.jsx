import { useCallback, useEffect, useState } from 'react';

function shortAddr(addr) {
  if (!addr) return '-';
  return addr.length > 18 ? `${addr.slice(0, 10)}...${addr.slice(-8)}` : addr;
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatWithCommas(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function formatUsd(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '$0';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1) return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${num.toFixed(4)}`;
}

// 默认显示部署者地址的余额
const DEFAULT_ADDRESS = 'THFkAXUiavqA9pQ7zKUxtH2qwLud777vrK';

export default function WalletPage() {
  const [info, setInfo] = useState(null);
  const [priceData, setPriceData] = useState(null);
  const [address, setAddress] = useState(DEFAULT_ADDRESS);
  const [balance, setBalance] = useState(null);
  const [txs, setTxs] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // all / out / in
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddressInput, setShowAddressInput] = useState(false);
  const [tempAddress, setTempAddress] = useState('');

  const fetchInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/wab3/info');
      const json = await res.json();
      if (res.ok) setInfo(json);
    } catch { /* ignore */ }
  }, []);

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch('/api/wab3/price');
      const json = await res.json();
      if (res.ok) setPriceData(json);
    } catch { /* ignore */ }
  }, []);

  const fetchBalanceAndTxs = useCallback(async (addr) => {
    if (!addr) return;
    setLoading(true);
    setError('');
    try {
      const [balRes, txRes] = await Promise.all([
        fetch(`/api/wab3/balance?address=${encodeURIComponent(addr)}`),
        fetch(`/api/wab3/transfers?address=${encodeURIComponent(addr)}&limit=50`),
      ]);
      const balJson = await balRes.json();
      if (!balRes.ok) throw new Error(balJson.error || '余额查询失败');
      setBalance(balJson);
      const txJson = await txRes.json();
      if (txRes.ok) setTxs(txJson);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInfo();
    fetchPrice();
    fetchBalanceAndTxs(DEFAULT_ADDRESS);
    const priceTimer = setInterval(fetchPrice, 10000);
    return () => clearInterval(priceTimer);
  }, [fetchInfo, fetchPrice, fetchBalanceAndTxs]);

  const currentPrice = priceData?.price ?? info?.price ?? 0;
  const changePercent = priceData?.changePercent24h ?? info?.changePercent24h ?? 0;
  const balanceNum = balance ? parseFloat(balance.formatted) : 0;
  const balanceUsd = balanceNum * currentPrice;
  // 估算 TRX 价值（1 TRX ≈ $0.12，仅作展示）
  const trxPrice = 0.12;
  const balanceTrx = trxPrice > 0 ? balanceUsd / trxPrice : 0;

  const filteredTxs = txs?.transactions?.filter((tx) => {
    if (activeTab === 'all') return true;
    const fromMe = tx.from.toLowerCase() === address.toLowerCase();
    if (activeTab === 'out') return fromMe;
    return !fromMe;
  }) || [];

  const handleAddressSubmit = () => {
    const trimmed = tempAddress.trim();
    if (trimmed) {
      setAddress(trimmed);
      fetchBalanceAndTxs(trimmed);
    }
    setShowAddressInput(false);
    setTempAddress('');
  };

  return (
    <div className="wallet-page">
      {/* 顶部导航 */}
      <div className="wallet-header">
        <button className="wallet-back-btn" onClick={() => window.history.back()}>
          ‹
        </button>
        <div className="wallet-title">
          <span className="wallet-token-name">{info?.name || 'USTD'}</span>
          <span className="wallet-network-badge">{info?.network?.toUpperCase() || 'TRC20'}</span>
        </div>
        <button className="wallet-info-btn" title="合约信息">
          ⓘ
        </button>
      </div>

      {/* 当前价格行 */}
      <div className="wallet-price-bar">
        <span className="wallet-price-label">当前价格</span>
        <span className="wallet-price-value">
          ${currentPrice ? currentPrice.toFixed(4) : '0.0000'}
          {changePercent !== 0 && (
            <span className={`wallet-price-change ${changePercent >= 0 ? 'up' : 'down'}`}>
              {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
            </span>
          )}
        </span>
      </div>

      {/* 余额区域 */}
      <div className="wallet-balance-section">
        <div className="wallet-token-logo">
          <img src="/USTD-logo.png" alt="USTD" onError={(e) => { e.target.style.display = 'none'; }} />
        </div>
        <div className="wallet-balance-amount">
          {loading && !balance ? '加载中...' : formatWithCommas(balance?.formatted || 0)}
        </div>
        <div className="wallet-balance-sub">
          <span className="wallet-balance-trx">{balanceTrx.toFixed(2)} TRX</span>
          <span className="wallet-balance-divider">·</span>
          <span className="wallet-balance-usd">{formatUsd(balanceUsd)}</span>
        </div>
        {error && <div className="wallet-error">{error}</div>}
      </div>

      {/* 切换地址 */}
      <div className="wallet-address-bar">
        <span className="wallet-address-text">地址: {shortAddr(address)}</span>
        <button className="wallet-address-btn" onClick={() => setShowAddressInput(!showAddressInput)}>
          切换
        </button>
      </div>
      {showAddressInput && (
        <div className="wallet-address-input-row">
          <input
            className="wallet-address-input"
            placeholder="输入 TRON 地址"
            value={tempAddress}
            onChange={(e) => setTempAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddressSubmit()}
          />
          <button className="wallet-address-confirm" onClick={handleAddressSubmit}>确定</button>
        </div>
      )}

      {/* 交易记录标签 */}
      <div className="wallet-tx-tabs">
        <button className={`wallet-tx-tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
          全部
        </button>
        <button className={`wallet-tx-tab ${activeTab === 'out' ? 'active' : ''}`} onClick={() => setActiveTab('out')}>
          支出
        </button>
        <button className={`wallet-tx-tab ${activeTab === 'in' ? 'active' : ''}`} onClick={() => setActiveTab('in')}>
          收入
        </button>
      </div>

      {/* 交易记录列表 */}
      <div className="wallet-tx-list">
        {loading && !txs && <div className="wallet-tx-loading">加载中...</div>}
        {!loading && filteredTxs.length === 0 && (
          <div className="wallet-tx-empty">暂无转账记录</div>
        )}
        {filteredTxs.map((tx) => {
          const fromMe = tx.from.toLowerCase() === address.toLowerCase();
          return (
            <div key={tx.txId} className="wallet-tx-item">
              <div className={`wallet-tx-icon ${fromMe ? 'out' : 'in'}`}>
                {fromMe ? '↑' : '↓'}
              </div>
              <div className="wallet-tx-info">
                <div className="wallet-tx-title">
                  {fromMe ? '转账' : '收款'} ({shortAddr(fromMe ? tx.to : tx.from)})
                </div>
                <div className="wallet-tx-time">{formatTime(tx.timestamp)}</div>
              </div>
              <div className="wallet-tx-amount">
                <span className={`wallet-tx-value ${fromMe ? 'out' : 'in'}`}>
                  {fromMe ? '-' : '+'}{formatWithCommas(tx.value)}
                </span>
                <span className="wallet-tx-usd">{formatUsd(parseFloat(tx.value) * currentPrice)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部操作按钮 */}
      <div className="wallet-bottom-actions">
        <button className="wallet-action-btn wallet-action-send">
          <span className="wallet-action-icon">↑</span>
          转账
        </button>
        <button className="wallet-action-btn wallet-action-receive">
          <span className="wallet-action-icon">↓</span>
          收款
        </button>
      </div>
    </div>
  );
}
