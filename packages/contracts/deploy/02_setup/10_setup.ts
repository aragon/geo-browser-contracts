import {
  GovernancePluginsSetupParams,
  PersonalSpaceAdminPluginSetupParams,
  SpacePluginSetupParams,
} from '../../plugin-setup-params';
import {activeContractsList} from '@aragon/osx-ethers';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts, network} = hre;
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  const pspAddress =
    activeContractsList[network.name as keyof typeof activeContractsList]
      .PluginSetupProcessor;

  console.log(
    `\nUsing the PluginSetupProcessor address ${pspAddress} on ${network.name}`
  );

  // Space Setup
  console.log(
    `\nDeploying ${SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME}`
  );

  await deploy(SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [pspAddress],
    log: true,
  });

  // Personal Space Setup
  console.log(
    `\nDeploying ${PersonalSpaceAdminPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME}`
  );

  await deploy(PersonalSpaceAdminPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [],
    log: true,
  });

  // Governance Setup
  console.log(
    `\nDeploying ${GovernancePluginsSetupParams.PLUGIN_SETUP_CONTRACT_NAME}`
  );

  await deploy(GovernancePluginsSetupParams.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [pspAddress],
    log: true,
  });
};

export default func;
func.tags = [
  SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  PersonalSpaceAdminPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  GovernancePluginsSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  'Deployment',
];
