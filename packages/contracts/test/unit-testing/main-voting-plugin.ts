import {
  DAO,
  IDAO,
  MainVotingPlugin,
  MainVotingPlugin__factory,
  MemberAccessVotingPlugin,
  MemberAccessVotingPlugin__factory,
  PermissionManager__factory,
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

  it("Only editors can vote when creating proposals");

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

    it("Proposals created by a member require the editor's vote", async () => {
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
    it("Proposals created by a member require editor votes", async () => {
      let pid = 0;
      // Bob editor
      await proposeNewEditor(bob.address);
      // Charlie member
      await dao.grant(
        mainVotingPlugin.address,
        charlie.address,
        MEMBER_PERMISSION_ID,
      );

      await expect(createDummyProposal(charlie, false)).to.not.be.reverted;
      pid++;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Charlie tries to vote
      await expect(
        mainVotingPlugin.connect(charlie).vote(pid, VoteOption.Yes, true),
      ).to.be.reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Alice votes
      await expect(mainVotingPlugin.vote(pid, VoteOption.Yes, false)).to.not.be
        .reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Bob votes
      await expect(
        mainVotingPlugin.connect(bob).vote(pid, VoteOption.Yes, false),
      ).to.not.be.reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(true);
    });

    it("Proposals created by an editor require additional votes", async () => {
      let pid = 0;
      // Bob and Charlie editors
      await proposeNewEditor(bob.address);
      await proposeNewEditor(charlie.address);
      pid++;
      await expect(
        mainVotingPlugin.connect(bob).vote(pid, VoteOption.Yes, true),
      ).to.not.be.reverted;

      // Proposal 1
      await expect(createDummyProposal(alice, false)).to.not.be.reverted;
      pid++;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Alice votes
      await expect(mainVotingPlugin.vote(pid, VoteOption.Yes, false)).to.not.be
        .reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Bob votes (66% yes)
      await expect(
        mainVotingPlugin.connect(bob).vote(pid, VoteOption.Yes, false),
      ).to.not.be.reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(true);

      // Proposal 2
      await expect(createDummyProposal(alice, true)).to.not.be.reverted;
      pid++;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

      // Bob votes (66% yes)
      await expect(
        mainVotingPlugin.connect(bob).vote(pid, VoteOption.Yes, false),
      ).to.not.be.reverted;
      expect(await mainVotingPlugin.canExecute(pid)).to.eq(true);
    });

    it("A minimum participation is required");

    it("A minimum support threshold is required");
  });

  it("Adding an editor increases the editorCount", async () => {
    expect(await mainVotingPlugin.editorCount()).to.eq(1);

    // Add Bob
    await proposeNewEditor(bob.address);
    expect(await mainVotingPlugin.editorCount()).to.eq(2);
    expect(await mainVotingPlugin.isEditor(bob.address)).to.eq(true);

    // Propose Charlie
    await proposeNewEditor(charlie.address);
    expect(await mainVotingPlugin.editorCount()).to.eq(2);
    expect(await mainVotingPlugin.isEditor(charlie.address)).to.eq(false);

    // Confirm Charlie
    await expect(mainVotingPlugin.connect(bob).vote(1, VoteOption.Yes, true)).to
      .not.be.reverted;
    expect(await mainVotingPlugin.editorCount()).to.eq(3);
    expect(await mainVotingPlugin.isEditor(charlie.address)).to.eq(true);
  });

  it("Removing an editor decreases the editorCount", async () => {
    // Add Bob and Charlie
    await proposeNewEditor(bob.address); // Alice votes yes as the creator
    await proposeNewEditor(charlie.address); // Alice votes yes as the creator
    await expect(mainVotingPlugin.connect(bob).vote(1, VoteOption.Yes, true)).to
      .not.be.reverted;
    expect(await mainVotingPlugin.editorCount()).to.eq(3);

    // Propose removing Charlie
    await proposeRemoveEditor(charlie.address); // Alice votes yes as the creator
    expect(await mainVotingPlugin.editorCount()).to.eq(3);
    await expect(mainVotingPlugin.connect(bob).vote(2, VoteOption.Yes, true)).to
      .not.be.reverted;
    expect(await mainVotingPlugin.editorCount()).to.eq(2);

    // Propose removing Bob
    await proposeRemoveEditor(bob.address);
    expect(await mainVotingPlugin.connect(bob).vote(3, VoteOption.Yes, true)).to
      .not.be.reverted;
    expect(await mainVotingPlugin.editorCount()).to.eq(1);
  });

  it("Reporting an already existing editor reverts");
  it("Reporting the removal of a non existing editor reverts");

  it("Attempting to remove the last editor reverts", async () => {
    // Try to remove Alice
    await expect(proposeRemoveEditor(alice.address)).to.be.reverted;
    expect(await mainVotingPlugin.editorCount()).to.eq(1);

    // Add Bob
    await proposeNewEditor(bob.address);
    expect(await mainVotingPlugin.editorCount()).to.eq(2);

    // Propose removing Bob
    await proposeRemoveEditor(bob.address);
    expect(await mainVotingPlugin.connect(bob).vote(1, VoteOption.Yes, true))
      .to.not.be.reverted;
    expect(await mainVotingPlugin.editorCount()).to.eq(1);

    // Try to remove Alice
    await expect(proposeRemoveEditor(alice.address)).to.be.reverted;
  });

  it("Attempting to vote twice fails (replacement disabled)", async () => {
    // Add Bob
    await proposeNewEditor(bob.address); // Alice votes yes as the creator

    // Propose Charlie
    await proposeNewEditor(charlie.address); // Alice votes yes as the creator

    // Vote again
    await expect(mainVotingPlugin.connect(alice).vote(1, VoteOption.Yes, true))
      .to.be.reverted;
  });

  it("Approved proposals can be executed by anyone after passed", async () => {
    let pid = 0;
    await expect(createDummyProposal(bob, false)).to.not.be.reverted;
    expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

    // Charlie cannot execute
    await expect(mainVotingPlugin.connect(charlie).execute(pid)).to.be
      .reverted;

    // Alice approves
    await expect(
      mainVotingPlugin.vote(pid, VoteOption.Yes, false),
    ).to.not.be.reverted;
    expect(await mainVotingPlugin.canExecute(pid)).to.eq(true);

    // Charlie executes
    await expect(mainVotingPlugin.connect(charlie).execute(pid)).to.not.be
      .reverted;
  });

  it("Rejected proposals cannot be executed", async () => {
    let pid = 0;
    await expect(createDummyProposal(bob, false)).to.not.be.reverted;
    expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

    // Charlie cannot execute
    await expect(mainVotingPlugin.connect(charlie).execute(pid)).to.be
      .reverted;

    // Alice rejects
    await expect(
      mainVotingPlugin.vote(pid, VoteOption.No, false),
    ).to.not.be.reverted;
    expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

    // Charlie cannot execute
    await expect(mainVotingPlugin.connect(charlie).execute(pid)).to.be
      .reverted;

    //

    await proposeNewEditor(bob.address); // Alice auto approves
    await expect(createDummyProposal(bob, false)).to.not.be.reverted;
    expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

    // Charlie cannot execute
    await expect(mainVotingPlugin.connect(charlie).execute(pid)).to.be
      .reverted;

    // Alice rejects
    await expect(
      mainVotingPlugin.vote(pid, VoteOption.No, false),
    ).to.not.be.reverted;
    expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

    // Bob rejects
    await expect(
      mainVotingPlugin.connect(bob).vote(pid, VoteOption.No, false),
    ).to.not.be.reverted;
    expect(await mainVotingPlugin.canExecute(pid)).to.eq(false);

    // Charlie cannot execute
    await expect(mainVotingPlugin.connect(charlie).execute(pid)).to.be
      .reverted;
  });

  it("The DAO can update the settings", async () => {
    await expect(mainVotingPlugin.createProposal(
      toUtf8Bytes("ipfs://"),
      [
        {
          to: mainVotingPlugin.address,
          value: 0,
          data: MainVotingPlugin__factory.createInterface().encodeFunctionData(
            "updateVotingSettings",
            [
              {
                votingMode: 0,
                supportThreshold: 12345,
                minParticipation: 23456,
                minDuration: 60 * 60 * 3,
                minProposerVotingPower: 0,
              },
            ],
          ),
        },
      ],
      0, // fail safe
      0, // start date
      0, // end date
      VoteOption.Yes,
      true, // auto execute
    )).to.emit(
      mainVotingPlugin,
      "VotingSettingsUpdated",
    ).withArgs(0, 12345, 23456, 60 * 60 * 3, 0);
  });

  it("The DAO can report added/removed editors");
  it("The DAO and deployers can upgrade the plugins");

  it("COPY THE APPLICABLE ADDRESS LIST TESTS");

  // Helpers

  const createDummyProposal = (proposer = alice, approving = false) => {
    const actions: IDAO.ActionStruct[] = [
      {
        to: dao.address,
        value: 0,
        data: "0x",
      },
    ];

    return mainVotingPlugin.connect(proposer).createProposal(
      toUtf8Bytes("ipfs://"),
      actions,
      0, // fail safe
      0, // start date
      0, // end date
      approving ? VoteOption.Yes : VoteOption.None,
      true, // auto execute
    ).then((tx) => tx.wait());
  };

  const proposeNewEditor = (_editor: string, proposer = alice) => {
    const actions: IDAO.ActionStruct[] = [
      // Grant the permission
      {
        to: dao.address,
        value: 0,
        data: PermissionManager__factory.createInterface().encodeFunctionData(
          "grant",
          [mainVotingPlugin.address, _editor, EDITOR_PERMISSION_ID],
        ),
      },

      // Notify the new editor
      {
        to: mainVotingPlugin.address,
        value: 0,
        data: MainVotingPlugin__factory.createInterface().encodeFunctionData(
          "editorAdded",
          [_editor],
        ),
      },
    ];

    return mainVotingPlugin.connect(proposer).createProposal(
      toUtf8Bytes("ipfs://"),
      actions,
      0, // fail safe
      0, // start date
      0, // end date
      VoteOption.Yes,
      true, // auto execute
    ).then((tx) => tx.wait());
  };

  const proposeRemoveEditor = (_editor: string, proposer = alice) => {
    const actions: IDAO.ActionStruct[] = [
      // Grant the permission
      {
        to: dao.address,
        value: 0,
        data: PermissionManager__factory.createInterface().encodeFunctionData(
          "revoke",
          [mainVotingPlugin.address, _editor, EDITOR_PERMISSION_ID],
        ),
      },

      // Notify the removed editor
      {
        to: mainVotingPlugin.address,
        value: 0,
        data: MainVotingPlugin__factory.createInterface().encodeFunctionData(
          "editorRemoved",
          [_editor],
        ),
      },
    ];

    return mainVotingPlugin.connect(proposer).createProposal(
      toUtf8Bytes("ipfs://"),
      actions,
      0, // fail safe
      0, // start date
      0, // end date
      VoteOption.Yes,
      true, // auto execute
    ).then((tx) => tx.wait());
  };
});
