import {
  GovernancePluginsSetupParams,
  PersonalSpaceAdminPluginSetupParams,
  SpacePluginSetupParams,
} from '../../plugin-setup-params';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  // Space
  console.log(
    `\nDeploying ${SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME}`
  );

  await deploy(SpacePluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [],
    log: true,
  });

  // Personal Space
  console.log(
    `\nDeploying ${PersonalSpaceAdminPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME}`
  );

  await deploy(PersonalSpaceAdminPluginSetupParams.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [],
    log: true,
  });

  // Governance
  console.log(
    `\nDeploying ${GovernancePluginsSetupParams.PLUGIN_SETUP_CONTRACT_NAME}`
  );

  await deploy(GovernancePluginsSetupParams.PLUGIN_SETUP_CONTRACT_NAME, {
    from: deployer,
    args: [],
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
