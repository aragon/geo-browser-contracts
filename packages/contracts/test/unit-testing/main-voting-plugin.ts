import {
  DAO,
  MainVotingPlugin,
  MainVotingPlugin__factory,
  MemberAccessVotingPlugin,
  MemberAccessVotingPlugin__factory,
  SpacePlugin,
  SpacePlugin__factory,
} from "../../typechain";
import { deployWithProxy } from "../../utils/helpers";
import { deployTestDao } from "../helpers/test-dao";
import {
  ADDRESS_ONE,
  ADDRESS_TWO,
  ADDRESS_ZERO,
  EDITOR_PERMISSION_ID,
  EXECUTE_PERMISSION_ID,
  MEMBER_PERMISSION_ID,
  ROOT_PERMISSION_ID,
  UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { defaultMainVotingSettings } from "./common";

export type InitData = { contentUri: string };
export const defaultInitData: InitData = {
  contentUri: "ipfs://",
};

describe("Default Main Voting plugin", function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dao: DAO;
  let memberAccessPlugin: MemberAccessVotingPlugin;
  let mainVotingPlugin: MainVotingPlugin;
  let spacePlugin: SpacePlugin;
  let defaultInput: InitData;

  before(async () => {
    [alice, bob, charlie] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    defaultInput = { contentUri: "ipfs://" };
  });

  beforeEach(async () => {
    memberAccessPlugin = await deployWithProxy<MemberAccessVotingPlugin>(
      new MemberAccessVotingPlugin__factory(alice),
    );
    mainVotingPlugin = await deployWithProxy<MainVotingPlugin>(
      new MainVotingPlugin__factory(alice),
    );
    spacePlugin = await deployWithProxy<SpacePlugin>(
      new SpacePlugin__factory(alice),
    );

    await memberAccessPlugin.initialize(dao.address, {
      proposalDuration: 60 * 60 * 24 * 5,
      mainVotingPlugin: mainVotingPlugin.address,
    });
    await mainVotingPlugin.initialize(
      dao.address,
      defaultMainVotingSettings,
      alice.address,
    );
    await spacePlugin.initialize(dao.address, defaultInput.contentUri);

    // Alice is an editor
    await dao.grant(
      mainVotingPlugin.address,
      alice.address,
      EDITOR_PERMISSION_ID,
    );
    // Bob is a member
    await dao.grant(
      mainVotingPlugin.address,
      bob.address,
      MEMBER_PERMISSION_ID,
    );
    // The DAO is ROOT on itself
    await dao.grant(
      dao.address,
      dao.address,
      ROOT_PERMISSION_ID,
    );
    // The plugin can execute on the DAO
    await dao.grant(
      dao.address,
      memberAccessPlugin.address,
      EXECUTE_PERMISSION_ID,
    );
    // The DAO can update the plugin settings
    await dao.grant(
      memberAccessPlugin.address,
      dao.address,
      UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
    );
  });

  describe("initialize", async () => {
    it("reverts if trying to re-initialize", async () => {
      await expect(
        memberAccessPlugin.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: mainVotingPlugin.address,
        }),
      ).to.be.revertedWith("Initializable: contract is already initialized");
      await expect(
        mainVotingPlugin.initialize(
          dao.address,
          defaultMainVotingSettings,
          alice.address,
        ),
      ).to.be.revertedWith("Initializable: contract is already initialized");
      await expect(
        spacePlugin.initialize(dao.address, defaultInput.contentUri),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  // beforeEach(async () => {
  //   await dao.grant(memberAccessPlugin.address, alice.address, MEMBER_PERMISSION_ID);
  // });

  // it("reverts if sender lacks permission", async () => {
  //   await expect(memberAccessPlugin.connect(bob).storeNumber(newNumber))
  //     .to.be.revertedWithCustomError(memberAccessPlugin, "DaoUnauthorized")
  //     .withArgs(
  //       dao.address,
  //       memberAccessPlugin.address,
  //       bob.address,
  //       MEMBER_PERMISSION_ID,
  //     );
  // });

  // it("stores the number", async () => {
  //   await expect(memberAccessPlugin.storeNumber(newNumber)).to.not.be.reverted;
  //   expect(await memberAccessPlugin.number()).to.equal(newNumber);
  // });

  // it("emits the NumberStored event", async () => {
  //   await expect(memberAccessPlugin.storeNumber(newNumber))
  //     .to.emit(memberAccessPlugin, "NumberStored")
  //     .withArgs(newNumber);
  // });

  it("Only members can create proposals");
  it("Only editors can vote on proposals");

  it("isMember() returns true when appropriate", async () => {
    expect(await memberAccessPlugin.isMember(ADDRESS_ZERO)).to.eq(false);
    expect(await memberAccessPlugin.isMember(ADDRESS_ONE)).to.eq(false);
    expect(await memberAccessPlugin.isMember(ADDRESS_TWO)).to.eq(false);

    expect(await memberAccessPlugin.isMember(alice.address)).to.eq(true);
    expect(await memberAccessPlugin.isMember(bob.address)).to.eq(true);

    expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(false);

    await dao.grant(
      mainVotingPlugin.address,
      charlie.address,
      MEMBER_PERMISSION_ID,
    );

    expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(true);

    await dao.revoke(
      mainVotingPlugin.address,
      charlie.address,
      MEMBER_PERMISSION_ID,
    );

    expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(true);

    await dao.grant(
      mainVotingPlugin.address,
      charlie.address,
      EDITOR_PERMISSION_ID,
    );

    expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(true);
  });

  it("isEditor() returns true when appropriate", async () => {
    expect(await memberAccessPlugin.isEditor(ADDRESS_ZERO)).to.eq(false);
    expect(await memberAccessPlugin.isEditor(ADDRESS_ONE)).to.eq(false);
    expect(await memberAccessPlugin.isEditor(ADDRESS_TWO)).to.eq(false);

    expect(await memberAccessPlugin.isEditor(alice.address)).to.eq(true);
    expect(await memberAccessPlugin.isEditor(bob.address)).to.eq(false);
    expect(await memberAccessPlugin.isEditor(charlie.address)).to.eq(false);

    await dao.grant(
      mainVotingPlugin.address,
      charlie.address,
      EDITOR_PERMISSION_ID,
    );

    expect(await memberAccessPlugin.isEditor(charlie.address)).to.eq(true);
  });

  describe("One editor", () => {
    it("Proposals take immediate effect when created by the only editor");
  });
  describe("Multiple editors", () => {
    it("Proposals created by an editor require additional votes");
    it("A minimum participation is required");
    it("A minimum support threshold is required");
  });

  it("Proposals require editor approval when created by a member");
  it("Approved proposals can be executed by anyone");
  it("Rejected proposals cannot be executed");
  it("Membership proposals can only grant/revoke membership permissions");
  it("Only the DAO can call functions on the space plugin");

  it("The DAO and deployers can upgrade the plugins");
});
