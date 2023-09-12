import { DAO, SpacePlugin, SpacePlugin__factory } from "../../typechain";
import { deployWithProxy } from "../../utils/helpers";
import { deployTestDao } from "../helpers/test-dao";
import {
  ADDRESS_TWO,
  CONTENT_PERMISSION_ID,
  SUBSPACE_PERMISSION_ID,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

export type InitData = { contentUri: string };
export const defaultInitData: InitData = {
  contentUri: "ipfs://",
};

describe("Space Plugin", function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dao: DAO;
  let spacePlugin: SpacePlugin;
  let defaultInput: InitData;

  before(async () => {
    [alice, bob, charlie] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    defaultInput = { contentUri: "ipfs://" };
  });

  beforeEach(async () => {
    spacePlugin = await deployWithProxy<SpacePlugin>(
      new SpacePlugin__factory(alice),
    );

    await spacePlugin.initialize(dao.address, defaultInput.contentUri);
  });

  describe("initialize", async () => {
    it("The Space plugin reverts if trying to re-initialize", async () => {
      await expect(
        spacePlugin.initialize(dao.address, defaultInput.contentUri),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  it("The Space plugin emits an event when new content is published", async () => {
    // Fails by default
    await expect(spacePlugin.connect(alice).setContent(1, 2, "hello"))
      .to.be.revertedWithCustomError(spacePlugin, "DaoUnauthorized")
      .withArgs(
        dao.address,
        spacePlugin.address,
        alice.address,
        CONTENT_PERMISSION_ID,
      );

    // Grant
    await dao.grant(
      spacePlugin.address,
      alice.address,
      CONTENT_PERMISSION_ID,
    );

    // Set content
    await expect(spacePlugin.connect(alice).setContent(1, 2, "hello"))
      .to.emit(spacePlugin, "ContentChanged")
      .withArgs(1, 2, "hello");
  });

  it("The Space plugin emits an event when a subspace is accepted", async () => {
    // Fails by default
    await expect(spacePlugin.connect(alice).acceptSubspace(ADDRESS_TWO))
      .to.be.revertedWithCustomError(spacePlugin, "DaoUnauthorized")
      .withArgs(
        dao.address,
        spacePlugin.address,
        alice.address,
        SUBSPACE_PERMISSION_ID,
      );

    // Grant
    await dao.grant(
      spacePlugin.address,
      alice.address,
      SUBSPACE_PERMISSION_ID,
    );

    // Set content
    await expect(spacePlugin.connect(alice).acceptSubspace(ADDRESS_TWO))
      .to.emit(spacePlugin, "SubspaceAccepted")
      .withArgs(ADDRESS_TWO);
  });

  it("The Space plugin emits an event when a subspace is removed", async () => {
    // Fails by default
    await expect(spacePlugin.connect(alice).removeSubspace(ADDRESS_TWO))
      .to.be.revertedWithCustomError(spacePlugin, "DaoUnauthorized")
      .withArgs(
        dao.address,
        spacePlugin.address,
        alice.address,
        SUBSPACE_PERMISSION_ID,
      );

    // Grant
    await dao.grant(
      spacePlugin.address,
      alice.address,
      SUBSPACE_PERMISSION_ID,
    );

    // Set content
    await expect(spacePlugin.connect(alice).removeSubspace(ADDRESS_TWO))
      .to.emit(spacePlugin, "SubspaceRemoved")
      .withArgs(ADDRESS_TWO);
  });

  it("Only the DAO can call functions on the space plugin");
});
