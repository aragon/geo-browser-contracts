export type VerifyEntry = {
  address: string;
  args?: any[];
};

declare module 'hardhat/types' {
  interface HardhatRuntimeEnvironment {
    aragonToVerifyContracts: VerifyEntry[];
    managingDao: {
      address: string;
      governancePlugin: string;
    };
  }
}
