import { useCallback, useEffect, useState } from 'react';

function shortAddr(addr) {
  if (!addr) return '-';
  return addr.length > 18 ? `${addr.slice(0, 10)}...${addr.slice(-8)}` : addr;
}

function formatTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

export default function Wab3Panel() {
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState('');
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState(null);
  const [txs, setTxs] = useState(null);
  const [listener, setListener] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchInfo = useCallback(async () => {
    const res = await fetch('/api/wab3/info');
    const json = await res.json();
    if (!res.ok) {
      setInfoError(json.error || 'Token 信息加载失败');
      setInfo(null);
    } else {
      setInfo(json);
      setInfoError('');
    }
  }, []);

  const fetchListener = useCallback(async () => {
    const res = await fetch('/api/wab3/listener');
    const json = await res.json();
    setListener(json);
  }, []);

  useEffect(() => {
    fetchInfo();
    fetchListener();
    const timer = setInterval(fetchListener, 5000);
    return () => clearInterval(timer);
  }, [fetchInfo, fetchListener]);

  const handleSearch = async () => {
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
        fetch(`/api/wab3/balance?address=${encodeURIComponent(trimmed)}`),
        fetch(`/api/wab3/transfers?address=${encodeURIComponent(trimmed)}&limit=20`),
      ]);
      const balJson = await balRes.json();
      if (!balRes.ok) throw new Error(balJson.error || '余额查询失败');
      setBalance(balJson);
      const txJson = await txRes.json();
      if (!txRes.ok) throw new Error(txJson.error || '转账历史查询失败');
      setTxs(txJson);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartListener = async () => {
    const res = await fetch('/api/wab3/listener/start', { method: 'POST' });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || '监听器启动失败');
    }
    fetchListener();
  };

  const handleStopListener = async () => {
    await fetch('/api/wab3/listener/stop', { method: 'POST' });
    fetchListener();
  };

  return (
    <div className="wab3-panel">
      {infoError ? (
        <section className="card">
          <div className="wab3-hero">
            <img src="/wab3-logo.svg" alt="WAB3 Logo" className="wab3-logo" />
            <div>
              <h2>WAB3 Token</h2>
              <p className="placeholder">{infoError}</p>
            </div>
          </div>
        </section>
      ) : !info ? (
        <section className="card">
          <p className="placeholder">正在加载 WAB3 Token 信息...</p>
        </section>
      ) : (
        <section className="card">
          <div className="wab3-hero">
            <img src="/wab3-logo.svg" alt="WAB3 Logo" className="wab3-logo" />
            <div className="wab3-info">
              <div className="wab3-title-row">
                <h2>{info.name}</h2>
                <span className="symbol-badge">{info.symbol}</span>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">网络</span>
                  <span className="info-value">{info.networkName || info.network}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">精度</span>
                  <span className="info-value">{info.decimals} 位小数</span>
                </div>
                <div className="info-item">
                  <span className="info-label">总发行量</span>
                  <span className="info-value">{info.totalSupply} {info.symbol}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">合约地址</span>
                  <span className="info-value mono">{shortAddr(info.contract)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-title">
          <h2>WAB3 余额与转账历史</h2>
          <span className="count">TRC-20 · 6 位小数</span>
        </div>
        <div className="search-row">
          <input
            className="address-input"
            placeholder="输入 TRON 地址（T 开头，34 位）"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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
          <div className="balance-label">WAB3 余额</div>
          <div className="balance-value">{balance.formatted}</div>
          <div className="balance-meta">
            <span>{balance.network}</span>
            <span className="mono">{shortAddr(balance.address)}</span>
          </div>
        </section>
      )}

      <section className="card tx-card">
        <div className="card-title">
          <h2>最近 WAB3 转账记录</h2>
          {txs && <span className="count">共 {txs.count} 条</span>}
        </div>
        {!txs && !loading && (
          <p className="placeholder">输入地址后查询最近的 WAB3 TRC-20 转账记录</p>
        )}
        {txs && (
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>发起方</th>
                  <th>接收方</th>
                  <th>金额 (WAB3)</th>
                  <th>时间</th>
                  <th>TXID</th>
                </tr>
              </thead>
              <tbody>
                {txs.transactions.map((tx) => (
                  <tr key={tx.txId}>
                    <td className="mono">{shortAddr(tx.from)}</td>
                    <td className="mono">{shortAddr(tx.to)}</td>
                    <td className="amount">{tx.value}</td>
                    <td>{formatTime(new Date(tx.timestamp).toISOString())}</td>
                    <td className="mono">{shortAddr(tx.txId)}</td>
                  </tr>
                ))}
                {txs.transactions.length === 0 && (
                  <tr>
                    <td colSpan="5" className="placeholder">该地址暂无 WAB3 转账记录</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card tx-card">
        <div className="card-title">
          <h2>区块链交易监听器</h2>
          <div className="listener-actions">
            <span className={`badge ${listener && listener.running ? 'badge-in' : 'badge-out'}`}>
              {listener && listener.running ? '监听中' : '已停止'}
            </span>
            {listener && listener.running ? (
              <button className="btn-ghost" onClick={handleStopListener}>停止</button>
            ) : (
              <button className="btn-primary btn-sm" onClick={handleStartListener}>启动</button>
            )}
          </div>
        </div>
        {listener && (
          <>
            <div className="info-grid listener-grid">
              <div className="info-item">
                <span className="info-label">合约</span>
                <span className="info-value mono">{shortAddr(listener.contract)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">监控地址</span>
                <span className="info-value mono">
                  {(listener.monitorAddresses || []).map(shortAddr).join(', ') || '全部'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">累计检测</span>
                <span className="info-value">{listener.stats.totalDetected} 笔</span>
              </div>
              <div className="info-item">
                <span className="info-label">收入 / 支出</span>
                <span className="info-value">
                  <span className="badge badge-in">{listener.stats.income} 收入</span>{' '}
                  <span className="badge badge-out">{listener.stats.expense} 支出</span>
                </span>
              </div>
            </div>
            {listener.lastError && <p className="error">{listener.lastError}</p>}
            {listener.logs.length === 0 ? (
              <p className="placeholder">暂无监听到的 WAB3 转账事件</p>
            ) : (
              <div className="tx-table-wrap">
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>方向</th>
                      <th>金额</th>
                      <th>发起方</th>
                      <th>接收方</th>
                      <th>时间</th>
                      <th>TXID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listener.logs.slice().reverse().map((log, i) => (
                      <tr key={`${log.txId}-${i}`}>
                        <td>
                          <span className={`badge ${log.direction === 'income' ? 'badge-in' : 'badge-out'}`}>
                            {log.direction === 'income' ? '收入' : '支出'}
                          </span>
                        </td>
                        <td className="amount">{log.value}</td>
                        <td className="mono">{shortAddr(log.from)}</td>
                        <td className="mono">{shortAddr(log.to)}</td>
                        <td>{formatTime(log.timestamp)}</td>
                        <td className="mono">{shortAddr(log.txId)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
