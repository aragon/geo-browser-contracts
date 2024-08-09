import {GovernancePluginsSetupParams} from '../plugin-setup-params';
import {
  GovernancePluginsSetup__factory,
  MajorityVotingBase,
  PluginSetupProcessor__factory,
} from '../typechain';
import {ExecutedEvent} from '../typechain/@aragon/osx/core/dao/DAO';
import {
  InstallationPreparedEvent,
  PluginSetupRefStruct,
} from '../typechain/@aragon/osx/framework/plugin/setup/PluginSetupProcessor';
import {findEvent, hashHelpers} from '../utils/helpers';
import {
  DAO__factory,
  IDAO,
  IDAO__factory,
  PluginRepo__factory,
  PluginSetupProcessor,
} from '@aragon/osx-ethers';
import {config as dotenvConfig} from 'dotenv';
import {Wallet, providers} from 'ethers';
import {resolve} from 'path';

const dotenvConfigPath: string =
  process.env.DOTENV_CONFIG_PATH || '../../../.env';
dotenvConfig({path: resolve(__dirname, dotenvConfigPath)});

if (!process.env.PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY in .env not set');
} else if (!process.env.ALCHEMY_API_KEY) {
  throw new Error('ALCHEMY_API_KEY in .env not set');
}

const {
  NETWORK_NAME,
  ALCHEMY_API_KEY,
  MANAGING_DAO_ADDRESS,
  PLUGIN_SETUP_PROCESSOR_ADDRESS,
  GOVERNANCE_PLUGIN_REPO_ADDRESS,
} = process.env;

const MGMT_DAO_PROPOSAL_DURATION =
  parseInt(process.env.MGMT_DAO_PROPOSAL_DURATION ?? '604800') ||
  60 * 60 * 24 * 7;
const MGMT_DAO_PROPOSAL_SUPPORT_THRESHOLD =
  parseInt(process.env.MGMT_DAO_PROPOSAL_SUPPORT_THRESHOLD ?? '500000') ||
  500_000; // 50%
const MGMT_DAO_INITIAL_EDITORS = process.env.MGMT_DAO_INITIAL_EDITORS
  ? process.env.MGMT_DAO_INITIAL_EDITORS.split(',')
  : ([] as string[]);

const infuraProvider = new providers.AlchemyProvider(
  NETWORK_NAME,
  ALCHEMY_API_KEY
);
const deployer = new Wallet(process.env.PRIVATE_KEY!).connect(infuraProvider);

async function main() {
  if (
    !NETWORK_NAME ||
    !ALCHEMY_API_KEY ||
    !MANAGING_DAO_ADDRESS ||
    !PLUGIN_SETUP_PROCESSOR_ADDRESS ||
    !GOVERNANCE_PLUGIN_REPO_ADDRESS
  ) {
    console.error('Some of .env file values are missing or empty');
    process.exit(1);
  }

  await checkManagingDaoPre();

  // Prepare the plugin details
  const preparedInstallation = await prepareInstallation();

  // Apply the installation
  await applyInstallation(preparedInstallation);

  // Drop the execute permission
  await dropDeployerWalletPermissions();

  // Check the final permissions
  await checkManagingDaoPost(preparedInstallation);
}

// Helpers

async function checkManagingDaoPre() {
  console.log('Configuring the Managing DAO deployed at', MANAGING_DAO_ADDRESS);
  const mgmtDAO = DAO__factory.connect(MANAGING_DAO_ADDRESS!, deployer);

  // Deployer should have execute permission on the DAO
  const canExecute = await mgmtDAO.hasPermission(
    MANAGING_DAO_ADDRESS!,
    deployer.address,
    await mgmtDAO.EXECUTE_PERMISSION_ID(),
    '0x'
  );
  if (!canExecute) {
    throw new Error(
      'The given deployment wallet cannot execute actions on the DAO'
    );
  }

  // The DAO should have root permission on itself
  let isRoot = await mgmtDAO.hasPermission(
    MANAGING_DAO_ADDRESS!,
    MANAGING_DAO_ADDRESS!,
    await mgmtDAO.ROOT_PERMISSION_ID(),
    '0x'
  );
  if (!isRoot) {
    throw new Error('The given Managing DAO is not root on itself');
  }

  // The PSP should not have root permission on the DAO
  isRoot = await mgmtDAO.hasPermission(
    MANAGING_DAO_ADDRESS!,
    PLUGIN_SETUP_PROCESSOR_ADDRESS!,
    await mgmtDAO.ROOT_PERMISSION_ID(),
    '0x'
  );
  if (isRoot) {
    throw new Error(
      'The Plugin Setup Processor should not have root permission on the managing DAO (yet)'
    );
  }
}

