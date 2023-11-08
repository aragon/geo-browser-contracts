import { GovernancePluginsSetupParams } from "../../plugin-setup-params";
import {
  GovernancePluginsSetup,
  GovernancePluginsSetup__factory,
  MainVotingPlugin,
  MainVotingPlugin__factory,
  MajorityVotingBase,
  MemberAccessPlugin,
  MemberAccessPlugin__factory,
  PluginRepo,
} from "../../typechain";
import { PluginSetupRefStruct } from "../../typechain/@aragon/osx/framework/dao/DAOFactory";
import { osxContracts } from "../../utils/helpers";
import { getPluginRepoInfo } from "../../utils/plugin-repo-info";
import { installPlugin, uninstallPlugin } from "../helpers/setup";
import { deployTestDao } from "../helpers/test-dao";
// import { getNamedTypesFromMetadata } from "../helpers/types";
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

describe("GovernancePluginsSetup processing", function () {
  let alice: SignerWithAddress;

  let psp: PluginSetupProcessor;
  let dao: DAO;
  let pluginRepo: PluginRepo;

  before(async () => {
    [alice] = await ethers.getSigners();

    const hardhatForkNetwork = process.env.NETWORK_NAME ?? "mainnet";

    const pluginRepoInfo = getPluginRepoInfo(
      GovernancePluginsSetupParams.PLUGIN_REPO_ENS_NAME,
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
    let setup: GovernancePluginsSetup;
    let pluginSetupRef: PluginSetupRefStruct;
    let mainVotingPlugin: MainVotingPlugin;
    let memberAccessPlugin: MemberAccessPlugin;
    const pluginUpgrader = ADDRESS_ZERO;

    before(async () => {
      const release = 1;

      // Deploy setups.
      setup = GovernancePluginsSetup__factory.connect(
        (await pluginRepo["getLatestVersion(uint8)"](release)).pluginSetup,
        alice,
      );

      pluginSetupRef = {
        versionTag: {
          release: BigNumber.from(release),
          build: BigNumber.from(1),
        },
        pluginSetupRepo: pluginRepo.address,
      };
    });

    beforeEach(async () => {
      const settings: MajorityVotingBase.VotingSettingsStruct = {
        minDuration: 60 * 60 * 24,
        minParticipation: 1,
        supportThreshold: 1,
        minProposerVotingPower: 0,
        votingMode: 0,
      };
      const minMemberAccessProposalDuration = 60 * 60 * 24;

      // Install build 1.
      const data = await setup.encodeInstallationParams(
        settings,
        [alice.address],
        minMemberAccessProposalDuration,
        pluginUpgrader,
      );
      const installation = await installPlugin(psp, dao, pluginSetupRef, data);

      const mvAddress = installation.preparedEvent.args.plugin;
      mainVotingPlugin = MainVotingPlugin__factory.connect(
        mvAddress,
        alice,
      );
      const mapAddress =
        installation.preparedEvent.args.preparedSetupData.helpers[0];
      memberAccessPlugin = MemberAccessPlugin__factory.connect(
        mapAddress,
        alice,
      );
    });

    it("installs & uninstalls", async () => {
      expect(await mainVotingPlugin.implementation()).to.be.eq(
        await setup.implementation(),
      );
      expect(await memberAccessPlugin.implementation()).to.be.eq(
        await setup.memberAccessPluginImplementation(),
      );
      expect(await mainVotingPlugin.dao()).to.be.eq(dao.address);
      expect(await memberAccessPlugin.dao()).to.be.eq(dao.address);

      // Uninstall build 1.
      const data = await setup.encodeUninstallationParams(pluginUpgrader);
      await uninstallPlugin(
        psp,
        dao,
        mainVotingPlugin,
        pluginSetupRef,
        data,
        [memberAccessPlugin.address],
      );
    });
  });
});
