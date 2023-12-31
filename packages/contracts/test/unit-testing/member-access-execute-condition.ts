import {
  DAO,
  DAO__factory,
  MemberAccessExecuteCondition,
  MemberAccessExecuteCondition__factory,
} from '../../typechain';
import {deployTestDao} from '../helpers/test-dao';
import {
  ADDRESS_ONE,
  ADDRESS_TWO,
  ADDRESS_ZERO,
  DEPLOYER_PERMISSION_ID,
  EDITOR_PERMISSION_ID,
  EXECUTE_PERMISSION_ID,
  MEMBER_PERMISSION_ID,
  ROOT_PERMISSION_ID,
} from './common';
import {hexlify} from '@ethersproject/bytes';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {toUtf8Bytes} from 'ethers/lib/utils';
import {ethers} from 'hardhat';

const SOME_CONTRACT_ADDRESS = '0x' + '1234567890'.repeat(4);

describe('Member Access Condition', function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dao: DAO;
  let memberAccessExecuteCondition: MemberAccessExecuteCondition;

  before(async () => {
    [alice, bob, carol] = await ethers.getSigners();
    dao = await deployTestDao(alice);
  });

  beforeEach(async () => {
    const factory = new MemberAccessExecuteCondition__factory(alice);
    memberAccessExecuteCondition = await factory.deploy(SOME_CONTRACT_ADDRESS);
  });

  it('Should only accept granting and revoking', async () => {
    // Valid
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('grant', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);

    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('revoke', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);

    // Invalid
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('setDaoURI', [
          // call
          hexlify(toUtf8Bytes('ipfs://')),
        ])
      )
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('setMetadata', [
          // call
          hexlify(toUtf8Bytes('ipfs://')),
        ])
      )
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData(
          'setSignatureValidator',
          [
            // call
            ADDRESS_ONE,
          ]
        )
      )
    ).to.eq(false);
  });

  it('Should only allow MEMBER_PERMISSION_ID', async () => {
    // Valid
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('grant', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('revoke', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);

    // Invalid
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('grant', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          EDITOR_PERMISSION_ID,
        ])
      )
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('revoke', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          EDITOR_PERMISSION_ID,
        ])
      )
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('grant', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          ROOT_PERMISSION_ID,
        ])
      )
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('revoke', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          ROOT_PERMISSION_ID,
        ])
      )
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('grant', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          DEPLOYER_PERMISSION_ID,
        ])
      )
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('revoke', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          DEPLOYER_PERMISSION_ID,
        ])
      )
    ).to.eq(false);
  });

  it('Should only allow to target the intended plugin contract', async () => {
    // Valid
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('grant', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('revoke', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);

    // Invalid
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('grant', [
          // call
          ADDRESS_TWO,
          carol.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('revoke', [
          // call
          ADDRESS_TWO,
          carol.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(false);

    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('grant', [
          // call
          dao.address,
          carol.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(false);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('revoke', [
          // call
          dao.address,
          carol.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(false);
  });

  it("Should allow granting to whatever 'who' address", async () => {
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('grant', [
          // call
          SOME_CONTRACT_ADDRESS,
          alice.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('revoke', [
          // call
          SOME_CONTRACT_ADDRESS,
          alice.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);

    // Bob
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('grant', [
          // call
          SOME_CONTRACT_ADDRESS,
          bob.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('revoke', [
          // call
          SOME_CONTRACT_ADDRESS,
          bob.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);

    // Carol
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('grant', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('revoke', [
          // call
          SOME_CONTRACT_ADDRESS,
          carol.address,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);

    // Any
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('grant', [
          // call
          SOME_CONTRACT_ADDRESS,
          ADDRESS_ZERO,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);
    expect(
      await memberAccessExecuteCondition.isGranted(
        ADDRESS_ONE, // where (used)
        ADDRESS_TWO, // who (used)
        EXECUTE_PERMISSION_ID, // permission (used)
        DAO__factory.createInterface().encodeFunctionData('revoke', [
          // call
          SOME_CONTRACT_ADDRESS,
          ADDRESS_ZERO,
          MEMBER_PERMISSION_ID,
        ])
      )
    ).to.eq(true);
  });
});