async function prepareInstallation() {
  const pluginRepo = PluginRepo__factory.connect(
    GOVERNANCE_PLUGIN_REPO_ADDRESS!,
    deployer
  );
  const pluginSetupInfo = await pluginRepo['getLatestVersion(uint8)'](
    GovernancePluginsSetupParams.VERSION.release
  );
  if (!pluginSetupInfo.pluginSetup) {
    throw new Error('The Governance plugin is not available');
  }
  const pluginSetup = GovernancePluginsSetup__factory.connect(
    pluginSetupInfo.pluginSetup,
    deployer
  );

  const settings: MajorityVotingBase.VotingSettingsStruct = {
    duration: MGMT_DAO_PROPOSAL_DURATION,
    supportThreshold: MGMT_DAO_PROPOSAL_SUPPORT_THRESHOLD,
    votingMode: 1, // Early execution
  };
  const memberAddProposalDuration = MGMT_DAO_PROPOSAL_DURATION * 3; // Time before expired
  const pluginUpgrader = '0x0000000000000000000000000000000000000000'; // Just the DAO
  const installData = await pluginSetup.encodeInstallationParams(
    settings,
    MGMT_DAO_INITIAL_EDITORS,
    memberAddProposalDuration,
    pluginUpgrader
  );

  if (!PLUGIN_SETUP_PROCESSOR_ADDRESS) {
    throw new Error('PLUGIN_SETUP_PROCESSOR_ADDRESS cannot be empty');
  }

  console.log('Preparing an installation of the standard governance plugin');
  const psp = PluginSetupProcessor__factory.connect(
    PLUGIN_SETUP_PROCESSOR_ADDRESS,
    deployer
  );

  const pluginSetupRef: PluginSetupRefStruct = {
    pluginSetupRepo: GOVERNANCE_PLUGIN_REPO_ADDRESS!,
    versionTag: GovernancePluginsSetupParams.VERSION,
  };

  const tx = await psp.prepareInstallation(MANAGING_DAO_ADDRESS!, {
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
  console.log(
    '- Deployed a MainVotingPlugin plugin at',
    preparedEvent.args.plugin
  );
  console.log(
    '- Deployed a MainMemberAddHelper plugin at',
    preparedEvent.args.preparedSetupData.helpers[0]
  );

  return {
    pluginAddress: preparedEvent.args.plugin,
    helpers: preparedEvent.args.preparedSetupData.helpers,
    permissions: preparedEvent.args.preparedSetupData.permissions,
  };
}

async function applyInstallation(
  preparedInstallation: Awaited<ReturnType<typeof prepareInstallation>>
) {
  const {helpers, permissions, pluginAddress} = preparedInstallation;
  const mgmtDAO = DAO__factory.connect(MANAGING_DAO_ADDRESS!, deployer);
  const ROOT_PERMISSION_ID = await mgmtDAO.ROOT_PERMISSION_ID();

  // Encode a call to execute() > applyInstallation
  console.log('Installing the plugin to the managing DAO');
  const applyInstallationParams: PluginSetupProcessor.ApplyInstallationParamsStruct =
    {
      plugin: pluginAddress,
      helpersHash: hashHelpers(helpers),
      permissions,
      pluginSetupRef: {
        pluginSetupRepo: GOVERNANCE_PLUGIN_REPO_ADDRESS!,
        versionTag: GovernancePluginsSetupParams.VERSION,
      },
    };

  console.log('- Allowing the PSP to manage permissions');

  // Allow the PSP to install a plugin
  const tx1 = await mgmtDAO.grant(
    MANAGING_DAO_ADDRESS!,
    PLUGIN_SETUP_PROCESSOR_ADDRESS!,
    ROOT_PERMISSION_ID
  );
  await tx1.wait();

  console.log('- Telling the PSP to apply the installation');

  // Install the plugin
  const actions: IDAO.ActionStruct[] = [
    {
      to: PLUGIN_SETUP_PROCESSOR_ADDRESS!,
      value: 0,
      data: PluginSetupProcessor__factory.createInterface().encodeFunctionData(
        'applyInstallation',
        [MANAGING_DAO_ADDRESS!, applyInstallationParams]
      ),
    },
  ];

  const tx2 = await IDAO__factory.connect(
    MANAGING_DAO_ADDRESS!,
    deployer
  ).execute(
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    actions,
    0
  );
  await tx2.wait();

  // Executed(address,bytes32,tuple[],uint256,uint256,bytes[])
  const executedEvent = await findEvent<ExecutedEvent>(tx2, 'Executed');
  if (!executedEvent) {
    throw new Error('Could not execute the applyInstallation action');
  }

  // Revoke the PSP permission
  console.log("- Revoking the PSP's permission to manage permissions");
  const tx3 = await mgmtDAO.revoke(
    MANAGING_DAO_ADDRESS!,
    PLUGIN_SETUP_PROCESSOR_ADDRESS!,
    ROOT_PERMISSION_ID
  );
  await tx3.wait();

  console.log('Installation confirmed');
}

async function dropDeployerWalletPermissions() {
  const mgmtDAO = DAO__factory.connect(MANAGING_DAO_ADDRESS!, deployer);
  const EXECUTE_PERMISSION_ID = await mgmtDAO.EXECUTE_PERMISSION_ID();
  const ROOT_PERMISSION_ID = await mgmtDAO.ROOT_PERMISSION_ID();

  console.log('Revoking the EXECUTE permission from the deployment wallet');

  const tx1 = await mgmtDAO.revoke(
    MANAGING_DAO_ADDRESS!,
    deployer.address,
    EXECUTE_PERMISSION_ID
  );
  await tx1.wait();

  console.log('Permission revoked');

  console.log('Revoking the ROOT permission from the deployment wallet');

  const tx2 = await mgmtDAO.revoke(
    MANAGING_DAO_ADDRESS!,
    deployer.address,
    ROOT_PERMISSION_ID
  );
  await tx2.wait();

  console.log('Permission revoked');
}

async function checkManagingDaoPost(
  preparedInstallation: Awaited<ReturnType<typeof prepareInstallation>>
) {
  console.log("Checking the Managing DAO's final permissions");
  const mgmtDAO = DAO__factory.connect(MANAGING_DAO_ADDRESS!, deployer);
  const EXECUTE_PERMISSION_ID = await mgmtDAO.EXECUTE_PERMISSION_ID();
  const ROOT_PERMISSION_ID = await mgmtDAO.ROOT_PERMISSION_ID();

  // Deployer should not have execute permission on the DAO
  let canExecute = await mgmtDAO.hasPermission(
    MANAGING_DAO_ADDRESS!,
    deployer.address,
    EXECUTE_PERMISSION_ID,
    '0x'
  );
  if (canExecute) {
    throw new Error(
      'The given deployment wallet should not have EXECUTE permission on the DAO'
    );
  }

  // The plugin should have execute permission on the DAO
  canExecute = await mgmtDAO.hasPermission(
    MANAGING_DAO_ADDRESS!,
    preparedInstallation.pluginAddress,
    EXECUTE_PERMISSION_ID,
    '0x'
  );
  if (!canExecute) {
    throw new Error(
      'The MainVotingPlugin should have execute permission on the Managing DAO'
    );
  }

  // The DAO should have root permission on itself
  let isRoot = await mgmtDAO.hasPermission(
    MANAGING_DAO_ADDRESS!,
    MANAGING_DAO_ADDRESS!,
    ROOT_PERMISSION_ID,
    '0x'
  );
  if (!isRoot) {
    throw new Error('The given Managing DAO is not root on itself');
  }

  // The PSP should not have root permission on the DAO
  isRoot = await mgmtDAO.hasPermission(
    MANAGING_DAO_ADDRESS!,
    PLUGIN_SETUP_PROCESSOR_ADDRESS!,
    ROOT_PERMISSION_ID,
    '0x'
  );
  if (isRoot) {
    throw new Error(
      'The Plugin Setup Processor should not have root permission on the managing DAO (yet)'
    );
  }

  // The deployment wallet should not have root permission on the DAO
  isRoot = await mgmtDAO.hasPermission(
    MANAGING_DAO_ADDRESS!,
    deployer.address,
    ROOT_PERMISSION_ID,
    '0x'
  );
  if (isRoot) {
    throw new Error(
      'The Plugin Setup Processor should not have root permission on the managing DAO (yet)'
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
