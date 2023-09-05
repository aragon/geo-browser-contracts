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
  UPDATE_ADDRESSES_PERMISSION_ID,
  UPDATE_VOTING_SETTINGS_PERMISSION_ID,
  VoteOption,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { defaultMainVotingSettings } from "./common";
import { toUtf8Bytes } from "ethers/lib/utils";

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
      mainVotingPlugin.address,
      EXECUTE_PERMISSION_ID,
    );
    // The DAO can update the plugin settings
    await dao.grant(
      mainVotingPlugin.address,
      dao.address,
      UPDATE_VOTING_SETTINGS_PERMISSION_ID,
    );
    // The DAO can report new/removed editors
    await dao.grant(
      mainVotingPlugin.address,
      dao.address,
      UPDATE_ADDRESSES_PERMISSION_ID,
    );

    // inits
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

  it("Only members can create proposals", async () => {
    await expect(
      mainVotingPlugin.connect(alice).createProposal(
        toUtf8Bytes("ipfs://"),
        [],
        0, // fail safe
        0, // start date
        0, // end date
        VoteOption.Yes,
        true, // auto execute
      ),
    ).to.not.be.reverted;

    await expect(
      mainVotingPlugin.connect(bob).createProposal(
        toUtf8Bytes("ipfs://"),
        [],
        0, // fail safe
        0, // start date
        0, // end date
        VoteOption.None,
        true, // auto execute
      ),
    ).to.not.be.reverted;

    await expect(
      mainVotingPlugin.connect(charlie).createProposal(
        toUtf8Bytes("ipfs://"),
        [],
        0, // fail safe
        0, // start date
        0, // end date
        VoteOption.None,
        true, // auto execute
      ),
    ).to.be.revertedWithCustomError(
      mainVotingPlugin,
      "ProposalCreationForbidden",
    )
      .withArgs(charlie.address);
  });

  it("Only editors can vote on proposals", async () => {
    await expect(
      mainVotingPlugin.connect(bob).createProposal(
        toUtf8Bytes("ipfs://"),
        [],
        0, // fail safe
        0, // start date
        0, // end date
        VoteOption.None,
        true, // auto execute
      ),
    ).to.not.be.reverted;

    let proposal = await mainVotingPlugin.getProposal(0);
    expect(proposal.executed).to.eq(false);

    // Bob can't vote
    await expect(mainVotingPlugin.connect(bob).vote(0, VoteOption.Yes, true)).to
      .be
      .reverted;

    // Alice can vote
    await expect(mainVotingPlugin.vote(0, VoteOption.Yes, true)).to.not.be
      .reverted;

    proposal = await mainVotingPlugin.getProposal(0);
    expect(proposal.executed).to.eq(true);
  });

  it("The plugin has one editor after created", async () => {
    expect(await mainVotingPlugin.editorCount()).to.eq(1);
    expect(await mainVotingPlugin.totalVotingPower(0)).to.eq(1);
    expect(await mainVotingPlugin.totalVotingPower(100)).to.eq(1);
  });

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

    expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(false);

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
    it("Proposals take immediate effect when created by the only editor", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(1);

      await expect(
        mainVotingPlugin.createProposal(
          toUtf8Bytes("ipfs://"),
          [],
          0, // fail safe
          0, // start date
          0, // end date
          VoteOption.Yes,
          true, // auto execute
        ),
      ).to.not.be.reverted;

      const proposal = await mainVotingPlugin.getProposal(0);
      expect(proposal.executed).to.eq(true);
    });

    it("Proposals are unsettled after created by a member", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(1);

      await expect(
        mainVotingPlugin.connect(bob).createProposal(
          toUtf8Bytes("ipfs://"),
          [],
          0, // fail safe
          0, // start date
          0, // end date
          VoteOption.None,
          true, // auto execute
        ),
      ).to.not.be.reverted;

      const proposal = await mainVotingPlugin.getProposal(0);
      expect(proposal.executed).to.eq(false);
    });
  });
  describe("Multiple editors", () => {
    it("Proposals created by a member require editor votes");

    it("Proposals created by an editor require additional votes");

    it("A minimum participation is required");

    it("A minimum support threshold is required");
  });

  it("Adding an editor increases the editorCount");
  it("Removing an editor decreases the editorCount");

  it("proposeAddEditor generates the right actions");
  it("proposeRemoveEditor generates the right actions");

  it("Approved proposals can be executed by anyone after passed");
  it("Rejected proposals cannot be executed");

  it("Only the DAO can call functions on the space plugin");

  it("The DAO can update the settings");
  it("The DAO can report added/removed editors");
  it("The DAO and deployers can upgrade the plugins");
});
