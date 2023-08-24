import { PLUGIN_SETUP_CONTRACT_NAME } from "../../plugin-settings";
import buildMetadata from "../../src/build-metadata.json";
import {
  DAO,
  SpacePlugin__factory,
  SpacePluginSetup,
  SpacePluginSetup__factory,
} from "../../typechain";
import { deployTestDao } from "../helpers/test-dao";
import { getNamedTypesFromMetadata, Operation } from "../helpers/types";
import { defaultInitData } from "./default-space";
import {
  abiCoder,
  ADDRESS_ZERO,
  DEPLOYER_PERMISSION_ID,
  EDITOR_PERMISSION_ID,
  EMPTY_DATA,
  MEMBER_PERMISSION_ID,
  NO_CONDITION,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe(PLUGIN_SETUP_CONTRACT_NAME, function () {
  let alice: SignerWithAddress;
  let spacePluginSetup: SpacePluginSetup;
  let SpacePluginSetup: SpacePluginSetup__factory;
  let dao: DAO;

  before(async () => {
    [alice] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    SpacePluginSetup = new SpacePluginSetup__factory(alice);
    spacePluginSetup = await SpacePluginSetup.deploy();
  });

  describe("prepareInstallation", async () => {
    let initData: string;

    before(async () => {
      initData = abiCoder.encode(
        getNamedTypesFromMetadata(
          buildMetadata.pluginSetup.prepareInstallation.inputs,
        ),
        [defaultInitData.number],
      );
    });

    it("returns the plugin, helpers, and permissions", async () => {
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
      expect(permissions.length).to.be.equal(1);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          plugin,
          dao.address,
          NO_CONDITION,
          MEMBER_PERMISSION_ID,
        ],
      ]);

      await spacePluginSetup.prepareInstallation(dao.address, initData);
      const myPlugin = new SpacePlugin__factory(alice).attach(plugin);

      // initialization is correct
      expect(await myPlugin.dao()).to.eq(dao.address);
      expect(await myPlugin.number()).to.be.eq(defaultInitData.number);
    });
  });

  describe("prepareUninstallation", async () => {
    it("returns the permissions", async () => {
      const dummyAddr = ADDRESS_ZERO;

      const permissions = await spacePluginSetup.callStatic
        .prepareUninstallation(
          dao.address,
          {
            plugin: dummyAddr,
            currentHelpers: [],
            data: EMPTY_DATA,
          },
        );

      expect(permissions.length).to.be.equal(1);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          dummyAddr,
          dao.address,
          NO_CONDITION,
          MEMBER_PERMISSION_ID,
        ],
      ]);
    });
  });
});
