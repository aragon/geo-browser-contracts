import {
  MainVotingPluginSetupParams,
  MemberAccessPluginSetupParams,
  PersonalSpaceVotingPluginSetupParams,
  SpacePluginSetupParams,
} from "../../plugin-setup-params";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Space
  console.log(
    `\nDeploying ${SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME}`,
  );

  await deploy(SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [],
    log: true,
  });

  // Space
  console.log(
    `\nDeploying ${PersonalSpaceVotingPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME}`,
  );

  await deploy(
    PersonalSpaceVotingPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
    {
      from: deployer,
      args: [],
      log: true,
    },
  );

  // Space
  console.log(
    `\nDeploying ${MemberAccessPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME}`,
  );

  await deploy(MemberAccessPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [],
    log: true,
  });

  // Space
  console.log(
    `\nDeploying ${MainVotingPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME}`,
  );

  await deploy(MainVotingPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [],
    log: true,
  });
};

export default func;
func.tags = [
  SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  PersonalSpaceVotingPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  MemberAccessPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  MainVotingPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  "Deployment",
];
