import { useMemo, useState, type FormEvent } from 'react'
import {
  BaseError,
  concatHex,
  encodeFunctionData,
  getAddress,
  hashTypedData,
  isAddress,
  isHex,
  parseSignature,
  recoverAddress,
  serializeSignature,
  type Address,
  type Hex,
} from 'viem'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { safeAbi, timelockGuardAbi, ZERO_ADDRESS } from './abi'
import type { SupportedChainId } from './config'
import type { ActionName, GuardSnapshot } from './types'

type Props = {
  safeAddress: Address
  chainId: SupportedChainId
  snapshot: GuardSnapshot
  cancelHash?: Hex
  cancelNonce?: bigint
  onComplete: () => void
}

const safeTxTypes = {
  SafeTx: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
    { name: 'operation', type: 'uint8' },
    { name: 'safeTxGas', type: 'uint256' },
    { name: 'baseGas', type: 'uint256' },
    { name: 'gasPrice', type: 'uint256' },
    { name: 'gasToken', type: 'address' },
    { name: 'refundReceiver', type: 'address' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

const actionLabels: Record<ActionName, string> = {
  schedule: 'Schedule transaction',
  cancel: 'Cancel transaction',
  signCancellation: 'Call signCancellation',
  configure: 'Configure guard',
  clear: 'Clear guard configuration',
}

const safeOnlyActions = new Set<ActionName>(['configure', 'clear'])

function Input({ label, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
      {hint && <small>{hint}</small>}
    </label>
  )
}

function TextArea({
  label,
  hint,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea {...props} />
      {hint && <small>{hint}</small>}
    </label>
  )
}

function parseUint(value: string, name: string) {
  if (!/^\d+$/.test(value.trim())) throw new Error(`${name} must be a non-negative integer.`)
  return BigInt(value.trim())
}

function parseBytes(value: string, name: string) {
  if (!isHex(value) || value.length % 2 !== 0) throw new Error(`${name} must be even-length 0x-prefixed hex.`)
  return value
}

function shortError(reason: unknown) {
  if (reason instanceof BaseError) return reason.shortMessage
  return reason instanceof Error ? reason.message : 'Transaction failed.'
}

export default function TransactionPanel({
  safeAddress,
  chainId,
  snapshot,
  cancelHash,
  cancelNonce,
  onComplete,
}: Props) {
  const { address: walletAddress, chainId: walletChainId, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })
  const [action, setAction] = useState<ActionName>(cancelHash ? 'cancel' : 'schedule')
  const [guardTarget, setGuardTarget] = useState('')
  const [nonce, setNonce] = useState('')
  const [target, setTarget] = useState('')
  const [value, setValue] = useState('0')
  const [data, setData] = useState('0x')
  const [operation, setOperation] = useState('0')
  const [safeTxGas, setSafeTxGas] = useState('0')
  const [baseGas, setBaseGas] = useState('0')
  const [gasPrice, setGasPrice] = useState('0')
  const [gasToken, setGasToken] = useState<string>(ZERO_ADDRESS)
  const [refundReceiver, setRefundReceiver] = useState<string>(ZERO_ADDRESS)
  const [signatures, setSignatures] = useState('0x')
  const [txHash, setTxHash] = useState<string>(cancelHash ?? '')
  const [delay, setDelay] = useState('86400')
  const [status, setStatus] = useState<string>()
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const [signing, setSigning] = useState(false)

  const requiresSafeCaller = safeOnlyActions.has(action)
  const walletRepresentsSafe = walletAddress?.toLowerCase() === safeAddress.toLowerCase()
  const resolvedGuardTarget = guardTarget || snapshot.guardAddress || ''
  const resolvedNonce =
    nonce || (action === 'cancel' ? cancelNonce?.toString() : undefined) || snapshot.safeNonce?.toString() || '0'
  const activeGuardAddress = isAddress(resolvedGuardTarget) ? getAddress(resolvedGuardTarget) : undefined

  function cancellationTypedData() {
    if (!activeGuardAddress) throw new Error('Enter a valid TimelockGuard contract address.')
    if (!isHex(txHash) || txHash.length !== 66) throw new Error('Transaction hash must be 32 bytes.')

    return {
      domain: { chainId, verifyingContract: safeAddress },
      types: safeTxTypes,
      primaryType: 'SafeTx' as const,
      message: {
        to: activeGuardAddress,
        value: 0n,
        data: encodeFunctionData({
          abi: timelockGuardAbi,
          functionName: 'signCancellation',
          args: [txHash],
        }),
        operation: 0,
        safeTxGas: 0n,
        baseGas: 0n,
        gasPrice: 0n,
        gasToken: ZERO_ADDRESS,
        refundReceiver: ZERO_ADDRESS,
        nonce: parseUint(resolvedNonce, 'Cancellation nonce'),
      },
    }
  }

  async function signCancellation() {
    setError(undefined)
    setStatus(undefined)

    try {
      if (!walletAddress || !walletClient || !publicClient) throw new Error('Connect a wallet first.')
      if (walletChainId !== chainId) throw new Error('Switch your wallet to the selected network.')

      const isOwner = await publicClient.readContract({
        address: safeAddress,
        abi: safeAbi,
        functionName: 'isOwner',
        args: [walletAddress],
      })
      if (!isOwner) throw new Error('The connected wallet is not an owner of this Safe.')

      const typedData = cancellationTypedData()
      setSigning(true)
      setStatus('Confirm the cancellation signature in your wallet…')
      const walletSignature = await walletClient.signTypedData({ account: walletAddress, ...typedData })
      const parsed = parseSignature(walletSignature)
      const normalizedSignature = serializeSignature({ ...parsed, v: BigInt(27 + parsed.yParity) })

      const existing = parseBytes(signatures, 'Cancellation signatures')
      if ((existing.length - 2) % 130 !== 0) {
        throw new Error('Existing signatures are not plain 65-byte EOA signatures and cannot be merged automatically.')
      }

      const digest = hashTypedData(typedData)
      const signaturesByOwner = new Map<string, Hex>()
      for (let offset = 2; offset < existing.length; offset += 130) {
        const signature = `0x${existing.slice(offset, offset + 130)}` as Hex
        const owner = await recoverAddress({ hash: digest, signature })
        signaturesByOwner.set(owner.toLowerCase(), signature)
      }
      signaturesByOwner.set(walletAddress.toLowerCase(), normalizedSignature)

      const ordered = [...signaturesByOwner.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, signature]) => signature)
      setSignatures(concatHex(ordered))

      const threshold = snapshot.cancellationThreshold
      setStatus(
        threshold === undefined
          ? `Added signature from ${walletAddress}.`
          : `Added signature ${ordered.length}/${threshold.toString()} from ${walletAddress}.`,
      )
    } catch (reason) {
      setError(shortError(reason))
      setStatus(undefined)
    } finally {
      setSigning(false)
    }
  }

  const buildCalldata = useMemo(() => {
    return () => {
      if (!activeGuardAddress) throw new Error('Enter a valid TimelockGuard contract address.')

      switch (action) {
        case 'schedule': {
          if (!isAddress(target)) throw new Error('Target must be a valid address.')
          if (!isAddress(gasToken)) throw new Error('Gas token must be a valid address.')
          if (!isAddress(refundReceiver)) throw new Error('Refund receiver must be a valid address.')
          if (operation !== '0' && operation !== '1') throw new Error('Operation must be Call or DelegateCall.')

          return encodeFunctionData({
            abi: timelockGuardAbi,
            functionName: 'scheduleTransaction',
            args: [
              safeAddress,
              parseUint(resolvedNonce, 'Nonce'),
              {
                to: getAddress(target),
                value: parseUint(value, 'Value'),
                data: parseBytes(data, 'Data'),
                operation: Number(operation),
                safeTxGas: parseUint(safeTxGas, 'Safe transaction gas'),
                baseGas: parseUint(baseGas, 'Base gas'),
                gasPrice: parseUint(gasPrice, 'Gas price'),
                gasToken: getAddress(gasToken),
                refundReceiver: getAddress(refundReceiver),
              },
              parseBytes(signatures, 'Signatures'),
            ],
          })
        }
        case 'cancel':
          if (!isHex(txHash) || txHash.length !== 66) throw new Error('Transaction hash must be 32 bytes.')
          return encodeFunctionData({
            abi: timelockGuardAbi,
            functionName: 'cancelTransaction',
            args: [
              safeAddress,
              txHash,
              parseUint(resolvedNonce, 'Cancellation nonce'),
              parseBytes(signatures, 'Signatures'),
            ],
          })
        case 'signCancellation':
          if (!isHex(txHash) || txHash.length !== 66) throw new Error('Transaction hash must be 32 bytes.')
          return encodeFunctionData({
            abi: timelockGuardAbi,
            functionName: 'signCancellation',
            args: [txHash],
          })
        case 'configure':
          return encodeFunctionData({
            abi: timelockGuardAbi,
            functionName: 'configureTimelockGuard',
            args: [parseUint(delay, 'Timelock delay')],
          })
        case 'clear':
          return encodeFunctionData({ abi: timelockGuardAbi, functionName: 'clearTimelockGuard' })
      }
    }
  }, [
    action,
    baseGas,
    data,
    delay,
    gasPrice,
    gasToken,
    resolvedNonce,
    operation,
    refundReceiver,
    safeAddress,
    safeTxGas,
    signatures,
    activeGuardAddress,
    target,
    txHash,
    value,
  ])

  const encodedData = useMemo(() => {
    try {
      return buildCalldata()
    } catch {
      return undefined
    }
  }, [buildCalldata])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(undefined)
    setStatus(undefined)

    try {
      if (!activeGuardAddress) throw new Error('Enter a valid TimelockGuard contract address.')
      if (!walletAddress || !walletClient || !publicClient) throw new Error('Connect a wallet first.')
      if (walletChainId !== chainId) throw new Error('Switch your wallet to the selected network.')
      if (requiresSafeCaller && !walletRepresentsSafe) {
        throw new Error('This function must be executed by the Safe. Copy the encoded call into Safe Transaction Builder.')
      }

      const callData = buildCalldata()
      setSubmitting(true)
      setStatus('Simulating transaction…')
      await publicClient.call({ account: walletAddress, to: activeGuardAddress, data: callData })

      setStatus('Confirm in your wallet…')
      const hash = await walletClient.sendTransaction({
        account: walletAddress,
        chain: walletClient.chain,
        to: activeGuardAddress,
        data: callData,
        value: 0n,
      })

      setStatus(`Submitted ${hash}. Waiting for confirmation…`)
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus(`Confirmed ${hash}`)
      onComplete()
    } catch (reason) {
      setError(shortError(reason))
      setStatus(undefined)
    } finally {
      setSubmitting(false)
    }
  }

  async function copyCalldata() {
    if (!encodedData) return
    await navigator.clipboard.writeText(encodedData)
    setStatus('Calldata copied.')
  }

  return (
    <section className="panel transaction-panel" id="transaction-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Write</p>
          <h2>Guard transaction</h2>
        </div>
        <span className="step-marker">02</span>
      </div>

      <form onSubmit={submit}>
        <Input
          label="TimelockGuard contract"
          value={resolvedGuardTarget}
          onChange={(event) => setGuardTarget(event.target.value)}
          placeholder="0x…"
          hint="Auto-filled from Safe storage. Keep the old address here when clearing an already-disabled guard."
        />
        <label className="field">
          <span>Function</span>
          <select value={action} onChange={(event) => setAction(event.target.value as ActionName)}>
            {(Object.keys(actionLabels) as ActionName[]).map((name) => (
              <option key={name} value={name}>
                {actionLabels[name]}
              </option>
            ))}
          </select>
        </label>

        {action === 'schedule' && (
          <div className="form-grid">
            <Input label="Safe nonce" value={resolvedNonce} onChange={(event) => setNonce(event.target.value)} />
            <Input label="Target" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="0x…" />
            <Input label="Value (wei)" value={value} onChange={(event) => setValue(event.target.value)} />
            <label className="field">
              <span>Operation</span>
              <select value={operation} onChange={(event) => setOperation(event.target.value)}>
                <option value="0">Call (0)</option>
                <option value="1">DelegateCall (1)</option>
              </select>
            </label>
            <TextArea label="Target calldata" value={data} onChange={(event) => setData(event.target.value)} />
            <TextArea
              label="Safe signatures"
              value={signatures}
              onChange={(event) => setSignatures(event.target.value)}
              hint="Concatenated signatures for this exact Safe transaction."
            />
            <details className="advanced-fields">
              <summary>Gas and refund fields</summary>
              <div className="form-grid">
                <Input label="safeTxGas" value={safeTxGas} onChange={(event) => setSafeTxGas(event.target.value)} />
                <Input label="baseGas" value={baseGas} onChange={(event) => setBaseGas(event.target.value)} />
                <Input label="gasPrice" value={gasPrice} onChange={(event) => setGasPrice(event.target.value)} />
                <Input label="gasToken" value={gasToken} onChange={(event) => setGasToken(event.target.value)} />
                <Input
                  label="refundReceiver"
                  value={refundReceiver}
                  onChange={(event) => setRefundReceiver(event.target.value)}
                />
              </div>
            </details>
          </div>
        )}

        {(action === 'cancel' || action === 'signCancellation') && (
          <div className="form-grid">
            <Input label="Scheduled transaction hash" value={txHash} onChange={(event) => setTxHash(event.target.value)} />
            {action === 'cancel' && (
              <>
                <Input label="Cancellation nonce" value={resolvedNonce} onChange={(event) => setNonce(event.target.value)} />
                <TextArea
                  label="Cancellation signatures"
                  value={signatures}
                  onChange={(event) => setSignatures(event.target.value)}
                  hint={`Safe EIP-712 signatures, sorted by owner address. Current threshold: ${snapshot.cancellationThreshold?.toString() ?? 'unknown'}.`}
                />
                <button
                  className="secondary-button sign-button"
                  type="button"
                  disabled={!isConnected || signing}
                  onClick={() => void signCancellation()}
                >
                  {signing ? 'Signing…' : 'Sign cancellation and add to form'}
                </button>
              </>
            )}
          </div>
        )}

        {action === 'configure' && (
          <Input label="Timelock delay (seconds)" value={delay} onChange={(event) => setDelay(event.target.value)} />
        )}

        {action === 'signCancellation' && (
          <div className="notice warning">
            This dummy function is meant to produce a Safe signing payload. Executing it only emits a message and does not
            cancel anything.
          </div>
        )}

        {requiresSafeCaller && !walletRepresentsSafe && (
          <div className="notice warning">
            <strong>Safe-only call.</strong> A normal EOA cannot execute this directly. Copy the calldata below and create a
            Safe transaction targeting the guard with value 0.
          </div>
        )}

        <div className="calldata-box">
          <span>Encoded calldata</span>
          <code>{encodedData ?? 'Complete the required fields to generate calldata.'}</code>
          <button className="text-button" type="button" disabled={!encodedData} onClick={() => void copyCalldata()}>
            Copy calldata
          </button>
        </div>

        {error && <div className="notice error">{error}</div>}
        {status && <div className="notice success">{status}</div>}

        <button
          className="primary-button"
          type="submit"
          disabled={!isConnected || !encodedData || submitting || (requiresSafeCaller && !walletRepresentsSafe)}
        >
          {submitting ? 'Processing…' : requiresSafeCaller && !walletRepresentsSafe ? 'Execute through Safe' : 'Execute with wallet'}
        </button>
      </form>
    </section>
  )
}
