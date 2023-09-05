import {
  DAO,
  DAO__factory,
  MainVotingPlugin,
  MainVotingPlugin__factory,
  MemberAccessExecuteCondition,
  MemberAccessExecuteCondition__factory,
} from "../../typechain";
import { deployWithProxy } from "../../utils/helpers";
import {
  ADDRESS_ONE,
  ADDRESS_TWO,
  ADDRESS_ZERO,
  DEPLOYER_PERMISSION_ID,
  EDITOR_PERMISSION_ID,
  EXECUTE_PERMISSION_ID,
  MEMBER_PERMISSION_ID,
  ROOT_PERMISSION_ID,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployTestDao } from "../helpers/test-dao";
import { hexlify } from "@ethersproject/bytes";
import { toUtf8Bytes } from "ethers/lib/utils";

describe("Member Access condition", function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dao: DAO;
  let mainVotingPlugin: MainVotingPlugin;
  let memberAccessExecuteCondition: MemberAccessExecuteCondition;

  before(async () => {
    [alice, bob, charlie] = await ethers.getSigners();
    dao = await deployTestDao(alice);
  });

  beforeEach(async () => {
    mainVotingPlugin = await deployWithProxy<MainVotingPlugin>(
      new MainVotingPlugin__factory(alice),
    );

    const factory = new MemberAccessExecuteCondition__factory(alice);
    memberAccessExecuteCondition = await factory.deploy(
      mainVotingPlugin.address,
    );

    await mainVotingPlugin.initialize(dao.address);
  });

  it("Should only accept granting and revoking", async () => {
    // Valid
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("grant", [ // call
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);

    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("revoke", [ // call
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);

    // Invalid
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("setDaoURI", [ // call
          hexlify(toUtf8Bytes("ipfs://")),
        ]),
      ),
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("setMetadata", [ // call
          hexlify(toUtf8Bytes("ipfs://")),
        ]),
      ),
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData(
          "setSignatureValidator",
          [ // call
            ADDRESS_ONE,
          ],
        ),
      ),
    ).to.eq(false);
  });

  it("Should only allow MEMBER_PERMISSION_ID", async () => {
    // Valid
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("grant", [ // call
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("revoke", [ // call
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);

    // Invalid
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("grant", [ // call
          mainVotingPlugin.address,
          charlie.address,
          EDITOR_PERMISSION_ID,
        ]),
      ),
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("revoke", [ // call
          mainVotingPlugin.address,
          charlie.address,
          EDITOR_PERMISSION_ID,
        ]),
      ),
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("grant", [ // call
          mainVotingPlugin.address,
          charlie.address,
          ROOT_PERMISSION_ID,
        ]),
      ),
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("revoke", [ // call
          mainVotingPlugin.address,
          charlie.address,
          ROOT_PERMISSION_ID,
        ]),
      ),
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("grant", [ // call
          mainVotingPlugin.address,
          charlie.address,
          DEPLOYER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("revoke", [ // call
          mainVotingPlugin.address,
          charlie.address,
          DEPLOYER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(false);
  });

  it("Should only allow to target the intended plugin contract", async () => {
    // Valid
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("grant", [ // call
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("revoke", [ // call
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);

    // Invalid
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("grant", [ // call
          ADDRESS_TWO,
          charlie.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("revoke", [ // call
          ADDRESS_TWO,
          charlie.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(false);

    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("grant", [ // call
          dao.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("revoke", [ // call
          dao.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(false);
  });

  it("Should allow granting to whatever 'who' address", async () => {
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("grant", [ // call
          mainVotingPlugin.address,
          alice.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("revoke", [ // call
          mainVotingPlugin.address,
          alice.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);

    // Bob
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("grant", [ // call
          mainVotingPlugin.address,
          bob.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("revoke", [ // call
          mainVotingPlugin.address,
          bob.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);

    // Charlie
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("grant", [ // call
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("revoke", [ // call
          mainVotingPlugin.address,
          charlie.address,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);

    // Any
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("grant", [ // call
          mainVotingPlugin.address,
          ADDRESS_ZERO,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData("revoke", [ // call
          mainVotingPlugin.address,
          ADDRESS_ZERO,
          MEMBER_PERMISSION_ID,
        ]),
      ),
    ).to.eq(true);
  });
});
