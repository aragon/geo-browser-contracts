import {
  MainVotingPluginSetupParams,
  MemberAccessPluginSetupParams,
  PersonalSpaceAdminPluginSetupParams,
  SpacePluginSetupParams,
} from "../../plugin-setup-params";
import {
  MainVotingPlugin__factory,
  MainVotingPluginSetup__factory,
  MemberAccessPlugin__factory,
  MemberAccessPluginSetup__factory,
  PersonalSpaceAdminPlugin__factory,
  PersonalSpaceAdminPluginSetup__factory,
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
    `Concluding ${SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME} deployment.\n`,
  );

  const setupDeployment = await deployments.get(
    SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
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
    console.log(`Waiting 30 secs for ${network.name} to finish up...`);
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
    `Concluding ${PersonalSpaceAdminPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME} deployment.\n`,
  );

  const setupDeployment = await deployments.get(
    PersonalSpaceAdminPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  );
  const setup = PersonalSpaceAdminPluginSetup__factory.connect(
    setupDeployment.address,
    deployer,
  );
  const implementation = PersonalSpaceAdminPlugin__factory.connect(
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
    `Concluding ${MemberAccessPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME} deployment.\n`,
  );

  const setupDeployment = await deployments.get(
    MemberAccessPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  );
  const setup = MemberAccessPluginSetup__factory.connect(
    setupDeployment.address,
    deployer,
  );
  const implementation = MemberAccessPlugin__factory.connect(
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
    `Concluding ${MainVotingPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME} deployment.\n`,
  );

  const setupDeployment = await deployments.get(
    MainVotingPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
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
  SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  PersonalSpaceAdminPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  MemberAccessPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  MainVotingPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  "Verification",
];
