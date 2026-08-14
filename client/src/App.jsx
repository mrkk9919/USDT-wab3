import { useCallback, useEffect, useState } from 'react';
import Wab3Panel from './Wab3Panel.jsx';

const DEFAULT_ADDRESSES = {
  tron: 'TWS1onJnNTg8tJHomceqxBxTsUB1DHh7PV',
  eth: '0x28C6c06298d514Db089934071355E5743bf21d60',
};

function formatWithCommas(value) {
  const [intPart, fracPart] = String(value).split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fracPart ? `${withCommas}.${fracPart}` : withCommas;
}

function formatTimestamp(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function shortAddr(addr) {
  if (!addr) return '-';
  return addr.length > 18 ? `${addr.slice(0, 10)}...${addr.slice(-8)}` : addr;
}

function TxDirection({ tx, address }) {
  const fromMe = tx.from.toLowerCase() === String(address).toLowerCase();
  return (
    <span className={`badge ${fromMe ? 'badge-out' : 'badge-in'}`}>
      {fromMe ? '转出' : '转入'}
    </span>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('usdt');
  const [network, setNetwork] = useState('tron');
  const [address, setAddress] = useState('');
  const [networks, setNetworks] = useState([]);
  const [balance, setBalance] = useState(null);
  const [txs, setTxs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/networks')
      .then((res) => res.json())
      .then((json) => {
        setNetworks(json.networks || []);
        setAddress(DEFAULT_ADDRESSES[json.networks?.[0]?.id] || '');
      })
      .catch(() => {
        setNetworks([
          { id: 'tron', name: 'TRON (TRC20)' },
          { id: 'eth', name: 'Ethereum (ERC20)' },
        ]);
      });
  }, []);

  const handleNetworkChange = (id) => {
    setNetwork(id);
    setAddress(DEFAULT_ADDRESSES[id] || '');
    setBalance(null);
    setTxs(null);
    setError('');
  };

  const handleSearch = useCallback(async () => {
    setError('');
    setBalance(null);
    setTxs(null);
    const trimmed = address.trim();
    if (!trimmed) {
      setError('请输入查询地址');
      return;
    }
    setLoading(true);
    try {
      const [balRes, txRes] = await Promise.all([
        fetch(`/api/balance?network=${network}&address=${encodeURIComponent(trimmed)}`),
        fetch(`/api/transactions?network=${network}&address=${encodeURIComponent(trimmed)}&limit=20`),
      ]);
      const balJson = await balRes.json();
      if (!balRes.ok) throw new Error(balJson.error || '余额查询失败');
      setBalance(balJson);

      const txJson = await txRes.json();
      if (!txRes.ok) {
        if (txRes.status === 501) {
          setTxs({ unsupported: true, message: txJson.error });
        } else {
          throw new Error(txJson.error || '交易记录查询失败');
        }
      } else {
        setTxs(txJson);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [network, address]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo-row">
            <div className="logo">
              {activeTab === 'wab3' ? (
                <img src="/wab3-logo.svg" alt="WAB3 Logo" className="logo-icon-img" />
              ) : (
                <span className="logo-icon">U</span>
              )}
              <div>
                <h1>{activeTab === 'wab3' ? 'WAB3 Token' : 'USDT Explorer'}</h1>
                <p>
                  {activeTab === 'wab3'
                    ? 'TRC-20 智能合约 · 部署 / 查询 / 监听'
                    : 'TRC20 / ERC20 链上数据查询工具'}
                </p>
              </div>
            </div>
            <nav className="nav-tabs">
              <button
                className={`nav-tab ${activeTab === 'usdt' ? 'nav-tab-active' : ''}`}
                onClick={() => setActiveTab('usdt')}
              >
                USDT 查询
              </button>
              <button
                className={`nav-tab ${activeTab === 'wab3' ? 'nav-tab-active' : ''}`}
                onClick={() => setActiveTab('wab3')}
              >
                WAB3 Token
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="main">
        {activeTab === 'wab3' ? (
          <Wab3Panel />
        ) : (
          <>
        <section className="card search-card">
          <div className="network-tabs">
            {networks.map((n) => (
              <button
                key={n.id}
                className={`tab ${network === n.id ? 'tab-active' : ''}`}
                onClick={() => handleNetworkChange(n.id)}
              >
                {n.name}
              </button>
            ))}
          </div>
          <div className="search-row">
            <input
              className="address-input"
              placeholder={
                network === 'tron'
                  ? '输入 TRON 地址（T 开头，34 位）'
                  : '输入以太坊地址（0x 开头，40 位十六进制）'
              }
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />
            <button className="btn-primary" onClick={handleSearch} disabled={loading}>
              {loading ? '查询中...' : '查询'}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>

        {balance && (
          <section className="card balance-card">
            <div className="balance-label">USDT 余额</div>
            <div className="balance-value">{formatWithCommas(balance.formatted)}</div>
            <div className="balance-meta">
              <span>{networks.find((n) => n.id === balance.network)?.name || balance.network}</span>
              <span className="mono">{shortAddr(balance.address)}</span>
            </div>
          </section>
        )}

        <section className="card tx-card">
          <div className="card-title">
            <h2>最近 USDT 转账记录</h2>
            {txs && !txs.unsupported && (
              <span className="count">共 {txs.count} 条</span>
            )}
          </div>
          {!txs && !loading && (
            <p className="placeholder">输入地址后查询最近的 USDT 转账记录</p>
          )}
          {txs && txs.unsupported && <p className="placeholder">{txs.message}</p>}
          {txs && !txs.unsupported && (
            <div className="tx-table-wrap">
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>发起方</th>
                    <th>接收方</th>
                    <th>金额 (USDT)</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.transactions.map((tx) => (
                    <tr key={tx.txId}>
                      <td>
                        <TxDirection tx={tx} address={address} />
                      </td>
                      <td className="mono">{shortAddr(tx.from)}</td>
                      <td className="mono">{shortAddr(tx.to)}</td>
                      <td className="amount">{formatWithCommas(tx.value)}</td>
                      <td>{formatTimestamp(tx.timestamp)}</td>
                    </tr>
                  ))}
                  {txs.transactions.length === 0 && (
                    <tr>
                      <td colSpan="5" className="placeholder">该地址暂无 USDT 转账记录</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
          </>
        )}
      </main>

      <footer className="footer">
        <p>
          WAB3 Token (TRC-20) · 数据来源于 TRONGrid / 以太坊公开节点，仅供学习与演示用途
        </p>
      </footer>
    </div>
  );
}
