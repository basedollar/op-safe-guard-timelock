# TimelockGuard calldata encoder

`EncodeTimelockGuard.s.sol` converts one fully specified Safe transaction into:

1. the direct `TimelockGuard.scheduleTransaction` call used to schedule it; and
2. the matching `Safe.execTransaction` call used after the timelock expires.

The script only encodes and prints data. It does not broadcast.

It covers every operator-facing state-changing function on `TimelockGuard`. The view functions
are regular `eth_call`s, while `checkTransaction` and `checkAfterExecution` are Safe guard
callbacks and should not be submitted manually.

## Schedule a standard call

```bash
forge script scripts/safe/EncodeTimelockGuard.s.sol:EncodeTimelockGuard \
  --sig 'schedule(address,address,uint256,address,uint256,bytes,bytes)' \
  <TIMELOCK_GUARD> \
  <SAFE> \
  <SAFE_NONCE> \
  <TARGET> \
  <VALUE_WEI> \
  <TARGET_CALLDATA> \
  <SAFE_SIGNATURES>
```

This command assumes `Call` operation and zero values for `safeTxGas`, `baseGas`, `gasPrice`,
`gasToken`, and `refundReceiver`. Use `scheduleWithOptions` if any of those fields differ:

```bash
forge script scripts/safe/EncodeTimelockGuard.s.sol:EncodeTimelockGuard \
  --sig 'scheduleWithOptions(address,address,uint256,(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address),bytes)' \
  <TIMELOCK_GUARD> <SAFE> <SAFE_NONCE> \
  '(<TARGET>,<VALUE_WEI>,<TARGET_CALLDATA>,<OPERATION>,<SAFE_TX_GAS>,<BASE_GAS>,<GAS_PRICE>,<GAS_TOKEN>,<REFUND_RECEIVER>)' \
  <SAFE_SIGNATURES>
```

`OPERATION` is `0` for `Call` and `1` for `DelegateCall`.

The nonce, target, value, calldata, operation, gas/refund fields, and signatures must be identical
to the transaction that was signed. The printed schedule call is sent directly to the
`TimelockGuard`, with value `0`; it is not executed through the Safe.

## Other guard operations

```bash
# Configure the guard through the Safe.
forge script scripts/safe/EncodeTimelockGuard.s.sol:EncodeTimelockGuard \
  --sig 'configure(address,uint256,uint256,bytes)' \
  <TIMELOCK_GUARD> <SAFE_NONCE> <DELAY_SECONDS> <SAFE_SIGNATURES>

# Produce the cancellation payload to sign and the direct guard cancellation call.
forge script scripts/safe/EncodeTimelockGuard.s.sol:EncodeTimelockGuard \
  --sig 'cancel(address,address,bytes32,uint256,bytes)' \
  <TIMELOCK_GUARD> <SAFE> <SCHEDULED_TX_HASH> <CANCELLATION_NONCE> <CANCELLATION_SIGNATURES>

# Produce only the dummy signCancellation Safe payload.
forge script scripts/safe/EncodeTimelockGuard.s.sol:EncodeTimelockGuard \
  --sig 'signCancellation(address,address,bytes32,uint256,bytes)' \
  <TIMELOCK_GUARD> <SAFE> <SCHEDULED_TX_HASH> <CANCELLATION_NONCE> <CANCELLATION_SIGNATURES>

# Clear configuration through the Safe, after the Safe has disabled the guard.
forge script scripts/safe/EncodeTimelockGuard.s.sol:EncodeTimelockGuard \
  --sig 'clear(address,uint256,bytes)' <TIMELOCK_GUARD> <SAFE_NONCE> <SAFE_SIGNATURES>
```
