import buildMetadata from "../../src/space-build-metadata.json";
import {
  DAO,
  SpacePlugin__factory,
  SpacePluginSetup,
  SpacePluginSetup__factory,
} from "../../typechain";
import { deployTestDao } from "../helpers/test-dao";
import { getNamedTypesFromMetadata, Operation } from "../helpers/types";
import {
  abiCoder,
  ADDRESS_TWO,
  ADDRESS_ZERO,
  CONTENT_PERMISSION_ID,
  NO_CONDITION,
  SUBSPACE_PERMISSION_ID,
  UPGRADE_PLUGIN_PERMISSION_ID,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Space Plugin Setup", function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let spacePluginSetup: SpacePluginSetup;
  let SpacePluginSetup: SpacePluginSetup__factory;
  let dao: DAO;
  const defaultInitData = { contentUri: "ipfs://" };

  before(async () => {
    [alice, bob] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    SpacePluginSetup = new SpacePluginSetup__factory(alice);
    spacePluginSetup = await SpacePluginSetup.deploy();
  });

  describe("prepareInstallation", async () => {
    it("returns the plugin, helpers, and permissions (no pluginUpgrader)", async () => {
      const initData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareInstallation.inputs,
        ),
        [defaultInitData.contentUri, ADDRESS_ZERO],
      );
      const nonce = await ethers.provider.getTransactionCount(
        spacePluginSetup.address,
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: spacePluginSetup.address,
        nonce,
      });

      const {
        plugin,
        preparedSetupData: { helpers, permissions },
      } = await spacePluginSetup.callStatic.prepareInstallation(
        dao.address,
        initData,
      );

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(0);
      expect(permissions.length).to.be.equal(3);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          CONTENT_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          SUBSPACE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          UPGRADE_PLUGIN_PERMISSION_ID,
        ],
      ]);

      await spacePluginSetup.prepareInstallation(dao.address, initData);
      const myPlugin = new SpacePlugin__factory(alice).attach(plugin);

      // initialization is correct
      expect(await myPlugin.dao()).to.eq(dao.address);
    });

    it("returns the plugin, helpers, and permissions (with a pluginUpgrader)", async () => {
      const pluginUpgrader = bob.address;
      const initData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareInstallation.inputs,
        ),
        [defaultInitData.contentUri, pluginUpgrader],
      );
      const nonce = await ethers.provider.getTransactionCount(
        spacePluginSetup.address,
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: spacePluginSetup.address,
        nonce,
      });

      const {
        plugin,
        preparedSetupData: { helpers, permissions },
      } = await spacePluginSetup.callStatic.prepareInstallation(
        dao.address,
        initData,
      );

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(0);
      expect(permissions.length).to.be.equal(4);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          CONTENT_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          SUBSPACE_PERMISSION_ID,
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

      await spacePluginSetup.prepareInstallation(dao.address, initData);
      const myPlugin = new SpacePlugin__factory(alice).attach(plugin);

      // initialization is correct
      expect(await myPlugin.dao()).to.eq(dao.address);
    });
  });

  describe("prepareUninstallation", async () => {
    it("returns the permission changes (no pluginUpgrader)", async () => {
      const plugin = await new SpacePlugin__factory(alice).deploy();

      const uninstallData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareUninstallation.inputs,
        ),
        [ADDRESS_ZERO],
      );

      const permissions = await spacePluginSetup.callStatic
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
          plugin.address,
          dao.address,
          NO_CONDITION,
          CONTENT_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin.address,
          dao.address,
          NO_CONDITION,
          SUBSPACE_PERMISSION_ID,
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

    it("returns the permission changes (with a pluginUpgrader)", async () => {
      const plugin = await new SpacePlugin__factory(alice).deploy();

      const pluginUpgrader = bob.address;
      const uninstallData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareUninstallation.inputs,
        ),
        [pluginUpgrader],
      );

      const permissions = await spacePluginSetup.callStatic
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
          plugin.address,
          dao.address,
          NO_CONDITION,
          CONTENT_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin.address,
          dao.address,
          NO_CONDITION,
          SUBSPACE_PERMISSION_ID,
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
