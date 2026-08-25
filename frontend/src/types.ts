import type { Address, Hex } from 'viem'

export type ScheduledTransaction = {
  txHash: Hex
  executionTime: bigint
  state: number
  params: {
    to: Address
    value: bigint
    data: Hex
    operation: number
    safeTxGas: bigint
    baseGas: bigint
    gasPrice: bigint
    gasToken: Address
    refundReceiver: Address
  }
  nonce: bigint
}

export type GuardSnapshot = {
  guardAddress?: Address
  isGuardSet: boolean
  isTimelockReadable: boolean
  safeNonce?: bigint
  delay?: bigint
  cancellationThreshold?: bigint
  maxCancellationThreshold?: bigint
  pending: ScheduledTransaction[]
}

export type ActionName = 'schedule' | 'cancel' | 'signCancellation' | 'configure' | 'clear'
