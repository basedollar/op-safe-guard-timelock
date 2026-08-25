import { useCallback, useEffect, useState } from 'react'
import { getAddress, type Address, type Hex } from 'viem'
import { usePublicClient } from 'wagmi'
import { GUARD_STORAGE_SLOT, safeAbi, timelockGuardAbi, ZERO_ADDRESS } from './abi'
import type { SupportedChainId } from './config'
import type { GuardSnapshot, ScheduledTransaction } from './types'

const emptySnapshot: GuardSnapshot = {
  isGuardSet: false,
  isTimelockReadable: false,
  pending: [],
}

function guardFromStorage(word: Hex): Address | undefined {
  if (word.length < 42) return undefined
  const candidate = `0x${word.slice(-40)}` as Address
  return candidate.toLowerCase() === ZERO_ADDRESS ? undefined : getAddress(candidate)
}

export function useGuardSnapshot(safeAddress: Address | undefined, chainId: SupportedChainId) {
  const publicClient = usePublicClient({ chainId })
  const [snapshot, setSnapshot] = useState<GuardSnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!safeAddress || !publicClient) {
        setSnapshot(emptySnapshot)
        setError(undefined)
        return
      }

      setLoading(true)
      setError(undefined)

      try {
        const [guardWord, safeNonce] = await Promise.all([
          publicClient.readContract({
            address: safeAddress,
            abi: safeAbi,
            functionName: 'getStorageAt',
            args: [GUARD_STORAGE_SLOT, 1n],
          }),
          publicClient.readContract({ address: safeAddress, abi: safeAbi, functionName: 'nonce' }),
        ])

        const guardAddress = guardFromStorage(guardWord)
        if (!guardAddress) {
          if (!cancelled) {
            setSnapshot({ ...emptySnapshot, safeNonce })
          }
          return
        }

        try {
          const [delay, cancellationThreshold, maxCancellationThreshold, pending] = await Promise.all([
            publicClient.readContract({
              address: guardAddress,
              abi: timelockGuardAbi,
              functionName: 'timelockDelay',
              args: [safeAddress],
            }),
            publicClient.readContract({
              address: guardAddress,
              abi: timelockGuardAbi,
              functionName: 'cancellationThreshold',
              args: [safeAddress],
            }),
            publicClient.readContract({
              address: guardAddress,
              abi: timelockGuardAbi,
              functionName: 'maxCancellationThreshold',
              args: [safeAddress],
            }),
            publicClient.readContract({
              address: guardAddress,
              abi: timelockGuardAbi,
              functionName: 'pendingTransactions',
              args: [safeAddress],
            }),
          ])

          if (!cancelled) {
            setSnapshot({
              guardAddress,
              isGuardSet: true,
              isTimelockReadable: true,
              safeNonce,
              delay,
              cancellationThreshold,
              maxCancellationThreshold,
              pending: pending as unknown as ScheduledTransaction[],
            })
          }
        } catch {
          if (!cancelled) {
            setSnapshot({
              guardAddress,
              isGuardSet: true,
              isTimelockReadable: false,
              safeNonce,
              pending: [],
            })
          }
        }
      } catch (reason) {
        if (!cancelled) {
          setSnapshot(emptySnapshot)
          setError(reason instanceof Error ? reason.message : 'Unable to read the Safe contract.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [publicClient, refreshKey, safeAddress])

  return { snapshot, loading, error, refresh }
}
