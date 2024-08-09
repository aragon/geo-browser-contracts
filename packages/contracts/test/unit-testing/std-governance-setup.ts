import {
  DAO,
  StdGovernanceSetup,
  StdGovernanceSetup__factory,
  StdGovernancePlugin__factory,
} from '../../typechain';
import {deployTestDao} from '../helpers/test-dao';
import {Operation} from '../helpers/types';
import {
  ADDRESS_ZERO,
  EXECUTE_PERMISSION_ID,
  NO_CONDITION,
  pctToRatio,
  PROPOSER_PERMISSION_ID,
  UPDATE_ADDRESSES_PERMISSION_ID,
  UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
  UPDATE_VOTING_SETTINGS_PERMISSION_ID,
  VotingMode,
} from './common';
import {activeContractsList} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

describe('Standard Governance Setup', function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let stdGovernanceSetup: StdGovernanceSetup;
  let dao: DAO;

  before(async () => {
    [alice, bob] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    const hardhatForkNetwork = (process.env.NETWORK_NAME ??
      'mainnet') as keyof typeof activeContractsList;
    const pspAddress =
      activeContractsList[hardhatForkNetwork].PluginSetupProcessor;

    stdGovernanceSetup = await new StdGovernanceSetup__factory(alice).deploy(
      pspAddress
    );
  });

  describe('prepareInstallation', async () => {
    it('returns the plugin, helpers, and permissions (no pluginUpgrader)', async () => {
      const pluginUpgrader = ADDRESS_ZERO;

      const initData = await stdGovernanceSetup.encodeInstallationParams(
        {
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: pctToRatio(25),
          duration: 60 * 60 * 24 * 5,
        },
        [alice.address],
        60 * 60 * 24,
        pluginUpgrader
      );
      const nonce = await ethers.provider.getTransactionCount(
        stdGovernanceSetup.address
      );
      const anticipatedStdMemberAddHelperAddress =
        ethers.utils.getContractAddress({
          from: stdGovernanceSetup.address,
          nonce,
        });
      const anticipatedStdGovernancePluginAddress =
        ethers.utils.getContractAddress({
          from: stdGovernanceSetup.address,
          nonce: nonce + 1,
        });
      const anticipatedExecuteSelectorConditionAddress =
        ethers.utils.getContractAddress({
          from: stdGovernanceSetup.address,
          nonce: nonce + 2,
        });

      const {
        plugin: stdGovernancePlugin,
        preparedSetupData: {helpers, permissions},
      } = await stdGovernanceSetup.callStatic.prepareInstallation(
        dao.address,
        initData
      );
      expect(stdGovernancePlugin).to.be.equal(
        anticipatedStdGovernancePluginAddress
      );
      expect(helpers.length).to.be.equal(1);
      const [stdMemberAddHelper] = helpers;
      expect(stdMemberAddHelper).to.eq(anticipatedStdMemberAddHelperAddress);

      expect(permissions.length).to.be.equal(6);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          dao.address,
          stdGovernancePlugin,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          stdGovernancePlugin,
          dao.address,
          NO_CONDITION,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          stdGovernancePlugin,
          dao.address,
          NO_CONDITION,
          UPDATE_ADDRESSES_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          stdMemberAddHelper,
          stdGovernancePlugin,
          NO_CONDITION,
          PROPOSER_PERMISSION_ID,
        ],
        [
          Operation.GrantWithCondition,
          dao.address,
          stdMemberAddHelper,
          anticipatedExecuteSelectorConditionAddress,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          stdMemberAddHelper,
          dao.address,
          NO_CONDITION,
          UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
        ],
      ]);

      await stdGovernanceSetup.prepareInstallation(dao.address, initData);
      const myPlugin = new StdGovernancePlugin__factory(alice).attach(
        stdGovernancePlugin
      );

      // initialization is correct
      expect(await myPlugin.dao()).to.eq(dao.address);
      expect(await myPlugin.isEditor(alice.address)).to.be.true;
    });

    it('returns the plugin, helpers, and permissions (with a pluginUpgrader)', async () => {
      const pluginUpgrader = bob.address;

      // Params: (MajorityVotingBase.VotingSettings, address, address)
      const initData = await stdGovernanceSetup.encodeInstallationParams(
        {
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: pctToRatio(25),
          duration: 60 * 60 * 24 * 5,
        },
        [alice.address],
        60 * 60 * 24,
        pluginUpgrader
      );
      const nonce = await ethers.provider.getTransactionCount(
        stdGovernanceSetup.address
      );
      const anticipatedStdMemberAddHelperAddress =
        ethers.utils.getContractAddress({
          from: stdGovernanceSetup.address,
          nonce,
        });
      const anticipatedStdGovernancePluginAddress =
        ethers.utils.getContractAddress({
          from: stdGovernanceSetup.address,
          nonce: nonce + 1,
        });
      const anticipatedExecuteSelectorConditionAddress =
        ethers.utils.getContractAddress({
          from: stdGovernanceSetup.address,
          nonce: nonce + 2,
        });
      const anticipatedOnlyPluginUpgraderConditionAddress =
        ethers.utils.getContractAddress({
          from: stdGovernanceSetup.address,
          nonce: nonce + 3,
        });

      const {
        plugin: stdGovernancePlugin,
        preparedSetupData: {helpers, permissions},
      } = await stdGovernanceSetup.callStatic.prepareInstallation(
        dao.address,
        initData
      );
      expect(stdGovernancePlugin).to.be.equal(
        anticipatedStdGovernancePluginAddress
      );
      expect(helpers.length).to.be.equal(1);
      const [stdMemberAddHelper] = helpers;
      expect(stdMemberAddHelper).to.eq(anticipatedStdMemberAddHelperAddress);

      expect(permissions.length).to.be.equal(7);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          dao.address,
          stdGovernancePlugin,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          stdGovernancePlugin,
          dao.address,
          NO_CONDITION,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          stdGovernancePlugin,
          dao.address,
          NO_CONDITION,
          UPDATE_ADDRESSES_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          stdMemberAddHelper,
          stdGovernancePlugin,
          NO_CONDITION,
          PROPOSER_PERMISSION_ID,
        ],
        [
          Operation.GrantWithCondition,
          dao.address,
          stdMemberAddHelper,
          anticipatedExecuteSelectorConditionAddress,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          stdMemberAddHelper,
          dao.address,
          NO_CONDITION,
          UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.GrantWithCondition,
          dao.address,
          pluginUpgrader,
          anticipatedOnlyPluginUpgraderConditionAddress,
          EXECUTE_PERMISSION_ID,
        ],
      ]);

      await stdGovernanceSetup.prepareInstallation(dao.address, initData);
      const myPlugin = new StdGovernancePlugin__factory(alice).attach(
        stdGovernancePlugin
      );

      // initialization is correct
      expect(await myPlugin.dao()).to.eq(dao.address);
      expect(await myPlugin.isEditor(alice.address)).to.be.true;
    });
  });

  describe('prepareUninstallation', async () => {
    it('returns the permissions (no pluginUpgrader)', async () => {
      const stdGovernancePlugin = await new StdGovernancePlugin__factory(
        alice
      ).deploy();
      const stdMemberAddHelper = await new StdGovernancePlugin__factory(
        alice
      ).deploy();

      const pluginUpgrader = ADDRESS_ZERO;
      const uninstallData = await stdGovernanceSetup.encodeUninstallationParams(
        pluginUpgrader
      );
      const permissions =
        await stdGovernanceSetup.callStatic.prepareUninstallation(dao.address, {
          plugin: stdGovernancePlugin.address,
          currentHelpers: [stdMemberAddHelper.address],
          data: uninstallData,
        });

      expect(permissions.length).to.be.equal(6);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          dao.address,
          stdGovernancePlugin.address,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          stdGovernancePlugin.address,
          dao.address,
          NO_CONDITION,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          stdGovernancePlugin.address,
          dao.address,
          NO_CONDITION,
          UPDATE_ADDRESSES_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          stdMemberAddHelper.address,
          stdGovernancePlugin.address,
          NO_CONDITION,
          PROPOSER_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          dao.address,
          stdMemberAddHelper.address,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          stdMemberAddHelper.address,
          dao.address,
          NO_CONDITION,
          UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
        ],
      ]);
    });

    it('returns the permissions (with a pluginUpgrader)', async () => {
      const stdGovernancePlugin = await new StdGovernancePlugin__factory(
        alice
      ).deploy();
      const stdMemberAddHelper = await new StdGovernancePlugin__factory(
        alice
      ).deploy();

      const pluginUpgrader = bob.address;
      const uninstallData = await stdGovernanceSetup.encodeUninstallationParams(
        pluginUpgrader
      );
      const permissions =
        await stdGovernanceSetup.callStatic.prepareUninstallation(dao.address, {
          plugin: stdGovernancePlugin.address,
          currentHelpers: [stdMemberAddHelper.address],
          data: uninstallData,
        });

      expect(permissions.length).to.be.equal(7);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          dao.address,
          stdGovernancePlugin.address,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          stdGovernancePlugin.address,
          dao.address,
          NO_CONDITION,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          stdGovernancePlugin.address,
          dao.address,
          NO_CONDITION,
          UPDATE_ADDRESSES_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          stdMemberAddHelper.address,
          stdGovernancePlugin.address,
          NO_CONDITION,
          PROPOSER_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          dao.address,
          stdMemberAddHelper.address,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          stdMemberAddHelper.address,
          dao.address,
          NO_CONDITION,
          UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          dao.address,
          pluginUpgrader,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
      ]);
    });
  });
});
