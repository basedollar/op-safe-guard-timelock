# Timelock Guard Console

A Vite + TypeScript frontend for inspecting and operating a `TimelockGuard`-protected Safe.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

The app supports Ethereum, Optimism, Base, Arbitrum, and Sepolia using each chain's public default
RPC. To use a dedicated RPC, replace the corresponding `http()` transport in `src/config.ts` with
`http(import.meta.env.VITE_<NETWORK>_RPC_URL)`.

## Supported operations

- Read the guard directly from the Safe guard storage slot.
- Display timelock delay, Safe nonce, cancellation thresholds, and pending transactions.
- Sign the exact Safe EIP-712 cancellation payload with a connected Safe owner and add the
  address-sorted signature to the cancellation form.
- Submit `scheduleTransaction`, `cancelTransaction`, and the dummy `signCancellation` call.
- Encode `configureTimelockGuard` and `clearTimelockGuard` for execution through the Safe.

`configureTimelockGuard` and `clearTimelockGuard` require `msg.sender` to be the Safe. The app only
enables direct execution when the connected wallet provider represents the selected Safe address;
otherwise it provides calldata to paste into Safe Transaction Builder.

The selected Safe address and network are stored in browser `localStorage`. The **Delete** action
removes the stored Safe.
