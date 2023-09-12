import buildMetadata from "../../src/member-access-build-metadata.json";
import {
  DAO,
  MainVotingPlugin,
  MainVotingPlugin__factory,
  MemberAccessPlugin__factory,
  MemberAccessPluginSetup,
  MemberAccessPluginSetup__factory,
} from "../../typechain";
import { deployWithProxy } from "../../utils/helpers";
import { deployTestDao } from "../helpers/test-dao";
import { getNamedTypesFromMetadata, Operation } from "../helpers/types";
import {
  abiCoder,
  ADDRESS_ZERO,
  EDITOR_PERMISSION_ID,
  EXECUTE_PERMISSION_ID,
  NO_CONDITION,
  UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
  UPGRADE_PLUGIN_PERMISSION_ID,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Member Access Plugin Setup", function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let memberAccessPluginSetup: MemberAccessPluginSetup;
  let mainVotingPlugin: MainVotingPlugin;
  let dao: DAO;

  before(async () => {
    [alice, bob] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    mainVotingPlugin = await deployWithProxy<MainVotingPlugin>(
      new MainVotingPlugin__factory(alice),
    );
    await dao.grant(
      mainVotingPlugin.address,
      alice.address,
      EDITOR_PERMISSION_ID,
    ).then((tx) => tx.wait());
    await mainVotingPlugin.initialize(dao.address, {
      minDuration: 60 * 60 * 24 * 5,
      minParticipation: 50000,
      minProposerVotingPower: 0,
      supportThreshold: 300000,
      votingMode: 0,
    }, alice.address).then((tx) => tx.wait());

    memberAccessPluginSetup = await new MemberAccessPluginSetup__factory(alice)
      .deploy();
  });

  describe("prepareInstallation", async () => {
    it("returns the plugin, helpers, and permissions (no pluginUpgrader)", async () => {
      const pluginUpgrader = ADDRESS_ZERO;
      const initData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareInstallation.inputs,
        ),
        [{
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: mainVotingPlugin.address,
        }, pluginUpgrader],
      );

      const nonce = await ethers.provider.getTransactionCount(
        memberAccessPluginSetup.address,
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: memberAccessPluginSetup.address,
        nonce,
      });

      const {
        plugin,
        preparedSetupData: { helpers, permissions },
      } = await memberAccessPluginSetup.callStatic.prepareInstallation(
        dao.address,
        initData,
      );

      const anticipatedConditionAddress = ethers.utils.getContractAddress({
        from: memberAccessPluginSetup.address,
        nonce: nonce + 1,
      });

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(0);
      expect(permissions.length).to.be.equal(3);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          dao.address,
          plugin,
          anticipatedConditionAddress,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          UPGRADE_PLUGIN_PERMISSION_ID,
        ],
      ]);

      await memberAccessPluginSetup.prepareInstallation(dao.address, initData);
      const myPlugin = new MemberAccessPlugin__factory(alice).attach(
        plugin,
      );

      // initialization is correct
      expect(await myPlugin.dao()).to.eq(dao.address);
    });

    it("returns the plugin, helpers, and permissions (with a pluginUpgrader)", async () => {
      const pluginUpgrader = bob.address;
      const initData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareInstallation.inputs,
        ),
        [{
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: mainVotingPlugin.address,
        }, pluginUpgrader],
      );
      const nonce = await ethers.provider.getTransactionCount(
        memberAccessPluginSetup.address,
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: memberAccessPluginSetup.address,
        nonce,
      });
      const anticipatedConditionAddress = ethers.utils.getContractAddress({
        from: memberAccessPluginSetup.address,
        nonce: nonce + 1,
      });

      const {
        plugin,
        preparedSetupData: { helpers, permissions },
      } = await memberAccessPluginSetup.callStatic.prepareInstallation(
        dao.address,
        initData,
      );

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(0);
      expect(permissions.length).to.be.equal(4);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          dao.address,
          plugin,
          anticipatedConditionAddress,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          UPGRADE_PLUGIN_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          pluginUpgrader,
          NO_CONDITION,
          UPGRADE_PLUGIN_PERMISSION_ID,
        ],
      ]);

      await memberAccessPluginSetup.prepareInstallation(dao.address, initData);
      const myPlugin = new MemberAccessPlugin__factory(alice).attach(
        plugin,
      );

      // initialization is correct
      expect(await myPlugin.dao()).to.eq(dao.address);
    });
  });

  describe("prepareUninstallation", async () => {
    it("returns the permissions (no pluginUpgrader)", async () => {
      const plugin = await new MemberAccessPlugin__factory(alice).deploy();

      const uninstallData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareUninstallation.inputs,
        ),
        [ADDRESS_ZERO],
      );
      const permissions = await memberAccessPluginSetup.callStatic
        .prepareUninstallation(
          dao.address,
          {
            plugin: plugin.address,
            currentHelpers: [],
            data: uninstallData,
          },
        );

      expect(permissions.length).to.be.equal(3);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          dao.address,
          plugin.address,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin.address,
          dao.address,
          NO_CONDITION,
          UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin.address,
          dao.address,
          NO_CONDITION,
          UPGRADE_PLUGIN_PERMISSION_ID,
        ],
      ]);
    });

    it("returns the permissions (with a pluginUpgrader)", async () => {
      const plugin = await new MemberAccessPlugin__factory(alice).deploy();

      const pluginUpgrader = bob.address;
      const uninstallData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareUninstallation.inputs,
        ),
        [pluginUpgrader],
      );

      const permissions = await memberAccessPluginSetup.callStatic
        .prepareUninstallation(
          dao.address,
          {
            plugin: plugin.address,
            currentHelpers: [],
            data: uninstallData,
          },
        );

      expect(permissions.length).to.be.equal(4);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          dao.address,
          plugin.address,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin.address,
          dao.address,
          NO_CONDITION,
          UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin.address,
          dao.address,
          NO_CONDITION,
          UPGRADE_PLUGIN_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin.address,
          pluginUpgrader,
          NO_CONDITION,
          UPGRADE_PLUGIN_PERMISSION_ID,
        ],
      ]);
    });
  });
});
