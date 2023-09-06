import { hexlify, toUtf8Bytes } from "ethers/lib/utils";
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
  MEMBER_PERMISSION_ID,
  ROOT_PERMISSION_ID,
  VoteOption,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ProposalCreatedEvent } from "../../typechain/src/MemberAccessVotingPlugin";
import { DAO__factory } from "@aragon/osx-ethers";
import { defaultMainVotingSettings } from "./common";

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
    // The DAO is ROOT on itself
    await dao.grant(
      dao.address,
      dao.address,
      ROOT_PERMISSION_ID,
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

    it("Fails to initialize with an incompatible main voting plugin");
  });

  it("Allows any address to request membership", async () => {
    await expect(
      memberAccessPlugin.proposeNewMember(
        toUtf8Bytes("ipfs://1234"),
        charlie.address,
      ),
    ).to.not.be.reverted;

    const proposal = await memberAccessPlugin.getProposal(0);
    expect(proposal.executed).to.eq(false);
    expect(proposal.approvals).to.eq(0);
    expect(proposal.parameters.minApprovals).to.eq(1);
    expect(proposal.actions.length).to.eq(1);
    expect(proposal.failsafeActionMap).to.eq(0);
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

      // Approve it (Bob) => fail
      await expect(
        memberAccessPlugin.connect(bob).approve(0, false),
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

      // Approve it (Alice) => success
      await expect(
        memberAccessPlugin.connect(alice).approve(0, false),
      ).to.not.be.reverted;

      // Now Charlie is a member
      expect(
        await dao.hasPermission(
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
          toUtf8Bytes(""),
        ),
      ).to.eq(true);
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

      expect(
        await memberAccessPlugin.isMember(charlie.address),
      ).to.eq(false);

      // Alice proposes
      await expect(
        memberAccessPlugin.proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          charlie.address,
        ),
      ).to.not.be.reverted;

      // Now Charlie is a member
      expect(
        await memberAccessPlugin.isMember(charlie.address),
      ).to.eq(true);
    });
  });

  describe("Multiple editors", () => {
    // Alice, Bob and Charlie are editors

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

    it("Only editors can approve memberships", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(3);

      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      await expect(
        memberAccessPlugin.connect(debbie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;

      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Approve it (Alice)
      await expect(
        memberAccessPlugin.connect(alice).approve(0, false),
      ).to.not.be.reverted;

      // Still not a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(false);

      // Approve it (Bob)
      await expect(
        memberAccessPlugin.connect(bob).approve(0, false),
      ).to.not.be.reverted;

      // Now Debbie is a member
      expect(await memberAccessPlugin.isMember(debbie.address)).to.eq(true);
    });

    it("Proposals should be unsettled after created", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(3);

      await expect(
        memberAccessPlugin.connect(debbie).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          debbie.address,
        ),
      ).to.not.be.reverted;

      const proposal = await memberAccessPlugin.getProposal(0);
      expect(proposal.executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(2);
    });

    it("Only editors can reject memberships", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(2);

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

      await dao.grant(
        memberAccessPlugin.address,
        bob.address,
        EDITOR_PERMISSION_ID,
      );

      // Reject it (Bob) => success
      await expect(
        memberAccessPlugin.connect(bob).reject(0),
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

      // Try to approve it (bob) => fail
      await expect(
        memberAccessPlugin.connect(bob).approve(0, false),
      ).to.be.reverted;
    });

    it("Memberships are approved when the first non-proposer editor approves", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(2);

      // Alice creates
      await expect(
        memberAccessPlugin.connect(alice).proposeNewMember(
          toUtf8Bytes("ipfs://1234"),
          charlie.address,
        ),
      ).to.not.be.reverted;

      let proposal = await memberAccessPlugin.getProposal(0);
      expect(proposal.executed).to.eq(false);

      // Approve it (Bob) => fail
      await expect(
        memberAccessPlugin.connect(bob).approve(0, false),
      ).to.be.reverted;

      await dao.grant(
        memberAccessPlugin.address,
        bob.address,
        EDITOR_PERMISSION_ID,
      );

      // Approve it (Bob) => succeed
      await expect(
        memberAccessPlugin.connect(bob).approve(0, false),
      ).to.not.be.reverted;

      proposal = await memberAccessPlugin.getProposal(0);
      expect(proposal.executed).to.eq(true);

      // Now Charlie is a member
      expect(
        await dao.hasPermission(
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
          toUtf8Bytes(""),
        ),
      ).to.eq(true);
    });

    it("Memberships are rejected when the first non-proposer editor rejects", async () => {
      expect(await mainVotingPlugin.editorCount()).to.eq(2);

      // Alice creates
      await expect(
        memberAccessPlugin.connect(alice).proposeNewMember(
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

      await dao.grant(
        memberAccessPlugin.address,
        bob.address,
        EDITOR_PERMISSION_ID,
      );

      // Reject it (Bob) => success
      await expect(
        memberAccessPlugin.connect(bob).reject(0),
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
  });

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
      memberAccessPlugin.connect(charlie).proposeRemoveMember(
        toUtf8Bytes("ipfs://1234"),
        charlie.address,
      ),
    ).to.not.be.reverted;

    const proposal = await memberAccessPlugin.getProposal(0);
    expect(proposal.actions.length).to.eq(1);
    expect(proposal.actions[0].to).to.eq(dao.address);
    expect(proposal.actions[0].value).to.eq(0);
    expect(proposal.actions[0].data).to.eq(
      DAO__factory.createInterface().encodeFunctionData("revoke", [
        mainVotingPlugin.address,
        charlie.address,
        MEMBER_PERMISSION_ID,
      ]),
    );
  });

  it("Proposals require editor approval when created by a member");

  it("Attempting to approve twice fails");

  it("Attempting to reject twice fails");

  it("Rejected proposals cannot be approved");

  it("Rejected proposals cannot be executed");

  it("Membership proposals only grant/revoke membership permissions");
  it("Only the DAO can call the plugin to update the settings");
  it("The DAO and deployers can upgrade the plugin");

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
