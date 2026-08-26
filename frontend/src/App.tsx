import { useEffect, useMemo, useState } from 'react'
import { formatEther, getAddress, isAddress, type Address } from 'viem'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { supportedChains, type SupportedChainId } from './config'
import TransactionPanel from './TransactionPanel'
import type { ScheduledTransaction } from './types'
import { useGuardSnapshot } from './useGuardSnapshot'

const SAFE_STORAGE_KEY = 'timelock-guard:safe-address'
const CHAIN_STORAGE_KEY = 'timelock-guard:chain-id'

function initialChainId() {
  const stored = Number(localStorage.getItem(CHAIN_STORAGE_KEY))
  return supportedChains.some((chain) => chain.id === stored)
    ? (stored as SupportedChainId)
    : supportedChains[0].id
}

function initialSafeAddress(): Address | undefined {
  const stored = localStorage.getItem(SAFE_STORAGE_KEY)
  return stored && isAddress(stored) ? getAddress(stored) : undefined
}

function truncate(value: string, left = 8, right = 6) {
  return value.length <= left + right + 1 ? value : `${value.slice(0, left)}…${value.slice(-right)}`
}

function formatDuration(seconds?: bigint) {
  if (seconds === undefined) return '—'
  if (seconds === 0n) return 'Not configured'
  const units = [
    ['day', 86_400n],
    ['hour', 3_600n],
    ['minute', 60n],
  ] as const
  for (const [label, size] of units) {
    if (seconds % size === 0n) {
      const amount = seconds / size
      return `${amount} ${label}${amount === 1n ? '' : 's'}`
    }
  }
  return `${seconds} seconds`
}

function formatTime(timestamp: bigint) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(Number(timestamp) * 1000))
}

