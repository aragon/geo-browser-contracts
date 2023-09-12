import buildMetadata from "../../src/main-voting-build-metadata.json";
import {
  DAO,
  MainVotingPlugin__factory,
  MainVotingPluginSetup,
  MainVotingPluginSetup__factory,
} from "../../typechain";
import { deployTestDao } from "../helpers/test-dao";
import { getNamedTypesFromMetadata, Operation } from "../helpers/types";
import {
  abiCoder,
  ADDRESS_ONE,
  ADDRESS_ZERO,
  EDITOR_PERMISSION_ID,
  EMPTY_DATA,
  EXECUTE_PERMISSION_ID,
  NO_CONDITION,
  pctToRatio,
  UPDATE_ADDRESSES_PERMISSION_ID,
  UPDATE_VOTING_SETTINGS_PERMISSION_ID,
  UPGRADE_PLUGIN_PERMISSION_ID,
  VotingMode,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Main Voting Plugin Setup", function () {
  let alice: SignerWithAddress;
  let mainVotingPluginSetup: MainVotingPluginSetup;
  let dao: DAO;

  before(async () => {
    [alice] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    mainVotingPluginSetup = await new MainVotingPluginSetup__factory(alice)
      .deploy();

    // permission
    const nonce = await ethers.provider.getTransactionCount(
      mainVotingPluginSetup.address,
    );
    const anticipatedPluginAddress = ethers.utils.getContractAddress({
      from: mainVotingPluginSetup.address,
      nonce,
    });

    await dao.grant(
      anticipatedPluginAddress,
      alice.address,
      EDITOR_PERMISSION_ID,
    ).then((tx) => tx.wait());
  });

  describe("prepareInstallation", async () => {
    let initData: string;

    before(() => {
      // Params: (MajorityVotingBase.VotingSettings, address)
      initData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareInstallation.inputs,
        ),
        [{
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: pctToRatio(25),
          minParticipation: pctToRatio(50),
          minDuration: 60 * 60 * 24 * 5,
          minProposerVotingPower: 0,
        }, alice.address],
      );
    });

    it("returns the plugin, helpers, and permissions", async () => {
      const nonce = await ethers.provider.getTransactionCount(
        mainVotingPluginSetup.address,
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: mainVotingPluginSetup.address,
        nonce,
      });

      const {
        plugin,
        preparedSetupData: { helpers, permissions },
      } = await mainVotingPluginSetup.callStatic.prepareInstallation(
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
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          UPDATE_ADDRESSES_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          UPGRADE_PLUGIN_PERMISSION_ID,
        ],
      ]);

      await mainVotingPluginSetup.prepareInstallation(dao.address, initData);
      const myPlugin = new MainVotingPlugin__factory(alice).attach(
        plugin,
      );

      // initialization is correct
      expect(await myPlugin.dao()).to.eq(dao.address);
    });
  });

  describe("prepareUninstallation", async () => {
    it("returns the permissions", async () => {
      const dummyAddr = ADDRESS_ONE;

      const permissions = await mainVotingPluginSetup.callStatic
        .prepareUninstallation(
          dao.address,
          {
            plugin: dummyAddr,
            currentHelpers: [],
            data: EMPTY_DATA,
          },
        );

      expect(permissions.length).to.be.equal(4);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          dao.address,
          dummyAddr,
          NO_CONDITION,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          dummyAddr,
          dao.address,
          NO_CONDITION,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          dummyAddr,
          dao.address,
          NO_CONDITION,
          UPDATE_ADDRESSES_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          dummyAddr,
          dao.address,
          NO_CONDITION,
          UPGRADE_PLUGIN_PERMISSION_ID,
        ],
      ]);
    });
  });
});
