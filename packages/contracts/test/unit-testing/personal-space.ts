import {
  DAO,
  PersonalSpaceVotingPlugin,
  PersonalSpaceVotingPlugin__factory,
  SpacePlugin,
  SpacePlugin__factory,
} from "../../typechain";
import { deployWithProxy } from "../../utils/helpers";
import { deployTestDao } from "../helpers/test-dao";
import { EDITOR_PERMISSION_ID, MEMBER_PERMISSION_ID } from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

export type InitData = { contentUri: string };
export const defaultInitData: InitData = {
  contentUri: "ipfs://",
};

describe("Default Geo Browser Space", function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dao: DAO;
  let personalSpaceVotingPlugin: PersonalSpaceVotingPlugin;
  let spacePlugin: SpacePlugin;
  let defaultInput: InitData;

  before(async () => {
    [alice, bob, charlie] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    defaultInput = { contentUri: "ipfs://" };
  });

  beforeEach(async () => {
    personalSpaceVotingPlugin = await deployWithProxy<
      PersonalSpaceVotingPlugin
    >(
      new PersonalSpaceVotingPlugin__factory(alice),
    );
    spacePlugin = await deployWithProxy<SpacePlugin>(
      new SpacePlugin__factory(alice),
    );

    await personalSpaceVotingPlugin.initialize(
      dao.address,
    );
    await spacePlugin.initialize(dao.address, defaultInput.contentUri);

    await dao.grant(
      personalSpaceVotingPlugin.address,
      alice.address,
      EDITOR_PERMISSION_ID,
    );
    await dao.grant(
      personalSpaceVotingPlugin.address,
      bob.address,
      MEMBER_PERMISSION_ID,
    );
  });

  describe("initialize", async () => {
    it("reverts if trying to re-initialize", async () => {
      await expect(
        personalSpaceVotingPlugin.initialize(dao.address),
      ).to.be.revertedWith("Initializable: contract is already initialized");
      await expect(
        spacePlugin.initialize(dao.address, "0x"),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  // const newNumber = BigNumber.from(456);

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

  it("Allows any address to request membership");

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
  it("Approved content proposals emit an event");
  it("Approved subspaces emit an event");
  it("The DAO and deployers can upgrade the plugins");
});
