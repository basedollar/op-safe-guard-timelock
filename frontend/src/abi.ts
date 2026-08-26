export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export const GUARD_STORAGE_SLOT =
  0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8n

const execTransactionComponents = [
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'data', type: 'bytes' },
  { name: 'operation', type: 'uint8' },
  { name: 'safeTxGas', type: 'uint256' },
  { name: 'baseGas', type: 'uint256' },
  { name: 'gasPrice', type: 'uint256' },
  { name: 'gasToken', type: 'address' },
  { name: 'refundReceiver', type: 'address' },
] as const

export const timelockGuardAbi = [
  {
    type: 'function',
    name: 'timelockDelay',
    stateMutability: 'view',
    inputs: [{ name: '_safe', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'cancellationThreshold',
    stateMutability: 'view',
    inputs: [{ name: '_safe', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'maxCancellationThreshold',
    stateMutability: 'view',
    inputs: [{ name: '_safe', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'pendingTransactions',
    stateMutability: 'view',
    inputs: [{ name: '_safe', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'txHash', type: 'bytes32' },
          { name: 'executionTime', type: 'uint256' },
          { name: 'state', type: 'uint8' },
          { name: 'params', type: 'tuple', components: execTransactionComponents },
          { name: 'nonce', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'scheduledTransaction',
    stateMutability: 'view',
    inputs: [
      { name: '_safe', type: 'address' },
      { name: '_txHash', type: 'bytes32' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'txHash', type: 'bytes32' },
          { name: 'executionTime', type: 'uint256' },
          { name: 'state', type: 'uint8' },
          { name: 'params', type: 'tuple', components: execTransactionComponents },
          { name: 'nonce', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'scheduleTransaction',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_safe', type: 'address' },
      { name: '_nonce', type: 'uint256' },
      { name: '_params', type: 'tuple', components: execTransactionComponents },
      { name: '_signatures', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelTransaction',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_safe', type: 'address' },
      { name: '_txHash', type: 'bytes32' },
      { name: '_nonce', type: 'uint256' },
      { name: '_signatures', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'signCancellation',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_txHash', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'configureTimelockGuard',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_timelockDelay', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'clearTimelockGuard',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const

export const safeAbi = [
  {
    type: 'function',
    name: 'isOwner',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getStorageAt',
    stateMutability: 'view',
    inputs: [
      { name: 'offset', type: 'uint256' },
      { name: 'length', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
  {
    type: 'function',
    name: 'nonce',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const
