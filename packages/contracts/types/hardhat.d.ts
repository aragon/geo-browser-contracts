export type VerifyEntry = {
  address: string;
  args?: any[];
};

declare module 'hardhat/types/runtime' {
  interface HardhatRuntimeEnvironment {
    aragonToVerifyContracts: VerifyEntry[];
    managingDao: {
      address: string;
      governancePlugin: string;
    };
  }
}
