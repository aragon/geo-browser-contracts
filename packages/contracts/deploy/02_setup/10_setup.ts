import {
  GovernancePluginsSetupParams,
  PersonalSpaceAdminPluginSetupParams,
  SpacePluginSetupParams,
} from '../../plugin-setup-params';
import {isLocalChain} from '../../utils/hardhat';
import {getPluginSetupProcessorAddress} from '../../utils/helpers';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts, network} = hre;
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  let pspAddress: string;
  if (
    process.env.PLUGIN_SETUP_PROCESSOR_ADDRESS &&
    !isLocalChain(hre.network.name)
  ) {
    pspAddress = process.env.PLUGIN_SETUP_PROCESSOR_ADDRESS;
  } else {
    pspAddress = getPluginSetupProcessorAddress(network.name);
    if (!pspAddress)
      throw new Error(
        'PLUGIN_SETUP_PROCESSOR_ADDRESS is empty and no default value is available for ' +
          network.name
      );

    console.log(
      'Using the default Plugin Setup Processor address (PLUGIN_SETUP_PROCESSOR_ADDRESS is empty)'
    );
  }

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
