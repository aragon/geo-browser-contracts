import {
  StdGovernanceSetupParams,
  PersonalAdminSetupParams,
  SpacePluginSetupParams,
} from '../../plugin-setup-params';
import {
  StdGovernanceSetup__factory,
  StdGovernancePlugin__factory,
  StdMemberAddHelper__factory,
  PersonalAdminPlugin__factory,
  PersonalAdminSetup__factory,
  SpacePlugin__factory,
  SpacePluginSetup__factory,
} from '../../typechain';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {setTimeout} from 'timers/promises';

const func: DeployFunction = function (hre: HardhatRuntimeEnvironment) {
  return concludeSpaceSetup(hre)
    .then(() => concludePersonalSpaceVotingSetup(hre))
    .then(() => concludeGovernanceSetup(hre));
};

async function concludeSpaceSetup(hre: HardhatRuntimeEnvironment) {
  const {deployments, network} = hre;
  const [deployer] = await hre.ethers.getSigners();

  console.log(
    `Concluding ${SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME} deployment.\n`
  );

  const setupDeployment = await deployments.get(
    SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME
  );
  const setup = SpacePluginSetup__factory.connect(
    setupDeployment.address,
    deployer
  );
  const implementation = SpacePlugin__factory.connect(
    await setup.implementation(),
    deployer
  );

  // Add a timeout for polygon because the call to `implementation()` can fail for newly deployed contracts in the first few seconds
  if (network.name === 'polygon') {
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
  hre: HardhatRuntimeEnvironment
) {
  const {deployments, network} = hre;
  const [deployer] = await hre.ethers.getSigners();

  console.log(
    `Concluding ${PersonalAdminSetupParams.PLUGIN_SETUP_CONTRACT_NAME} deployment.\n`
  );

  const setupDeployment = await deployments.get(
    PersonalAdminSetupParams.PLUGIN_SETUP_CONTRACT_NAME
  );
  const setup = PersonalAdminSetup__factory.connect(
    setupDeployment.address,
    deployer
  );
  const implementation = PersonalAdminPlugin__factory.connect(
    await setup.implementation(),
    deployer
  );

  // Add a timeout for polygon because the call to `implementation()` can fail for newly deployed contracts in the first few seconds
  if (network.name === 'polygon') {
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

async function concludeGovernanceSetup(hre: HardhatRuntimeEnvironment) {
  const {deployments, network} = hre;
  const [deployer] = await hre.ethers.getSigners();

  console.log(
    `Concluding ${StdGovernanceSetupParams.PLUGIN_SETUP_CONTRACT_NAME} deployment.\n`
  );

  const setupDeployment = await deployments.get(
    StdGovernanceSetupParams.PLUGIN_SETUP_CONTRACT_NAME
  );
  const setup = StdGovernanceSetup__factory.connect(
    setupDeployment.address,
    deployer
  );
  const stdGovernancePluginImplementation =
    StdGovernancePlugin__factory.connect(
      await setup.implementation(),
      deployer
    );
  const stdMemberAddHelperImplementation = StdMemberAddHelper__factory.connect(
    await setup.helperImplementation(),
    deployer
  );

  // Add a timeout for polygon because the call to `implementation()` can fail for newly deployed contracts in the first few seconds
  if (network.name === 'polygon') {
    console.log(`Waiting 30secs for ${network.name} to finish up...`);
    await setTimeout(30000);
  }

  hre.aragonToVerifyContracts.push({
    address: setupDeployment.address,
    args: setupDeployment.args,
  });
  hre.aragonToVerifyContracts.push({
    address: stdGovernancePluginImplementation.address,
    args: [],
  });
  hre.aragonToVerifyContracts.push({
    address: stdMemberAddHelperImplementation.address,
    args: [],
  });
}

export default func;
func.tags = [
  SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  PersonalAdminSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  StdGovernanceSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  'Verification',
];
