import {
  MainVotingPluginDetails,
  MemberAccessPluginDetails,
  PersonalSpaceVotingPluginDetails,
  SpacePluginDetails,
} from "../../plugin-details";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Space
  console.log(`\nDeploying ${SpacePluginDetails.PLUGIN_SETUP_CONTRACT_NAME}`);

  await deploy(SpacePluginDetails.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [],
    log: true,
  });

  // Space
  console.log(
    `\nDeploying ${PersonalSpaceVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME}`,
  );

  await deploy(PersonalSpaceVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [],
    log: true,
  });

  // Space
  console.log(
    `\nDeploying ${MemberAccessPluginDetails.PLUGIN_SETUP_CONTRACT_NAME}`,
  );

  await deploy(MemberAccessPluginDetails.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [],
    log: true,
  });

  // Space
  console.log(
    `\nDeploying ${MainVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME}`,
  );

  await deploy(MainVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [],
    log: true,
  });
};

export default func;
func.tags = [
  SpacePluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  PersonalSpaceVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  MemberAccessPluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  MainVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  "Deployment",
];
