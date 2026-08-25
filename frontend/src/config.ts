import { createConfig, http } from 'wagmi'
import { arbitrum, arbitrumSepolia, base, baseSepolia, mainnet, optimism, optimismSepolia, sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const supportedChains = [mainnet, optimism, base, arbitrum, sepolia, optimismSepolia, baseSepolia, arbitrumSepolia] as const
export type SupportedChainId = (typeof supportedChains)[number]['id']

export const config = createConfig({
  chains: supportedChains,
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [optimism.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [sepolia.id]: http(),
    [optimismSepolia.id]: http(),
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
