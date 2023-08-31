import { toUtf8Bytes } from "ethers/lib/utils";
import {
  DAO,
  MemberAccessVotingPlugin,
  MemberAccessVotingPlugin__factory,
  SpacePlugin,
  SpacePlugin__factory,
  SpaceVotingPlugin,
  SpaceVotingPlugin__factory,
} from "../../typechain";
import { deployWithProxy } from "../../utils/helpers";
import { deployTestDao } from "../helpers/test-dao";
import {
  ADDRESS_TWO,
  CONTENT_PERMISSION_ID,
  EDITOR_PERMISSION_ID,
  MEMBER_PERMISSION_ID,
  SUBSPACE_PERMISSION_ID,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

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
  let spaceVotingPlugin: SpaceVotingPlugin;
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
    spaceVotingPlugin = await deployWithProxy<SpaceVotingPlugin>(
      new SpaceVotingPlugin__factory(alice),
    );
    spacePlugin = await deployWithProxy<SpacePlugin>(
      new SpacePlugin__factory(alice),
    );

    await memberAccessPlugin.initialize(dao.address, {
      minApprovals: 0, // assuming only one editor
      proposalDuration: 60 * 60 * 24 * 5,
      mainVotingPlugin: spaceVotingPlugin.address,
    });
    await spaceVotingPlugin.initialize(dao.address);
    await spacePlugin.initialize(dao.address, defaultInput.contentUri);

    // Alice is an editor
    await dao.grant(
      memberAccessPlugin.address,
      alice.address,
      EDITOR_PERMISSION_ID,
    );
    await dao.grant(
      spaceVotingPlugin.address,
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
      spaceVotingPlugin.address,
      bob.address,
      MEMBER_PERMISSION_ID,
    );
  });

  describe("initialize", async () => {
    it("reverts if trying to re-initialize", async () => {
      await expect(
        memberAccessPlugin.initialize(dao.address, {
          minApprovals: 0, // assuming one editor only
          proposalDuration: 60 * 60 * 24 * 5,
          mainVotingPlugin: spaceVotingPlugin.address,
        }),
      ).to.be.revertedWith("Initializable: contract is already initialized");
      await expect(
        spaceVotingPlugin.initialize(dao.address),
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

  it("Allows any address to request membership", async () => {
    await expect(
      memberAccessPlugin.proposeNewMember(
        toUtf8Bytes("ipfs://1234"),
        charlie.address,
      ),
    ).to.not.be.reverted;

    const proposal = await memberAccessPlugin.getProposal(1);
    expect(proposal.executed).to.eq(false);
    expect(proposal.approvals).to.eq(0);
    expect(proposal.parameters.minApprovals).to.eq(1);
    expect(proposal.actions.length).to.eq(1);
    expect(proposal.failsafeActionMap).to.eq(0);
  });

  it("Membership requests from editors have an extra minimum approval");

  describe("One editor", () => {
    it("Only editors can approve memberships");
    it("Only editors can reject memberships");
    it("Membership approvals are immediate (one editor)");
    it("Membership rejections are immediate (one editor)");
  });
  describe("Multiple editors", () => {
    it("Only editors can approve memberships");
    it("Only editors can reject memberships");
    it("Memberships are approved after the first editor approves");
    it("Memberships are rejected after the first editor rejects");
  });

  describe("One editor", () => {
    it("Proposal execution is immediate when created by the only editor");
  });
  describe("Multiple editors", () => {
    it("Proposal execution is immediate when the second editor approves");
    it("Proposal rejection is immediate when the second editor rejects");
  });

  it("Only editors can approve");
  it("Only editors can reject");
  it("Proposals require editor approval when created by a member");
  it("Rejected proposals cannot be executed");

  it("Membership proposals can only grant/revoke membership permissions");
  it("Only the plugin can call itself to update the settings");

  it("The DAO and deployers can upgrade the plugin");
});