function WalletButton({ selectedChainId }: { selectedChainId: SupportedChainId }) {
  const { address, isConnected, chainId } = useAccount()
  const { connectors, connect, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()

  if (!isConnected) {
    return (
      <button
        className="wallet-button"
        onClick={() => connectors[0] && connect({ connector: connectors[0], chainId: selectedChainId })}
        disabled={!connectors[0] || isPending}
      >
        {isPending ? 'Connecting…' : 'Connect wallet'}
      </button>
    )
  }

  if (chainId !== selectedChainId) {
    return (
      <button className="wallet-button wrong-network" onClick={() => switchChain({ chainId: selectedChainId })}>
        Switch network
      </button>
    )
  }

  return (
    <button className="wallet-button connected" onClick={() => disconnect()} title="Disconnect wallet">
      <span className="connection-dot" />
      {truncate(address ?? '')}
    </button>
  )
}

function PendingCard({
  transaction,
  onCancel,
}: {
  transaction: ScheduledTransaction
  onCancel: (transaction: ScheduledTransaction) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  const ready = transaction.executionTime * 1000n <= BigInt(now)

  return (
    <article className="pending-card">
      <div className="pending-card-top">
        <span className={`status-pill ${ready ? 'ready' : ''}`}>{ready ? 'Ready' : 'Waiting'}</span>
        <span className="mono">nonce {transaction.nonce.toString()}</span>
      </div>
      <h3 title={transaction.txHash}>{truncate(transaction.txHash, 12, 10)}</h3>
      <dl>
        <div>
          <dt>Target</dt>
          <dd title={transaction.params.to}>{truncate(transaction.params.to)}</dd>
        </div>
        <div>
          <dt>Value</dt>
          <dd>{formatEther(transaction.params.value)} ETH</dd>
        </div>
        <div>
          <dt>Executable</dt>
          <dd>{formatTime(transaction.executionTime)}</dd>
        </div>
        <div>
          <dt>Operation</dt>
          <dd>{transaction.params.operation === 0 ? 'Call' : 'DelegateCall'}</dd>
        </div>
      </dl>
      <button className="secondary-button" onClick={() => onCancel(transaction)}>
        Prepare cancellation
      </button>
    </article>
  )
}

export default function App() {
  const [selectedChainId, setSelectedChainId] = useState(initialChainId)
  const [safeAddress, setSafeAddress] = useState<Address | undefined>(initialSafeAddress)
  const [safeDraft, setSafeDraft] = useState(safeAddress ?? '')
  const [safeError, setSafeError] = useState<string>()
  const [cancelTransaction, setCancelTransaction] = useState<ScheduledTransaction>()
  const { snapshot, loading, error, refresh } = useGuardSnapshot(safeAddress, selectedChainId)

  const selectedChain = useMemo(
    () => supportedChains.find((chain) => chain.id === selectedChainId) ?? supportedChains[0],
    [selectedChainId],
  )

  function saveSafe() {
    if (!isAddress(safeDraft)) {
      setSafeError('Enter a valid Safe address.')
      return
    }
    const checksummed = getAddress(safeDraft)
    localStorage.setItem(SAFE_STORAGE_KEY, checksummed)
    setSafeAddress(checksummed)
    setSafeDraft(checksummed)
    setSafeError(undefined)
  }

  function deleteSafe() {
    localStorage.removeItem(SAFE_STORAGE_KEY)
    setSafeAddress(undefined)
    setSafeDraft('')
    setSafeError(undefined)
  }

  function changeChain(chainId: SupportedChainId) {
    localStorage.setItem(CHAIN_STORAGE_KEY, chainId.toString())
    setSelectedChainId(chainId)
  }

  function prepareCancellation(transaction: ScheduledTransaction) {
    setCancelTransaction(transaction)
    window.requestAnimationFrame(() => {
      document.getElementById('transaction-panel')?.scrollIntoView({ behavior: 'smooth' })
    })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Timelock Guard Console home">
          <span className="brand-mark">TG</span>
          <span>
            Timelock Guard
            <small>Operator console</small>
          </span>
        </a>
        <div className="topbar-actions">
          <select
            className="network-select"
            aria-label="Network"
            value={selectedChainId}
            onChange={(event) => changeChain(Number(event.target.value) as SupportedChainId)}
          >
            {supportedChains.map((chain) => (
              <option key={chain.id} value={chain.id}>
                {chain.name}
              </option>
            ))}
          </select>
          <WalletButton selectedChainId={selectedChainId} />
        </div>
      </header>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">Safer Safe operations · {selectedChain.name}</p>
            <h1>Inspect the delay.<br />Queue with intent.</h1>
            <p className="hero-copy">
              Read the active guard, review queued transactions, and submit precisely encoded TimelockGuard calls from one
              focused workspace.
            </p>
          </div>
          <div className="hero-orbit" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span>⌛</span>
          </div>
        </section>

        <section className="panel safe-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Context</p>
              <h2>Select a Safe</h2>
            </div>
            <span className="step-marker">01</span>
          </div>
          <div className="safe-input-row">
            <input
              aria-label="Safe address"
              value={safeDraft}
              onChange={(event) => setSafeDraft(event.target.value)}
              placeholder="0x Safe address"
              onKeyDown={(event) => event.key === 'Enter' && saveSafe()}
            />
            <button className="primary-button compact" onClick={saveSafe}>Save & load</button>
            {safeAddress && <button className="text-button danger" onClick={deleteSafe}>Delete</button>}
          </div>
          <p className="field-help">Saved only in this browser. Change networks above to inspect the same address elsewhere.</p>
          {safeError && <div className="notice error">{safeError}</div>}
        </section>

        {safeAddress && (
          <>
            <section className="dashboard-grid">
              <article className="metric-card guard-card">
                <span className="metric-label">Guard status</span>
                <strong>{loading ? 'Reading…' : snapshot.isGuardSet ? 'Guard set' : 'No guard'}</strong>
                <span className={`guard-indicator ${snapshot.isGuardSet ? 'active' : ''}`} />
                <code title={snapshot.guardAddress}>{snapshot.guardAddress ? truncate(snapshot.guardAddress, 10, 8) : '—'}</code>
              </article>
              <article className="metric-card">
                <span className="metric-label">Timelock delay</span>
                <strong>{loading ? '—' : formatDuration(snapshot.delay)}</strong>
                <small>{snapshot.delay !== undefined ? `${snapshot.delay.toString()} seconds` : 'Awaiting guard data'}</small>
              </article>
              <article className="metric-card">
                <span className="metric-label">Cancellation threshold</span>
                <strong>{snapshot.cancellationThreshold?.toString() ?? '—'}</strong>
                <small>Maximum {snapshot.maxCancellationThreshold?.toString() ?? '—'} signatures</small>
              </article>
              <article className="metric-card">
                <span className="metric-label">Safe nonce</span>
                <strong>{snapshot.safeNonce?.toString() ?? '—'}</strong>
                <small>{snapshot.pending.length} pending transaction{snapshot.pending.length === 1 ? '' : 's'}</small>
              </article>
            </section>

            {error && <div className="notice error wide">{error}</div>}
            {snapshot.isGuardSet && !snapshot.isTimelockReadable && !loading && (
              <div className="notice warning wide">
                A guard is set, but it did not respond as TimelockGuard on {selectedChain.name}. Verify the network and
                deployed guard implementation.
              </div>
            )}

            <section className="pending-section">
              <div className="section-heading inline-heading">
                <div>
                  <p className="eyebrow">Queue</p>
                  <h2>Pending transactions</h2>
                </div>
                <button className="text-button" onClick={refresh} disabled={loading}>Refresh</button>
              </div>
              {snapshot.pending.length ? (
                <div className="pending-grid">
                  {snapshot.pending.map((transaction) => (
                    <PendingCard key={transaction.txHash} transaction={transaction} onCancel={prepareCancellation} />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span>00</span>
                  <h3>No pending transactions</h3>
                  <p>{loading ? 'Reading the guard queue…' : 'Scheduled transactions will appear here.'}</p>
                </div>
              )}
            </section>

            <TransactionPanel
              key={cancelTransaction?.txHash ?? 'transaction-panel'}
              safeAddress={safeAddress}
              chainId={selectedChainId}
              snapshot={snapshot}
              cancelHash={cancelTransaction?.txHash}
              cancelNonce={cancelTransaction?.nonce}
              onComplete={refresh}
            />
          </>
        )}
      </main>

      <footer>
        <span>TimelockGuard Console</span>
        <span>Always verify calldata and signatures before submitting.</span>
      </footer>
    </div>
  )
}
