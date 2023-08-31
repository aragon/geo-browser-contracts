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

describe("Default Main Voting plugin", function () {
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
      minApprovals: 0,
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
          minApprovals: 0,
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

  it("Only members can create proposals");
  it("Only editors can vote on proposals");

  describe("One editor", () => {
    it("Proposals take immediate effect when created by the only editor");
  });
  describe("Multiple editors", () => {
    it("Proposals created by an editor require additional votes");
    it("A minimum participation is required");
    it("A minimum support threshold is required");
  });

  it("Only editors can approve");
  it("Only editors can reject");
  it("Proposals require editor approval when created by a member");
  it("Approved proposals can be executed by anyone");
  it("Rejected proposals cannot be executed");
  it("Membership proposals can only grant/revoke membership permissions");
  it("Only the DAO can call functions on the space plugin");

  it("The DAO and deployers can upgrade the plugins");
});
