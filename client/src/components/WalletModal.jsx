import { useEffect, useState } from 'react';
import { getAvailableWallets, connectWallet } from '../lib/wallet.js';

export default function WalletModal({ open, onClose, onConnected }) {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setWallets(getAvailableWallets());
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const handleSelect = async (id, name) => {
    setLoading(id);
    setError('');
    try {
      const res = await connectWallet(id);
      onConnected && onConnected(res);
      onClose();
    } catch (e) {
      setError(`${name} 连接失败：${e.message || e}`);
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="wallet-modal-mask" onClick={onClose}>
      <div className="wallet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wallet-modal-header">
          <h3>连接钱包</h3>
          <button className="wallet-modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="wallet-modal-sub">选择你要连接的 Web3 钱包（支持 TRON / Shasta）</p>

        <div className="wallet-list">
          {wallets.length === 0 && (
            <div className="wallet-empty">
              <p>未检测到已安装的钱包</p>
              <p className="wallet-empty-tip">
                请安装 TronLink / OKX / Binance Web3 扩展，或用对应钱包 App 内置浏览器打开本站
              </p>
            </div>
          )}
          {wallets.map((w) => (
            <button
              key={w.id}
              className="wallet-item"
              onClick={() => handleSelect(w.id, w.name)}
              disabled={!!loading}
            >
              <span className="wallet-icon">{w.icon}</span>
              <span className="wallet-info">
                <span className="wallet-name">
                  {w.name}
                  <span className="wallet-badge">{w.badge}</span>
                </span>
                <span className="wallet-desc">{w.desc}</span>
              </span>
              {loading === w.id && <span className="wallet-loading">连接中…</span>}
            </button>
          ))}
        </div>

        {error && <div className="wallet-modal-error">{error}</div>}
      </div>
    </div>
  );
}
