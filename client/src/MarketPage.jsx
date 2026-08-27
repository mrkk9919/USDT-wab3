import { useCallback, useEffect, useState } from 'react';

const POOL_CONTRACT = 'THYp7d4u4WLi7kJGEXqyytpcVdhYgCVYRN';
const USTD_CONTRACT = 'TXQs7gk18BqwTeozuwBiUfZeCDARMBitkL';

function shortAddr(addr) {
  if (!addr) return '-';
  return addr.length > 18 ? `${addr.slice(0, 10)}...${addr.slice(-8)}` : addr;
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function MarketPage() {
  const [pool, setPool] = useState(null);
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [isBuy, setIsBuy] = useState(true);
  const [inputAmount, setInputAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [slippage, setSlippage] = useState(0.5);
  const [walletAddr, setWalletAddr] = useState('');
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('swap'); // swap | pool

  const fetchPool = useCallback(async () => {
    try {
      const res = await fetch('/api/market/pool');
      const json = await res.json();
      if (json.code === 0) setPool(json.data);
    } catch (e) { /* ignore */ }
  }, []);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/market/trades?limit=20');
      const json = await res.json();
      if (json.code === 0) setTrades(json.data);
    } catch (e) { /* ignore */ }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/market/stats');
      const json = await res.json();
      if (json.code === 0) setStats(json.data);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchPool();
    fetchTrades();
    fetchStats();
    const timer = setInterval(() => {
      fetchPool();
      fetchTrades();
      fetchStats();
    }, 8000);
    return () => clearInterval(timer);
  }, [fetchPool, fetchTrades, fetchStats]);

  // 报价计算
  useEffect(() => {
    if (!inputAmount || !pool) {
      setQuote(null);
      return;
    }
    const type = isBuy ? 'buy' : 'sell';
    fetch(`/api/market/quote?type=${type}&amount=${inputAmount}`)
      .then(r => r.json())
      .then(json => {
        if (json.code === 0) setQuote(json.data);
      })
      .catch(() => setQuote(null));
  }, [inputAmount, isBuy, pool]);

  const connectWallet = async () => {
    if (!window.tronWeb) {
      setError('请先安装 TronLink 钱包插件');
      return;
    }
    try {
      const accounts = await window.tronWeb.request({ method: 'tron_requestAccounts' });
      if (accounts && accounts.length > 0) {
        setWalletAddr(accounts[0]);
        setError('');
      }
    } catch (e) {
      setError('钱包连接失败: ' + e.message);
    }
  };

  const handleSwap = async () => {
    if (!walletAddr) {
      setError('请先连接钱包');
      return;
    }
    if (!inputAmount || Number(inputAmount) <= 0) {
      setError('请输入数量');
      return;
    }
    setLoading(true);
    setError('');
    setTxHash('');
    try {
      const tronWeb = window.tronWeb;
      const contract = await tronWeb.contract().at(POOL_CONTRACT);
      let tx;
      if (isBuy) {
        // TRX -> USTD
        const sun = tronWeb.toSun(inputAmount);
        tx = await contract.buyUstd().send({ value: sun });
      } else {
        // USTD -> TRX, 需要先 approve
        const ustdContract = await tronWeb.contract().at(USTD_CONTRACT);
        const rawAmount = Math.floor(Number(inputAmount) * 1e6).toString();
        await ustdContract.approve(POOL_CONTRACT, rawAmount).send();
        tx = await contract.sellUstd(rawAmount).send();
      }
      setTxHash(tx);
      setInputAmount('');
      setQuote(null);
      setTimeout(() => {
        fetchPool();
        fetchTrades();
        fetchStats();
      }, 5000);
    } catch (e) {
      setError('交易失败: ' + (e.message || JSON.stringify(e)));
    } finally {
      setLoading(false);
    }
  };

  const priceUsd = pool?.priceUsdPerUstd || 0.99;
  const priceTrx = pool?.priceTrxPerUstd || 0;

  return (
    <div className="market-page">
      <div className="market-header">
        <h2>USTD / TRX 交易市场</h2>
        <div className="market-price-info">
          <span className="price-label">USTD 价格</span>
          <span className="price-value">${priceUsd.toFixed(4)}</span>
          <span className="price-trx">≈ {priceTrx.toFixed(6)} TRX</span>
        </div>
      </div>

      <div className="market-subtabs">
        <button
          className={`subtab ${activeSubTab === 'swap' ? 'subtab-active' : ''}`}
          onClick={() => setActiveSubTab('swap')}
        >
          兑换
        </button>
        <button
          className={`subtab ${activeSubTab === 'pool' ? 'subtab-active' : ''}`}
          onClick={() => setActiveSubTab('pool')}
        >
          流动性
        </button>
      </div>

      {activeSubTab === 'swap' ? (
        <div className="market-content">
          <div className="swap-card">
            <div className="swap-direction">
              <button
                className={`dir-btn ${isBuy ? 'dir-active' : ''}`}
                onClick={() => { setIsBuy(true); setInputAmount(''); }}
              >
                买 USTD (支付 TRX)
              </button>
              <button
                className={`dir-btn ${!isBuy ? 'dir-active' : ''}`}
                onClick={() => { setIsBuy(false); setInputAmount(''); }}
              >
                卖 USTD (获得 TRX)
              </button>
            </div>

            <div className="swap-input-group">
              <label>{isBuy ? '支付 TRX 数量' : '支付 USTD 数量'}</label>
              <input
                type="number"
                placeholder="0.00"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                className="swap-input"
              />
              <div className="swap-balance">
                {walletAddr ? `钱包: ${shortAddr(walletAddr)}` : '未连接钱包'}
              </div>
            </div>

            <div className="swap-quote">
              <div className="quote-row">
                <span>预估获得</span>
                <span className="quote-output">
                  {quote ? `${quote.outputFormatted} ${isBuy ? 'USTD' : 'TRX'}` : '-'}
                </span>
              </div>
              <div className="quote-row">
                <span>价格影响</span>
                <span>{quote ? quote.priceImpact.toFixed(4) + '%' : '-'}</span>
              </div>
              <div className="quote-row">
                <span>滑点容忍</span>
                <input
                  type="number"
                  value={slippage}
                  onChange={(e) => setSlippage(Number(e.target.value))}
                  className="slippage-input"
                  min="0.1"
                  max="10"
                  step="0.1"
                />
                <span>%</span>
              </div>
            </div>

            {!walletAddr ? (
              <button className="btn-primary swap-btn" onClick={connectWallet}>
                连接 TronLink 钱包
              </button>
            ) : (
              <button
                className="btn-primary swap-btn"
                onClick={handleSwap}
                disabled={loading || !inputAmount}
              >
                {loading ? '交易中...' : `确认${isBuy ? '买入' : '卖出'}`}
              </button>
            )}

            {error && <div className="swap-error">{error}</div>}
            {txHash && (
              <div className="swap-success">
                交易成功! TX: <a href={`https://shasta.tronscan.org/#/transaction/${txHash}`} target="_blank" rel="noreferrer">{txHash.slice(0, 16)}...</a>
              </div>
            )}
          </div>

          <div className="market-info">
            <div className="info-card">
              <h3>池子数据</h3>
              <div className="info-row">
                <span>池子 USTD</span>
                <span>{pool ? Number(pool.reserveUstdFormatted).toLocaleString() : '-'}</span>
              </div>
              <div className="info-row">
                <span>池子 TRX</span>
                <span>{pool ? Number(pool.reserveTrxFormatted).toLocaleString() : '-'}</span>
              </div>
              <div className="info-row">
                <span>池子 TVL (USD)</span>
                <span>${pool ? pool.tvlUsd.toFixed(2) : '-'}</span>
              </div>
              <div className="info-row">
                <span>手续费</span>
                <span>0.3%</span>
              </div>
            </div>

            <div className="info-card">
              <h3>24h 数据</h3>
              <div className="info-row">
                <span>成交量 (USTD)</span>
                <span>{stats ? Number(stats.volumeUstd).toLocaleString() : '-'}</span>
              </div>
              <div className="info-row">
                <span>成交额 (USD)</span>
                <span>${stats ? stats.volumeUsd : '-'}</span>
              </div>
              <div className="info-row">
                <span>交易次数</span>
                <span>{stats ? stats.tradeCount : '-'}</span>
              </div>
            </div>

            <div className="info-card trades-card">
              <h3>最近成交</h3>
              {trades.length === 0 ? (
                <p className="placeholder">暂无成交记录</p>
              ) : (
                <div className="trades-list">
                  {trades.map((t) => (
                    <div key={t.id} className="trade-item">
                      <span className={`trade-type ${t.isBuy ? 'trade-buy' : 'trade-sell'}`}>
                        {t.isBuy ? '买入' : '卖出'}
                      </span>
                      <span className="trade-amount">
                        {t.isBuy ? (Number(t.amountOut) / 1e6).toFixed(4) : (Number(t.amountIn) / 1e6).toFixed(4)} USTD
                      </span>
                      <span className="trade-time">{formatTime(t.ts)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="pool-section">
          <div className="info-card">
            <h3>流动性池</h3>
            <p className="pool-desc">
              添加 USTD + TRX 流动性，获得 LP 份额，赚取 0.3% 交易手续费。
            </p>
            <div className="info-row">
              <span>池子 USTD</span>
              <span>{pool ? Number(pool.reserveUstdFormatted).toLocaleString() : '-'}</span>
            </div>
            <div className="info-row">
              <span>池子 TRX</span>
              <span>{pool ? Number(pool.reserveTrxFormatted).toLocaleString() : '-'}</span>
            </div>
            <div className="info-row">
              <span>总 LP 份额</span>
              <span>{pool ? (Number(pool.totalLp) / 1e6).toFixed(4) : '-'}</span>
            </div>
            <div className="pool-contract">
              <p>AMM 池合约: <code>{POOL_CONTRACT}</code></p>
              <p>USTD 合约: <code>{USTD_CONTRACT}</code></p>
            </div>
            <p className="pool-notice">
              流动性添加/移除功能需通过 TronLink 钱包直接与合约交互。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
