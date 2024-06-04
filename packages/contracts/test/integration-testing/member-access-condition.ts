import {
  TestGovernancePluginsSetup,
  TestGovernancePluginsSetup__factory,
  MainVotingPlugin,
  MainVotingPlugin__factory,
  MajorityVotingBase,
  TestMemberAccessPlugin,
  TestMemberAccessPlugin__factory,
  PluginRepo,
} from '../../typechain';
import {PluginSetupRefStruct} from '../../typechain/@aragon/osx/framework/dao/DAOFactory';
import {
  findEventTopicLog,
  getPluginRepoFactoryAddress,
  osxContracts,
} from '../../utils/helpers';
import {installPlugin} from '../helpers/setup';
import {deployTestDao} from '../helpers/test-dao';
import {
  EXECUTE_PERMISSION_ID,
  ROOT_PERMISSION_ID,
  UPGRADE_PLUGIN_PERMISSION_ID,
  ONE_BYTES32,
  ADDRESS_ONE,
} from '../unit-testing/common';
import {
  DAO,
  PluginRepo__factory,
  PluginSetupProcessor,
  PluginSetupProcessor__factory,
  PluginRepoFactory__factory,
  PluginRepoRegistry__factory,
  DAO__factory,
  IDAO,
} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {ethers, network} from 'hardhat';

const release = 1;
const hardhatForkNetwork = process.env.NETWORK_NAME ?? 'mainnet';
const pluginSettings: MajorityVotingBase.VotingSettingsStruct = {
  duration: 60 * 60 * 24,
  supportThreshold: 1,
  votingMode: 0,
};
const memberAccessProposalDuration = 60 * 60 * 24;
const daoInterface = DAO__factory.createInterface();
const mainVotingInterface = MainVotingPlugin__factory.createInterface();

describe('Member Access Condition E2E', () => {
  let deployer: SignerWithAddress;
  let pluginUpgrader: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let psp: PluginSetupProcessor;
  let dao: DAO;
  let pluginRepo: PluginRepo;

  let pluginSetupRef: PluginSetupRefStruct;
  let pluginSetup: TestGovernancePluginsSetup;
  let gpsFactory: TestGovernancePluginsSetup__factory;
  let mainVotingPlugin: MainVotingPlugin;
  let memberAccessPlugin: TestMemberAccessPlugin;

  before(async () => {
    [deployer, pluginUpgrader, alice, bob] = await ethers.getSigners();

    // Get the PluginRepoFactory address
    const pluginRepoFactoryAddr: string = getPluginRepoFactoryAddress(
      network.name
    );
    const pluginRepoFactory = PluginRepoFactory__factory.connect(
      pluginRepoFactoryAddr,
      deployer
    );

    // PSP
    psp = PluginSetupProcessor__factory.connect(
      osxContracts[hardhatForkNetwork]['PluginSetupProcessor'],
      deployer
    );

    // Create a new PluginRepo
    let tx = await pluginRepoFactory.createPluginRepo(
      'testing-governance-plugin-condition',
      deployer.address
    );
    const eventLog = await findEventTopicLog(
      tx,
      PluginRepoRegistry__factory.createInterface(),
      'PluginRepoRegistered'
    );
    if (!eventLog) {
      throw new Error('Failed to get PluginRepoRegistered event log');
    }

    pluginRepo = PluginRepo__factory.connect(
      eventLog.args.pluginRepo,
      deployer
    );

    // Deploy PluginSetup build 1
    gpsFactory = new TestGovernancePluginsSetup__factory().connect(deployer);
    pluginSetup = await gpsFactory.deploy(psp.address);

    // Publish build 1
    tx = await pluginRepo.createVersion(1, pluginSetup.address, '0x00', '0x00');

    // Deploy setups
    pluginSetupRef = {
      versionTag: {
        release,
        build: 1,
      },
      pluginSetupRepo: pluginRepo.address,
    };
  });

  beforeEach(async () => {
    // Deploy DAO
    dao = await deployTestDao(deployer);

    // The DAO is root on itself
    await dao.grant(
      dao.address,
      dao.address,
      ethers.utils.id('ROOT_PERMISSION')
    );
    await dao.grant(
      dao.address,
      psp.address,
      ethers.utils.id('ROOT_PERMISSION')
    );
    await dao.grant(
      psp.address,
      deployer.address,
      ethers.utils.id('APPLY_INSTALLATION_PERMISSION')
    );

    // Install plugin
    const data = await pluginSetup.encodeInstallationParams(
      pluginSettings,
      [deployer.address],
      memberAccessProposalDuration,
      pluginUpgrader.address
    );
    // Internally call prepareInstallation, which deploys the condition
    const installation = await installPlugin(psp, dao, pluginSetupRef, data);

    mainVotingPlugin = MainVotingPlugin__factory.connect(
      installation.preparedEvent.args.plugin,
      deployer
    );
    memberAccessPlugin = TestMemberAccessPlugin__factory.connect(
      installation.preparedEvent.args.preparedSetupData.helpers[0],
      deployer
    );
  });

  it('Executing a proposal to add membership works', async () => {
    expect(await mainVotingPlugin.isMember(alice.address)).to.eq(false);

    await expect(
      memberAccessPlugin.devProposeAddMember(
        '0x',
        alice.address,
        deployer.address
      )
    ).to.not.be.reverted;

    expect(await mainVotingPlugin.isMember(alice.address)).to.eq(true);
  });
});
