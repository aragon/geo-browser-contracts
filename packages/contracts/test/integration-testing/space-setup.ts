import { SpacePluginSetupParams } from "../../plugin-setup-params";
import {
  PluginRepo,
  SpacePlugin,
  SpacePlugin__factory,
  SpacePluginSetup,
  SpacePluginSetup__factory,
} from "../../typechain";
import { PluginSetupRefStruct } from "../../typechain/@aragon/osx/framework/dao/DAOFactory";
import { osxContracts } from "../../utils/helpers";
import { getPluginRepoInfo } from "../../utils/plugin-repo-info";
import { initializeFork } from "../helpers/fixture";
import { installPLugin, uninstallPLugin } from "../helpers/setup";
import { deployTestDao } from "../helpers/test-dao";
import { getNamedTypesFromMetadata } from "../helpers/types";
import {
  DAO,
  PluginRepo__factory,
  PluginSetupProcessor,
  PluginSetupProcessor__factory,
} from "@aragon/osx-ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { ADDRESS_ZERO } from "../unit-testing/common";
import { toHex } from "../../utils/ipfs";

describe("SpacePluginSetup Processing", function () {
  let alice: SignerWithAddress;

  let psp: PluginSetupProcessor;
  let dao: DAO;
  let pluginRepo: PluginRepo;

  before(async () => {
    [alice] = await ethers.getSigners();

    const hardhatForkNetwork = "goerli";

    const pluginRepoInfo = getPluginRepoInfo(
      SpacePluginSetupParams.PLUGIN_REPO_ENS_NAME,
      "hardhat",
    );
    if (!pluginRepoInfo) {
      throw new Error("The plugin setup details are not available");
    }

    // PSP
    psp = PluginSetupProcessor__factory.connect(
      osxContracts[hardhatForkNetwork]["PluginSetupProcessor"],
      alice,
    );

    // Deploy DAO.
    dao = await deployTestDao(alice);

    await dao.grant(
      dao.address,
      psp.address,
      ethers.utils.id("ROOT_PERMISSION"),
    );
    await dao.grant(
      psp.address,
      alice.address,
      ethers.utils.id("APPLY_INSTALLATION_PERMISSION"),
    );
    await dao.grant(
      psp.address,
      alice.address,
      ethers.utils.id("APPLY_UNINSTALLATION_PERMISSION"),
    );
    await dao.grant(
      psp.address,
      alice.address,
      ethers.utils.id("APPLY_UPDATE_PERMISSION"),
    );

    pluginRepo = PluginRepo__factory.connect(
      pluginRepoInfo.address,
      alice,
    );
  });

  context("Build 1", async () => {
    let setup: SpacePluginSetup;
    let pluginSetupRef: PluginSetupRefStruct;
    let plugin: SpacePlugin;

    before(async () => {
      // Deploy setups.
      setup = SpacePluginSetup__factory.connect(
        (await pluginRepo["getLatestVersion(uint8)"](1)).pluginSetup,
        alice,
      );

      pluginSetupRef = {
        versionTag: {
          release: BigNumber.from(1),
          build: BigNumber.from(1),
        },
        pluginSetupRepo: pluginRepo.address,
      };
    });

    beforeEach(async () => {
      const pluginUpgrader = ADDRESS_ZERO;

      // Install build 1.
      const results = await installPLugin(
        psp,
        dao,
        pluginSetupRef,
        ethers.utils.defaultAbiCoder.encode(
          getNamedTypesFromMetadata(
            SpacePluginSetupParams.METADATA.build.pluginSetup
              .prepareInstallation
              .inputs,
          ),
          [toHex("ipfs://1234"), pluginUpgrader],
        ),
      );

      plugin = SpacePlugin__factory.connect(
        results.preparedEvent.args.plugin,
        alice,
      );
    });

    it("installs & uninstalls", async () => {
      const pluginUpgrader = ADDRESS_ZERO;

      // Check implementation.
      expect(await plugin.implementation()).to.be.eq(
        await setup.implementation(),
      );

      // Uninstall build 1.
      await uninstallPLugin(
        psp,
        dao,
        plugin,
        pluginSetupRef,
        ethers.utils.defaultAbiCoder.encode(
          getNamedTypesFromMetadata(
            SpacePluginSetupParams.METADATA.build.pluginSetup
              .prepareUninstallation
              .inputs,
          ),
          [pluginUpgrader],
        ),
        [],
      );
    });
  });
});
