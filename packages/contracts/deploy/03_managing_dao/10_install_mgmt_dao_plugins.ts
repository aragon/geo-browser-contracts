import {GovernancePluginsSetupParams} from '../../plugin-setup-params';
import {
  GovernancePluginsSetup__factory,
  MajorityVotingBase,
  PluginSetupProcessor__factory,
} from '../../typechain';
import {
  InstallationPreparedEvent,
  PluginSetupRefStruct,
} from '../../typechain/@aragon/osx/framework/plugin/setup/PluginSetupProcessor';
import {findEvent, hashHelpers} from '../../utils/helpers';
import {getPluginRepoInfo} from '../../utils/plugin-repo-info';
import {IDAO, IDAO__factory, PluginSetupProcessor} from '@aragon/osx-ethers';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const MANAGING_DAO_ADDRESS = process.env.MANAGING_DAO_ADDRESS ?? '';
const PLUGIN_SETUP_PROCESSOR_ADDRESS =
  process.env.PLUGIN_SETUP_PROCESSOR_ADDRESS ?? '';
const MGMT_DAO_PROPOSAL_DURATION =
  parseInt(process.env.MGMT_DAO_PROPOSAL_DURATION ?? '604800') ||
  60 * 60 * 24 * 7;
const MGMT_DAO_MIN_PROPOSAL_PARTICIPATION =
  parseInt(process.env.MGMT_DAO_MIN_PROPOSAL_PARTICIPATION ?? '500000') ||
  500_000; // 50%
const MGMT_DAO_PROPOSAL_SUPPORT_THRESHOLD =
  parseInt(process.env.MGMT_DAO_PROPOSAL_SUPPORT_THRESHOLD ?? '500000') ||
  500_000; // 50%
const MGMT_DAO_INITIAL_EDITORS = process.env.MGMT_DAO_INITIAL_EDITORS
  ? process.env.MGMT_DAO_INITIAL_EDITORS.split(',')
  : ([] as string[]);

// Main function
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, network} = hre;
  const [deployer] = await hre.ethers.getSigners();

  // Locate the plugin setup address
  const setupDeployment = await deployments.get(
    GovernancePluginsSetupParams.PLUGIN_SETUP_CONTRACT_NAME
  );
  const pluginSetup = GovernancePluginsSetup__factory.connect(
    setupDeployment.address,
    deployer
  );

  // Call prepare installation
  const settings: MajorityVotingBase.VotingSettingsStruct = {
    duration: MGMT_DAO_PROPOSAL_DURATION,
    minParticipation: MGMT_DAO_MIN_PROPOSAL_PARTICIPATION,
    supportThreshold: MGMT_DAO_PROPOSAL_SUPPORT_THRESHOLD,
    votingMode: 1, // Early execution
  };
  const memberAccessProposalDuration = MGMT_DAO_PROPOSAL_DURATION * 3; // Time before expired
  const pluginUpgrader = '0x0000000000000000000000000000000000000000'; // Only the DAO
  const installData = await pluginSetup.encodeInstallationParams(
    settings,
    MGMT_DAO_INITIAL_EDITORS,
    memberAccessProposalDuration,
    pluginUpgrader
  );

  if (!PLUGIN_SETUP_PROCESSOR_ADDRESS)
    throw new Error('PLUGIN_SETUP_PROCESSOR_ADDRESS cannot be empty');

  console.log('Preparing an installation of the standard governance plugin');
  const psp = PluginSetupProcessor__factory.connect(
    PLUGIN_SETUP_PROCESSOR_ADDRESS,
    deployer
  );

  const pluginRepoInfo = getPluginRepoInfo(
    GovernancePluginsSetupParams.PLUGIN_REPO_ENS_NAME,
    network.name
  );
  if (!pluginRepoInfo) throw new Error('The plugin repo cannot be found');

  const pluginSetupRef: PluginSetupRefStruct = {
    pluginSetupRepo: pluginRepoInfo.address,
    versionTag: GovernancePluginsSetupParams.VERSION,
  };

  const tx = await psp.prepareInstallation(MANAGING_DAO_ADDRESS, {
    pluginSetupRef,
    data: installData,
  });
  await tx.wait();

  const preparedEvent = await findEvent<InstallationPreparedEvent>(
    tx,
    'InstallationPrepared'
  );
  if (!preparedEvent) {
    throw new Error('Failed to get InstallationPrepared event');
  }

  const pluginAddress = preparedEvent.args.plugin;
  const helpers = preparedEvent.args.preparedSetupData.helpers;
  const permissions = preparedEvent.args.preparedSetupData.permissions;

  // Encode a call to execute() > applyInstallation
  console.log('Installing the plugin to the managing DAO');
  const applyParams: PluginSetupProcessor.ApplyInstallationParamsStruct = {
    plugin: pluginAddress,
    helpersHash: hashHelpers(helpers),
    permissions,
    pluginSetupRef: {
      pluginSetupRepo: pluginRepoInfo.address,
      versionTag: GovernancePluginsSetupParams.VERSION,
    },
  };

  const actions: IDAO.ActionStruct[] = [
    {
      to: PLUGIN_SETUP_PROCESSOR_ADDRESS,
      value: 0,
      data: PluginSetupProcessor__factory.createInterface().encodeFunctionData(
        'applyInstallation',
        [MANAGING_DAO_ADDRESS, applyParams]
      ),
    },
  ];

  const tx2 = await IDAO__factory.connect(
    MANAGING_DAO_ADDRESS,
    deployer
  ).execute(
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    actions,
    0
  );
  await tx2.wait();

  hre.managingDao.address = MANAGING_DAO_ADDRESS;
  hre.managingDao.governancePlugin = pluginAddress;
};

export default func;
func.tags = [
  GovernancePluginsSetupParams.PLUGIN_SETUP_CONTRACT_NAME,
  'ManagingDAO',
];
