import { hexlify, toUtf8Bytes } from "ethers/lib/utils";
import {
  DAO,
  MainVotingPlugin,
  MainVotingPlugin__factory,
  MemberAccessVotingPlugin,
  MemberAccessVotingPlugin__factory,
  SpacePlugin,
  SpacePlugin__factory,
} from "../../typechain";
import { deployWithProxy, findEvent } from "../../utils/helpers";
import { deployTestDao } from "../helpers/test-dao";
import {
  ADDRESS_TWO,
  CONTENT_PERMISSION_ID,
  EDITOR_PERMISSION_ID,
  EXECUTE_PERMISSION_ID,
  MEMBER_PERMISSION_ID,
  ROOT_PERMISSION_ID,
  SUBSPACE_PERMISSION_ID,
  UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ProposalCreatedEvent } from "../../typechain/src/MemberAccessVotingPlugin";
import { DAO__factory } from "@aragon/osx-ethers";
import { ExecutedEvent } from "../../typechain/@aragon/osx/core/dao/DAO";

export type InitData = { contentUri: string };
export const defaultInitData: InitData = {
  contentUri: "ipfs://",
};

describe("Default Member Access plugin", function () {
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
    await mainVotingPlugin.initialize(dao.address);
    await spacePlugin.initialize(dao.address, defaultInput.contentUri);

    // Alice is an editor
    await dao.grant(
      memberAccessPlugin.address,
      alice.address,
      EDITOR_PERMISSION_ID,
    );
    await dao.grant(
      mainVotingPlugin.address,
      alice.address,
      EDITOR_PERMISSION_ID,
    );
    // Bob is a member
    await dao.grant(
      memberAccessPlugin.address,
      bob.address,
      MEMBER_PERMISSION_ID,
    );
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
        mainVotingPlugin.initialize(dao.address),
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

  describe("One editor", () => {
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

    it("Only the editor can approve memberships", async () => {
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

      // // Approve it (Bob) => fail
      // await expect(
      //   memberAccessPlugin.connect(alice).approve(0, false),
      // ).to.be.reverted;

      // Still not a member
      expect(
        await dao.hasPermission(
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
          toUtf8Bytes(""),
        ),
      ).to.eq(false);

      // let iface = DAO__factory.createInterface();
      // console.log(
      //   iface.parseError(
      //     "0xa6a7dbbd0000000000000000000000000000000000000000000000000000000000000000",
      //   ),
      // );

      // DAO ROOT on DAO
      expect(
        await dao.hasPermission(
          dao.address,
          dao.address,
          ROOT_PERMISSION_ID,
          toUtf8Bytes(""),
        ),
      ).to.eq(true);

      const tx = await memberAccessPlugin.connect(alice).approve(0, false);
      const receipt = await tx.wait();

      // require("fs").promises.writeFile(
      //   "./debug.json",
      //   JSON.stringify(receipt, null, 2),
      // );

      // expect(receipt).to.eq(
      //   "HI " + JSON.stringify(receipt, null, 2),
      // );

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
      ).to.eq(false);
    });
    it("Only the editor can reject memberships");
    it("Membership approvals are immediate");
    it("Membership rejections are immediate");
    it("Proposal execution is immediate when created by the only editor");
  });
  describe("Multiple editors", () => {
    it("Only editors can approve memberships");
    it("Proposals should be unsettled after created");
    it("Only editors can reject memberships");
    it("Memberships are approved after the first non-proposer editor approves");
    it("Memberships are rejected after the first non-proposer editor rejects");
    it("Proposal execution is immediate when the second editor approves");
    it("Proposal rejection is immediate when the second editor rejects");
  });

  it("Proposals require editor approval when created by a member");
  it("Rejected proposals cannot be approved");
  it("Rejected proposals cannot be executed");

  it("Membership proposals only grant/revoke membership permissions");
  it("Only the DAO can call the plugin to update the settings");
  it("The DAO and deployers can upgrade the plugin");
});
