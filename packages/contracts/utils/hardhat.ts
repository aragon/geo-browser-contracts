export function isLocalChain(networkName: string) {
  return ['localhost', 'hardhat', 'coverage'].includes(networkName);
}
