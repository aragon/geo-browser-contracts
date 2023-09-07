import { hexlify, hexZeroPad, toUtf8Bytes } from "ethers/lib/utils";
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
import { deployWithProxy, findEvent } from "../../utils/helpers";
import { deployTestDao } from "../helpers/test-dao";
import {
  ADDRESS_ONE,
  ADDRESS_TWO,
  ADDRESS_ZERO,
  EDITOR_PERMISSION_ID,
  EMPTY_DATA,
  EXECUTE_PERMISSION_ID,
  MEMBER_PERMISSION_ID,
  ROOT_PERMISSION_ID,
  UPDATE_ADDRESSES_PERMISSION_ID,
  UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
  UPGRADE_PLUGIN_PERMISSION_ID,
  VoteOption,
  ZERO_BYTES32,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ProposalCreatedEvent } from "../../typechain/src/MemberAccessVotingPlugin";
import { DAO__factory } from "@aragon/osx-ethers";
import { defaultMainVotingSettings } from "./common";
import { BigNumber } from "ethers";

export type InitData = { contentUri: string };
export const defaultInitData: InitData = {
  contentUri: "ipfs://",
};

describe("Default Member Access plugin", function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let debbie: SignerWithAddress;
  let dao: DAO;
  let memberAccessPlugin: MemberAccessVotingPlugin;
  let mainVotingPlugin: MainVotingPlugin;
  let spacePlugin: SpacePlugin;
  let defaultInput: InitData;

  before(async () => {
    [alice, bob, charlie, debbie] = await ethers.getSigners();
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
    // The plugin can execute on the DAO
    await dao.grant(
      dao.address,
      memberAccessPlugin.address,
      EXECUTE_PERMISSION_ID,
    );
    // The main voting plugin can also execute on the DAO
    await dao.grant(
      dao.address,
      mainVotingPlugin.address,
      EXECUTE_PERMISSION_ID,
    );
    // The DAO can report new/removed editors to the main voting plugin
    await dao.grant(
      mainVotingPlugin.address,
      dao.address,
      UPDATE_ADDRESSES_PERMISSION_ID,
    );
    // The DAO can update the plugin settings
    await dao.grant(
      memberAccessPlugin.address,
      dao.address,
      UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
    );
    // The DAO can upgrade the plugin
    await dao.grant(
      memberAccessPlugin.address,
      dao.address,
      UPGRADE_PLUGIN_PERMISSION_ID,
    );
    // The DAO is ROOT on itself
    await dao.grant(dao.address, dao.address, ROOT_PERMISSION_ID);
    // Alice can make the DAO execute arbitrary stuff (test)
    await dao.grant(dao.address, alice.address, EXECUTE_PERMISSION_ID);

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

    it("Fails to initialize with an incompatible main voting plugin", async () => {
      // ok
      memberAccessPlugin = await deployWithProxy<MemberAccessVotingPlugin>(
        new MemberAccessVotingPlugin__factory(alice),
      );
      await expect(
        memberAccessPlugin.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: mainVotingPlugin.address,
        }),
      ).to.not.be.reverted;

      // not ok
      memberAccessPlugin = await deployWithProxy<MemberAccessVotingPlugin>(
        new MemberAccessVotingPlugin__factory(alice),
      );
      await expect(
        memberAccessPlugin.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: ADDRESS_ONE,
        }),
      ).to.be.reverted;

      // not ok
      memberAccessPlugin = await deployWithProxy<MemberAccessVotingPlugin>(
        new MemberAccessVotingPlugin__factory(alice),
      );
      await expect(
        memberAccessPlugin.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: charlie.address,
        }),
      ).to.be.reverted;
    });
  });

  it("Allows any address to request membership", async () => {
    // Random
    await expect(
      memberAccessPlugin.connect(charlie).proposeNewMember(
        toUtf8Bytes("ipfs://1234"),
        charlie.address,
      ),
    ).to.not.be.reverted;

    let proposal = await memberAccessPlugin.getProposal(0);
    expect(proposal.executed).to.eq(false);
    expect(proposal.approvals).to.eq(0);
    expect(proposal.parameters.minApprovals).to.eq(1);
    expect(proposal.actions.length).to.eq(1);
    expect(proposal.failsafeActionMap).to.eq(0);
    expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(false);
    expect(await mainVotingPlugin.isMember(charlie.address)).to.eq(false);

    // Member
    await expect(
      memberAccessPlugin.connect(bob).proposeNewMember(
        toUtf8Bytes("ipfs://1234"),
        ADDRESS_ONE,
      ),
    ).to.not.be.reverted;

    proposal = await memberAccessPlugin.getProposal(0);
    expect(proposal.executed).to.eq(false);
    expect(proposal.approvals).to.eq(0);
    expect(proposal.parameters.minApprovals).to.eq(1);
    expect(proposal.actions.length).to.eq(1);
    expect(proposal.failsafeActionMap).to.eq(0);
    expect(await memberAccessPlugin.isMember(ADDRESS_ONE)).to.eq(false);
    expect(await mainVotingPlugin.isMember(ADDRESS_ONE)).to.eq(false);

    // Editor
    await expect(
      memberAccessPlugin.connect(alice).proposeNewMember(
        toUtf8Bytes("ipfs://1234"),
        ADDRESS_TWO,
      ),
    ).to.not.be.reverted;

    proposal = await memberAccessPlugin.getProposal(1);
    expect(proposal.executed).to.eq(false);
    expect(proposal.approvals).to.eq(0);
    expect(proposal.parameters.minApprovals).to.eq(1);
    expect(proposal.actions.length).to.eq(1);
    expect(proposal.failsafeActionMap).to.eq(0);
    // Auto executed
    expect(await memberAccessPlugin.isMember(ADDRESS_TWO)).to.eq(true);
    expect(await mainVotingPlugin.isMember(ADDRESS_TWO)).to.eq(true);
  });

  it("Editors should members too", async () => {
    expect(await memberAccessPlugin.isMember(alice.address)).to.eq(true);
    expect(await mainVotingPlugin.isMember(alice.address)).to.eq(true);
  });

  it("Emits an event when membership is requested", async () => {
    const tx = await memberAccessPlugin.connect(charlie).proposeNewMember(
      toUtf8Bytes("ipfs://2345"),
      charlie.address,
    );

    await expect(tx).to.emit(
      memberAccessPlugin,
      "ProposalCreated",
    );

    const event = await findEvent<ProposalCreatedEvent>(
      tx,
      "ProposalCreated",
    );

    expect(!!event).to.eq(true);
    expect(event!.args.proposalId).to.equal(0);
    expect(event!.args.creator).to.equal(charlie.address);
    expect(event!.args.metadata).to.equal(hexlify(toUtf8Bytes("ipfs://2345")));
    expect(event!.args.actions.length).to.equal(1);
    expect(event!.args.actions[0].to).to.equal(dao.address);
    expect(event!.args.actions[0].value).to.equal(0);
    expect(event!.args.actions[0].data).to.equal(
      DAO__factory.createInterface().encodeFunctionData("grant", [
        mainVotingPlugin.address,
        charlie.address,
        MEMBER_PERMISSION_ID,
      ]),
    );
    expect(event!.args.allowFailureMap).to.equal(0);
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
    it("Only the editor can approve memberships", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(1);

      expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(false);

      await expect(
        memberAccessPlugin.connect(charlie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          charlie.address,
        ),
      ).to.not.be.reverted;

      expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(false);

      // Approve it (Bob) => fail
      await expect(
        memberAccessPlugin.connect(bob).approve(0, false),
      ).to.be.reverted;

      // Still not a member
      expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(false);

      // Approve it (Alice) => success
      await expect(
        memberAccessPlugin.connect(alice).approve(0, false),
      ).to.not.be.reverted;

      // Now Charlie is a member
      expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(true);
    });

    it("Only the editor can reject memberships", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(1);

      expect(
        await dao.hasPermission(
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
          toUtf8Bytes(""),
        ),
      ).to.eq(false);

      await expect(
        memberAccessPlugin.connect(charlie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          charlie.address,
        ),
      ).to.not.be.reverted;

      expect(
        await dao.hasPermission(
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
          toUtf8Bytes(""),
        ),
      ).to.eq(false);

      // Reject it (Bob) => fail
      await expect(
        memberAccessPlugin.connect(bob).reject(0),
      ).to.be.reverted;

      // Still not a member
      expect(
        await dao.hasPermission(
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
          toUtf8Bytes(""),
        ),
      ).to.eq(false);

      // Reject it (Alice) => success
      await expect(
        memberAccessPlugin.connect(alice).reject(0),
      ).to.not.be.reverted;

      // Charlie is not a member
      expect(
        await dao.hasPermission(
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
          toUtf8Bytes(""),
        ),
      ).to.eq(false);

      // Try to approve it (Alice) => fail
      await expect(
        memberAccessPlugin.connect(alice).approve(0, false),
      ).to.be.reverted;
    });

    it("Membership approvals are immediate", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(1);

      await expect(
        memberAccessPlugin.connect(charlie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          charlie.address,
        ),
      ).to.not.be.reverted;

      // Approve it (Alice) => success
      await expect(
        memberAccessPlugin.connect(alice).approve(0, false),
      ).to.not.be.reverted;

      const proposal = await memberAccessPlugin.getProposal(0);
      expect(proposal.executed).to.eq(true);

      // Approve it (Alice) => fail
      await expect(
        memberAccessPlugin.connect(alice).approve(0, false),
      ).to.be.reverted;
    });

    it("Membership rejections are immediate", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(1);

      await expect(
        memberAccessPlugin.connect(charlie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          charlie.address,
        ),
      ).to.not.be.reverted;

      // Reject it (Alice) => success
      await expect(
        memberAccessPlugin.connect(alice).reject(0),
      ).to.not.be.reverted;

      const proposal = await memberAccessPlugin.getProposal(0);
      expect(proposal.executed).to.eq(false);

      // Try to approve it (Alice) => fail
      await expect(
        memberAccessPlugin.connect(bob).reject(0),
      ).to.be.reverted;
    });

    it("Proposal execution is immediate when created by the only editor", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(1);

      expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(false);

      // Alice proposes
      await expect(
        memberAccessPlugin.proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          charlie.address,
        ),
      ).to.not.be.reverted;

      // Now Charlie is a member
      expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(true);

      // Undo
      await expect(
        memberAccessPlugin.proposeRemoveMember(
          toUtf8Bytes("ipfs://1234"),
          charlie.address,
        ),
      ).to.not.be.reverted;

      // Charlie is no longer a member
      expect(await memberAccessPlugin.isMember(charlie.address)).to.eq(false);
    });

    it("Proposals created by a non-editor need an editor's approval", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(1);
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      await expect(
        memberAccessPlugin.connect(debbie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;
      let pid = 0;

      let proposal = await memberAccessPlugin.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(1);
      expect(await memberAccessPlugin.canExecute(pid)).to.eq(false);
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Debbie cannot
      await expect(memberAccessPlugin.connect(debbie).approve(pid, false)).to
        .be.reverted;
      await expect(memberAccessPlugin.connect(debbie).execute(pid)).to
        .be.reverted;
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Alice can
      await expect(memberAccessPlugin.connect(alice).approve(pid, false)).to
        .not.be.reverted;
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);
    });
  });

  describe("Multiple editors", () => {
    // Alice: editor
    // Bob: editor
    // Charlie: editor

    beforeEach(async () => {
      let pidMainVoting = 0;
      await proposeNewEditor(bob.address);
      await proposeNewEditor(charlie.address);
      pidMainVoting = 1;
      await mainVotingPlugin.connect(bob).vote(
        pidMainVoting,
        VoteOption.Yes,
        true,
      );
    });

    it("Only editors can approve new memberships", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(3);

      // Requesting membership for Debbie
      let pid = 0;
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);
      await expect(
        memberAccessPlugin.connect(debbie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Debbie cannot approve (fail)
      await expect(
        memberAccessPlugin.connect(debbie).approve(pid, false),
      ).to.be.reverted;

      // Debbie is still not a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Approve it (Alice)
      await expect(
        memberAccessPlugin.connect(alice).approve(pid, false),
      ).to.not.be.reverted;

      // Debbie is now a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);

      // Now requesting for 0x1
      expect(await memberAccessPlugin.isMember(ADDRESS_ONE)).to.eq(false);
      await expect(
        memberAccessPlugin.connect(debbie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          ADDRESS_ONE,
        ),
      ).to.not.be.reverted;
      pid++;
      expect(await memberAccessPlugin.isMember(ADDRESS_ONE)).to.eq(false);

      // Debbie cannot approve (fail)
      await expect(
        memberAccessPlugin.connect(debbie).approve(pid, false),
      ).to.be.reverted;

      // ADDRESS_ONE is still not a member
      expect(await memberAccessPlugin.isMember(ADDRESS_ONE)).to.eq(false);

      // Approve it (Bob)
      await expect(
        memberAccessPlugin.connect(bob).approve(pid, false),
      ).to.not.be.reverted;

      // ADDRESS_ONE is now a member
      expect(await memberAccessPlugin.isMember(ADDRESS_ONE)).to.eq(true);

      // Now requesting for 0x2
      expect(await memberAccessPlugin.isMember(ADDRESS_TWO)).to.eq(false);
      await expect(
        memberAccessPlugin.connect(debbie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          ADDRESS_TWO,
        ),
      ).to.not.be.reverted;
      pid++;
      expect(await memberAccessPlugin.isMember(ADDRESS_TWO)).to.eq(false);

      // Debbie cannot approve (fail)
      await expect(
        memberAccessPlugin.connect(debbie).approve(pid, false),
      ).to.be.reverted;

      // ADDRESS_TWO is still not a member
      expect(await memberAccessPlugin.isMember(ADDRESS_TWO)).to.eq(false);

      // Approve it (Charlie)
      await expect(
        memberAccessPlugin.connect(charlie).approve(pid, false),
      ).to.not.be.reverted;

      // ADDRESS_TWO is now a member
      expect(await memberAccessPlugin.isMember(ADDRESS_TWO)).to.eq(true);
    });

    it("Only editors can approve removing memberships", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(3);
      await dao.grant(
        mainVotingPlugin.address,
        debbie.address,
        MEMBER_PERMISSION_ID,
      );
      await dao.grant(
        mainVotingPlugin.address,
        ADDRESS_ONE,
        MEMBER_PERMISSION_ID,
      );
      await dao.grant(
        mainVotingPlugin.address,
        ADDRESS_TWO,
        MEMBER_PERMISSION_ID,
      );

      // Requesting membership for Debbie
      let pid = 0;
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);
      await expect(
        memberAccessPlugin.connect(debbie).proposeRemoveMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);

      // Debbie cannot approve (fail)
      await expect(
        memberAccessPlugin.connect(debbie).approve(pid, false),
      ).to.be.reverted;

      // Debbie remains as a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);

      // Approve it (Alice)
      await expect(
        memberAccessPlugin.connect(alice).approve(pid, false),
      ).to.not.be.reverted;

      // Debbie is no longer a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Now requesting for 0x1
      expect(await memberAccessPlugin.isMember(ADDRESS_ONE)).to.eq(true);
      await expect(
        memberAccessPlugin.connect(debbie).proposeRemoveMember(
          toUtf8Bytes("ipfs://1234"),
          ADDRESS_ONE,
        ),
      ).to.not.be.reverted;
      pid++;
      expect(await memberAccessPlugin.isMember(ADDRESS_ONE)).to.eq(true);

      // Debbie cannot approve (fail)
      await expect(
        memberAccessPlugin.connect(debbie).approve(pid, false),
      ).to.be.reverted;

      // ADDRESS_ONE remains as a member
      expect(await memberAccessPlugin.isMember(ADDRESS_ONE)).to.eq(true);

      // Approve it (Bob)
      await expect(
        memberAccessPlugin.connect(bob).approve(pid, false),
      ).to.not.be.reverted;

      // ADDRESS_ONE is no longer a member
      expect(await memberAccessPlugin.isMember(ADDRESS_ONE)).to.eq(false);

      // Now requesting for 0x2
      expect(await memberAccessPlugin.isMember(ADDRESS_TWO)).to.eq(true);
      await expect(
        memberAccessPlugin.connect(debbie).proposeRemoveMember(
          toUtf8Bytes("ipfs://1234"),
          ADDRESS_TWO,
        ),
      ).to.not.be.reverted;
      pid++;
      expect(await memberAccessPlugin.isMember(ADDRESS_TWO)).to.eq(true);

      // Debbie cannot approve (fail)
      await expect(
        memberAccessPlugin.connect(debbie).approve(pid, false),
      ).to.be.reverted;

      // ADDRESS_TWO remains as a member
      expect(await memberAccessPlugin.isMember(ADDRESS_TWO)).to.eq(true);

      // Approve it (Charlie)
      await expect(
        memberAccessPlugin.connect(charlie).approve(pid, false),
      ).to.not.be.reverted;

      // ADDRESS_TWO is no longer a member
      expect(await memberAccessPlugin.isMember(ADDRESS_TWO)).to.eq(false);
    });

    it("Proposals should be unsettled after created", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(3);

      // Proposed by a random wallet
      await expect(
        memberAccessPlugin.connect(debbie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;
      let pid = 0;

      let proposal = await memberAccessPlugin.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(1);
      expect(await memberAccessPlugin.canExecute(pid)).to.eq(false);
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      await dao.grant(
        mainVotingPlugin.address,
        debbie.address,
        MEMBER_PERMISSION_ID,
      ).then((tx) => tx.wait());

      // Proposed by a (now) member
      await expect(
        memberAccessPlugin.connect(debbie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          ADDRESS_ONE,
        ),
      ).to.not.be.reverted;
      pid++;

      expect((await memberAccessPlugin.getProposal(pid)).executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(1);
      expect(await memberAccessPlugin.canExecute(pid)).to.eq(false);
      expect(await memberAccessPlugin.isMember(ADDRESS_ONE)).to.eq(false);

      // Proposed by an editor
      await expect(
        memberAccessPlugin.connect(alice).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          ADDRESS_TWO,
        ),
      ).to.not.be.reverted;
      pid++;

      proposal = await memberAccessPlugin.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(2);
      expect(await memberAccessPlugin.canExecute(pid)).to.eq(false);
      expect(await memberAccessPlugin.isMember(ADDRESS_TWO)).to.eq(false);
    });

    it("Only editors can reject new membership proposals", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(3);

      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      await expect(
        memberAccessPlugin.connect(debbie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;

      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Reject it (Debbie) => fail
      await expect(memberAccessPlugin.connect(debbie).reject(0)).to.be.reverted;

      // Still not a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Reject it (Bob) => success
      await expect(memberAccessPlugin.connect(bob).reject(0)).to.not.be
        .reverted;

      // Still not a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Try to approve it (bob) => fail
      await expect(memberAccessPlugin.connect(bob).approve(0, false)).to.be
        .reverted;

      expect((await memberAccessPlugin.getProposal(0)).executed).to.eq(false);
    });

    it("Only editors can reject membership removal proposals", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(3);
      await dao.grant(
        mainVotingPlugin.address,
        debbie.address,
        MEMBER_PERMISSION_ID,
      ).then((tx) => tx.wait());

      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);

      await expect(
        memberAccessPlugin.connect(debbie).proposeRemoveMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;

      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);

      // Reject it (Debbie) => fail
      await expect(memberAccessPlugin.connect(debbie).reject(0)).to.be.reverted;

      // Still a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);

      // Reject it (Bob) => success
      await expect(memberAccessPlugin.connect(bob).reject(0)).to.not.be
        .reverted;

      // Still a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);

      // Try to approve it (bob) => fail
      await expect(memberAccessPlugin.connect(bob).approve(0, false)).to.be
        .reverted;

      expect((await memberAccessPlugin.getProposal(0)).executed).to.eq(false);
    });

    it("Proposals created by a non-editor need an editor's approval", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(3);
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      await expect(
        memberAccessPlugin.connect(debbie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;
      let pid = 0;

      let proposal = await memberAccessPlugin.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(1);
      expect(await memberAccessPlugin.canExecute(pid)).to.eq(false);
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Debbie cannot
      await expect(memberAccessPlugin.connect(debbie).approve(pid, false)).to
        .be.reverted;
      await expect(memberAccessPlugin.connect(debbie).execute(pid)).to
        .be.reverted;
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Alice can
      await expect(memberAccessPlugin.connect(alice).approve(pid, false)).to
        .not.be.reverted;
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);
    });

    it("Proposals created by an editor need another editor's approval", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(3);

      await expect(
        memberAccessPlugin.connect(alice).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;
      let pid = 0;

      const proposal = await memberAccessPlugin.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(2);
      expect(await memberAccessPlugin.canExecute(pid)).to.eq(false);
    });

    it("Memberships are approved when the first non-proposer editor approves", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(3);

      // Alice proposes a mew member
      await expect(
        memberAccessPlugin.connect(alice).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;
      let pid = 0;

      let proposal = await memberAccessPlugin.getProposal(pid);
      expect(proposal.executed).to.eq(false);

      // Approve it (Alice) => fail
      await expect(
        memberAccessPlugin.connect(alice).approve(pid, false),
      ).to.be.reverted;

      // Approve it (Debbie) => fail
      await expect(
        memberAccessPlugin.connect(debbie).approve(pid, false),
      ).to.be.reverted;

      // Approve it (Bob) => succeed
      await expect(
        memberAccessPlugin.connect(bob).approve(pid, false),
      ).to.not.be.reverted;

      proposal = await memberAccessPlugin.getProposal(pid);
      expect(proposal.executed).to.eq(true);

      // Now Debbie is a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);

      // Alice proposes aremoving a member

      await expect(
        memberAccessPlugin.connect(alice).proposeRemoveMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;
      pid++;

      proposal = await memberAccessPlugin.getProposal(pid);
      expect(proposal.executed).to.eq(false);

      // Approve it (Alice) => fail
      await expect(
        memberAccessPlugin.connect(alice).approve(pid, false),
      ).to.be.reverted;

      // Approve it (Debbie) => fail
      await expect(
        memberAccessPlugin.connect(debbie).approve(pid, false),
      ).to.be.reverted;

      // Still a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);

      // Approve it (Bob) => succeed
      await expect(
        memberAccessPlugin.connect(bob).approve(pid, false),
      ).to.not.be.reverted;

      proposal = await memberAccessPlugin.getProposal(pid);
      expect(proposal.executed).to.eq(true);

      // Now Debbie is a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);
    });

    it("Memberships are rejected when the first non-proposer editor rejects", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(3);

      // Alice proposes a mew member
      await expect(
        memberAccessPlugin.connect(alice).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;
      let pid = 0;

      expect((await memberAccessPlugin.getProposal(pid)).executed).to.eq(false);

      // Reject it (Alice) => can't change
      await expect(
        memberAccessPlugin.connect(alice).reject(pid),
      ).to.be.reverted;

      // Reject it (Debbie) => fail
      await expect(
        memberAccessPlugin.connect(debbie).reject(pid),
      ).to.be.reverted;

      // Reject it (Bob) => succeed
      await expect(
        memberAccessPlugin.connect(bob).reject(pid),
      ).to.not.be.reverted;

      // Reject it (Charlie) => can't anymore
      await expect(
        memberAccessPlugin.connect(charlie).reject(pid),
      ).to.be.reverted;

      expect((await memberAccessPlugin.getProposal(pid)).executed).to.eq(false);

      // Debbie is still not a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Alice proposes removing a member

      await dao.grant(
        mainVotingPlugin.address,
        debbie.address,
        MEMBER_PERMISSION_ID,
      ).then((tx) => tx.wait());

      await expect(
        memberAccessPlugin.connect(alice).proposeRemoveMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;
      pid++;

      expect((await memberAccessPlugin.getProposal(pid)).executed).to.eq(false);

      // Reject it (Alice) => can't change
      await expect(
        memberAccessPlugin.connect(alice).reject(pid),
      ).to.be.reverted;

      // Reject it (Debbie) => fail
      await expect(
        memberAccessPlugin.connect(debbie).reject(pid),
      ).to.be.reverted;

      // Still a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);

      // Reject it (Bob) => succeed
      await expect(
        memberAccessPlugin.connect(bob).reject(pid),
      ).to.not.be.reverted;

      expect((await memberAccessPlugin.getProposal(pid)).executed).to.eq(false);

      // Still a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);

      // Reject it (Charlie) => succeed
      await expect(
        memberAccessPlugin.connect(charlie).reject(pid),
      ).to.be.reverted;

      expect((await memberAccessPlugin.getProposal(pid)).executed).to.eq(false);

      // Still a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);
    });
  });

  // Alice: editor
  // Bob: member

  it("proposeNewMember should generate the right action list", async () => {
    await expect(
      memberAccessPlugin.connect(charlie).proposeNewMember(
        toUtf8Bytes("ipfs://1234"),
        charlie.address,
      ),
    ).to.not.be.reverted;

    const proposal = await memberAccessPlugin.getProposal(0);
    expect(proposal.actions.length).to.eq(1);
    expect(proposal.actions[0].to).to.eq(dao.address);
    expect(proposal.actions[0].value).to.eq(0);
    expect(proposal.actions[0].data).to.eq(
      DAO__factory.createInterface().encodeFunctionData("grant", [
        mainVotingPlugin.address,
        charlie.address,
        MEMBER_PERMISSION_ID,
      ]),
    );
  });

  it("proposeRemoveMember should generate the right action list", async () => {
    await expect(
      memberAccessPlugin.connect(bob).proposeRemoveMember(
        toUtf8Bytes("ipfs://1234"),
        bob.address,
      ),
    ).to.not.be.reverted;

    const proposal = await memberAccessPlugin.getProposal(0);
    expect(proposal.actions.length).to.eq(1);
    expect(proposal.actions[0].to).to.eq(dao.address);
    expect(proposal.actions[0].value).to.eq(0);
    expect(proposal.actions[0].data).to.eq(
      DAO__factory.createInterface().encodeFunctionData("revoke", [
        mainVotingPlugin.address,
        bob.address,
        MEMBER_PERMISSION_ID,
      ]),
    );
  });

  it("Attempting to approve twice fails", async () => {
    await expect(
      memberAccessPlugin.connect(debbie).proposeRemoveMember(
        toUtf8Bytes("ipfs://1234"),
        bob.address,
      ),
    ).to.not.be.reverted;

    let pid = 0;
    await expect(memberAccessPlugin.approve(pid, false)).to.not.be.reverted;
    await expect(memberAccessPlugin.approve(pid, false)).to.be.reverted;
  });

  it("Attempting to reject twice fails", async () => {
    await expect(
      memberAccessPlugin.connect(debbie).proposeRemoveMember(
        toUtf8Bytes("ipfs://1234"),
        bob.address,
      ),
    ).to.not.be.reverted;

    let pid = 0;
    await expect(memberAccessPlugin.reject(pid)).to.not.be.reverted;
    await expect(memberAccessPlugin.reject(pid)).to.be.reverted;
  });

  it("Attempting to propose adding an existing member fails", async () => {
    await expect(
      memberAccessPlugin.connect(charlie).proposeNewMember(
        toUtf8Bytes("ipfs://1234"),
        alice.address,
      ),
    ).to.be.reverted;

    await expect(
      memberAccessPlugin.connect(bob).proposeNewMember(
        toUtf8Bytes("ipfs://1234"),
        alice.address,
      ),
    ).to.be.reverted;

    await expect(
      memberAccessPlugin.connect(alice).proposeNewMember(
        toUtf8Bytes("ipfs://1234"),
        alice.address,
      ),
    ).to.be.reverted;
  });

  it("Attempting to propose removing a non-member fails", async () => {
    await expect(
      memberAccessPlugin.connect(charlie).proposeRemoveMember(
        toUtf8Bytes("ipfs://1234"),
        charlie.address,
      ),
    ).to.be.reverted;

    await expect(
      memberAccessPlugin.connect(bob).proposeRemoveMember(
        toUtf8Bytes("ipfs://1234"),
        ADDRESS_ONE,
      ),
    ).to.be.reverted;

    await expect(
      memberAccessPlugin.connect(alice).proposeRemoveMember(
        toUtf8Bytes("ipfs://1234"),
        ADDRESS_TWO,
      ),
    ).to.be.reverted;
  });

  it("Rejected proposals cannot be approved", async () => {
    await expect(
      memberAccessPlugin.connect(debbie).proposeRemoveMember(
        toUtf8Bytes("ipfs://1234"),
        bob.address,
      ),
    ).to.not.be.reverted;

    let pid = 0;
    await expect(memberAccessPlugin.reject(pid)).to.not.be.reverted;
    await expect(memberAccessPlugin.approve(pid, false)).to.be.reverted;
  });

  it("Rejected proposals cannot be executed", async () => {
    await expect(
      memberAccessPlugin.connect(debbie).proposeRemoveMember(
        toUtf8Bytes("ipfs://1234"),
        bob.address,
      ),
    ).to.not.be.reverted;

    let pid = 0;
    await expect(memberAccessPlugin.reject(pid)).to.not.be.reverted;
    await expect(memberAccessPlugin.execute(pid)).to.be.reverted;
  });

  it("Fails to update the settings to use an incompatible main voting plugin", async () => {
    const actionsWith = (targetAddr: string) => {
      return [
        {
          to: memberAccessPlugin.address,
          value: 0,
          data: MemberAccessVotingPlugin__factory.createInterface()
            .encodeFunctionData("updateMultisigSettings", [{
              proposalDuration: 60 * 60 * 24 * 5,
              mainVotingPlugin: targetAddr,
            }]),
        },
      ] as IDAO.ActionStruct[];
    };

    await expect(
      dao.execute(
        ZERO_BYTES32,
        actionsWith(ADDRESS_ZERO),
        0,
      ),
    ).to.be.reverted;

    await expect(
      dao.execute(
        ZERO_BYTES32,
        actionsWith(ADDRESS_ONE),
        0,
      ),
    ).to.be.reverted;

    await expect(
      dao.execute(
        ZERO_BYTES32,
        actionsWith(ADDRESS_TWO),
        0,
      ),
    ).to.be.reverted;

    await expect(
      dao.execute(
        ZERO_BYTES32,
        actionsWith(bob.address),
        0,
      ),
    ).to.be.reverted;

    await expect(
      dao.execute(
        ZERO_BYTES32,
        actionsWith(memberAccessPlugin.address),
        0,
      ),
    ).to.be.reverted;

    await expect(
      dao.execute(
        ZERO_BYTES32,
        actionsWith(mainVotingPlugin.address),
        0,
      ),
    ).to.not.be.reverted;
  });

  it("Only the DAO can call the plugin to update the settings", async () => {
    // Nobody else can
    await expect(
      memberAccessPlugin.connect(alice).updateMultisigSettings({
        proposalDuration: 60 * 60 * 24 * 5,
        mainVotingPlugin: mainVotingPlugin.address,
      }),
    ).to.be.reverted;
    await expect(
      memberAccessPlugin.connect(bob).updateMultisigSettings({
        proposalDuration: 60 * 60 * 24 * 5,
        mainVotingPlugin: mainVotingPlugin.address,
      }),
    ).to.be.reverted;
    await expect(
      memberAccessPlugin.connect(charlie).updateMultisigSettings({
        proposalDuration: 60 * 60 * 24 * 5,
        mainVotingPlugin: mainVotingPlugin.address,
      }),
    ).to.be.reverted;
    await expect(
      memberAccessPlugin.connect(debbie).updateMultisigSettings({
        proposalDuration: 60 * 60 * 24 * 5,
        mainVotingPlugin: mainVotingPlugin.address,
      }),
    ).to.be.reverted;

    // The DAO can
    const actions: IDAO.ActionStruct[] = [
      {
        to: memberAccessPlugin.address,
        value: 0,
        data: MemberAccessVotingPlugin__factory.createInterface()
          .encodeFunctionData("updateMultisigSettings", [{
            proposalDuration: 60 * 60 * 24 * 5,
            mainVotingPlugin: mainVotingPlugin.address,
          }]),
      },
    ];

    await expect(
      dao.execute(
        ZERO_BYTES32,
        actions,
        0,
      ),
    ).to.not.be.reverted;
  });

  it("The DAO can upgrade the plugin", async () => {
    // Nobody else can
    await expect(
      memberAccessPlugin.connect(alice).upgradeTo(ADDRESS_ONE),
    ).to.be.reverted;
    await expect(
      memberAccessPlugin.connect(bob).upgradeTo(ADDRESS_ONE),
    ).to.be.reverted;
    await expect(
      memberAccessPlugin.connect(charlie).upgradeToAndCall(
        memberAccessPlugin.implementation(), // upgrade to itself
        EMPTY_DATA,
      ),
    ).to.be.reverted;
    await expect(
      memberAccessPlugin.connect(debbie).upgradeToAndCall(
        memberAccessPlugin.implementation(), // upgrade to itself
        EMPTY_DATA,
      ),
    ).to.be.reverted;

    // The DAO can
    const actions: IDAO.ActionStruct[] = [
      {
        to: memberAccessPlugin.address,
        value: 0,
        data: MemberAccessVotingPlugin__factory.createInterface()
          .encodeFunctionData("upgradeTo", [
            await memberAccessPlugin.implementation(),
          ]),
      },
      {
        to: memberAccessPlugin.address,
        value: 0,
        data: MemberAccessVotingPlugin__factory.createInterface()
          .encodeFunctionData("supportsInterface", [
            "0x12345678",
          ]),
      },
    ];

    await expect(
      dao.execute(
        ZERO_BYTES32,
        actions,
        0,
      ),
    ).to.not.be.reverted;
  });

  // Helpers

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
