import { networks } from "../../hardhat.config";
import { deployments, network } from "hardhat";

export async function initializeFork(
  forkNetwork: string,
  blockNumber: number,
): Promise<void> {
  if (!(networks as any)[forkNetwork]) {
    throw new Error(`No info found for network '${forkNetwork}'.`);
  }

  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: `${(networks as any)[forkNetwork].url}`,
          blockNumber: blockNumber,
        },
      },
    ],
  });
}

export async function initializeDeploymentFixture(tag: string | string[]) {
  const fixture = deployments.createFixture(async () => {
    await deployments.fixture(tag); // ensure you start from a fresh deployments
  });

  await fixture();
}
