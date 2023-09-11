import {
  MainVotingPluginDetails,
  MemberAccessPluginDetails,
  PersonalSpaceVotingPluginDetails,
  SpacePluginDetails,
} from "../../plugin-details";
import {
  MainVotingPlugin__factory,
  MainVotingPluginSetup__factory,
  MemberAccessPluginSetup__factory,
  MemberAccessVotingPlugin__factory,
  PersonalSpaceVotingPlugin__factory,
  PersonalSpaceVotingPluginSetup__factory,
  SpacePlugin__factory,
  SpacePluginSetup__factory,
} from "../../typechain";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { setTimeout } from "timers/promises";

const func: DeployFunction = function (hre: HardhatRuntimeEnvironment) {
  return concludeSpaceSetup(hre)
    .then(() => concludePersonalSpaceVotingSetup(hre))
    .then(() => concludeMemberAccessVotingSetup(hre))
    .then(() => concludeMainVotingSetup(hre));
};

async function concludeSpaceSetup(hre: HardhatRuntimeEnvironment) {
  const { deployments, network } = hre;
  const [deployer] = await hre.ethers.getSigners();

  console.log(
    `Concluding ${SpacePluginDetails.PLUGIN_SETUP_CONTRACT_NAME} deployment.\n`,
  );

  const setupDeployment = await deployments.get(
    SpacePluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  );
  const setup = SpacePluginSetup__factory.connect(
    setupDeployment.address,
    deployer,
  );
  const implementation = SpacePlugin__factory.connect(
    await setup.implementation(),
    deployer,
  );

  // Add a timeout for polygon because the call to `implementation()` can fail for newly deployed contracts in the first few seconds
  if (network.name === "polygon") {
    console.log(`Waiting 30secs for ${network.name} to finish up...`);
    await setTimeout(30000);
  }

  hre.aragonToVerifyContracts.push({
    address: setupDeployment.address,
    args: setupDeployment.args,
  });
  hre.aragonToVerifyContracts.push({
    address: implementation.address,
    args: [],
  });
}

async function concludePersonalSpaceVotingSetup(
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, network } = hre;
  const [deployer] = await hre.ethers.getSigners();

  console.log(
    `Concluding ${PersonalSpaceVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME} deployment.\n`,
  );

  const setupDeployment = await deployments.get(
    PersonalSpaceVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  );
  const setup = PersonalSpaceVotingPluginSetup__factory.connect(
    setupDeployment.address,
    deployer,
  );
  const implementation = PersonalSpaceVotingPlugin__factory.connect(
    await setup.implementation(),
    deployer,
  );

  // Add a timeout for polygon because the call to `implementation()` can fail for newly deployed contracts in the first few seconds
  if (network.name === "polygon") {
    console.log(`Waiting 30secs for ${network.name} to finish up...`);
    await setTimeout(30000);
  }

  hre.aragonToVerifyContracts.push({
    address: setupDeployment.address,
    args: setupDeployment.args,
  });
  hre.aragonToVerifyContracts.push({
    address: implementation.address,
    args: [],
  });
}

async function concludeMemberAccessVotingSetup(
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, network } = hre;
  const [deployer] = await hre.ethers.getSigners();

  console.log(
    `Concluding ${MemberAccessPluginDetails.PLUGIN_SETUP_CONTRACT_NAME} deployment.\n`,
  );

  const setupDeployment = await deployments.get(
    MemberAccessPluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  );
  const setup = MemberAccessPluginSetup__factory.connect(
    setupDeployment.address,
    deployer,
  );
  const implementation = MemberAccessVotingPlugin__factory.connect(
    await setup.implementation(),
    deployer,
  );

  // Add a timeout for polygon because the call to `implementation()` can fail for newly deployed contracts in the first few seconds
  if (network.name === "polygon") {
    console.log(`Waiting 30secs for ${network.name} to finish up...`);
    await setTimeout(30000);
  }

  hre.aragonToVerifyContracts.push({
    address: setupDeployment.address,
    args: setupDeployment.args,
  });
  hre.aragonToVerifyContracts.push({
    address: implementation.address,
    args: [],
  });
}

async function concludeMainVotingSetup(
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, network } = hre;
  const [deployer] = await hre.ethers.getSigners();

  console.log(
    `Concluding ${MainVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME} deployment.\n`,
  );

  const setupDeployment = await deployments.get(
    MainVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  );
  const setup = MainVotingPluginSetup__factory.connect(
    setupDeployment.address,
    deployer,
  );
  const implementation = MainVotingPlugin__factory.connect(
    await setup.implementation(),
    deployer,
  );

  // Add a timeout for polygon because the call to `implementation()` can fail for newly deployed contracts in the first few seconds
  if (network.name === "polygon") {
    console.log(`Waiting 30secs for ${network.name} to finish up...`);
    await setTimeout(30000);
  }

  hre.aragonToVerifyContracts.push({
    address: setupDeployment.address,
    args: setupDeployment.args,
  });
  hre.aragonToVerifyContracts.push({
    address: implementation.address,
    args: [],
  });
}

export default func;
func.tags = [
  SpacePluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  PersonalSpaceVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  MemberAccessPluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  MainVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  "Verification",
];
