import {
  DAO,
  DAO__factory,
  IDAO,
  MemberAccessExecuteCondition,
  MemberAccessExecuteCondition__factory,
} from '../../typechain';
import {getPluginSetupProcessorAddress} from '../../utils/helpers';
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
import {ethers, network} from 'hardhat';

const SOME_CONTRACT_ADDRESS = '0x' + '1234567890'.repeat(4);
const ONE_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000001';
const PLUGIN_ADDR_1 = ADDRESS_ONE;
const PLUGIN_ADDR_2 = ADDRESS_TWO;
const daoInterface = DAO__factory.createInterface();

describe('Member Access Condition', function () {
  const pspAddress = getPluginSetupProcessorAddress(network.name, true);

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

  describe('Executing grant/revoke MEMBER_PERMISSION_ID on a certain contract', () => {
    it('Should only allow executing grant and revoke', async () => {
      const actions: IDAO.ActionStruct[] = [
        {to: dao.address, value: 0, data: '0x'},
      ];

      // Valid grant
      actions[0].data = daoInterface.encodeFunctionData('grant', [
        SOME_CONTRACT_ADDRESS,
        carol.address,
        MEMBER_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);

      // Valid revoke
      actions[0].data = daoInterface.encodeFunctionData('revoke', [
        SOME_CONTRACT_ADDRESS,
        carol.address,
        MEMBER_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('setDaoURI', [
        hexlify(toUtf8Bytes('ipfs://')),
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('setMetadata', [
        hexlify(toUtf8Bytes('ipfs://')),
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData(
        'setSignatureValidator',
        [ADDRESS_ONE]
      );
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it('Should only allow MEMBER_PERMISSION_ID', async () => {
      const actions: IDAO.ActionStruct[] = [
        {to: dao.address, value: 0, data: '0x'},
      ];

      // Valid grant
      actions[0].data = daoInterface.encodeFunctionData('grant', [
        SOME_CONTRACT_ADDRESS,
        carol.address,
        MEMBER_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);

      // Valid revoke
      actions[0].data = daoInterface.encodeFunctionData('revoke', [
        SOME_CONTRACT_ADDRESS,
        carol.address,
        MEMBER_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('grant', [
        SOME_CONTRACT_ADDRESS,
        carol.address,
        EDITOR_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      actions[0].data = daoInterface.encodeFunctionData('revoke', [
        SOME_CONTRACT_ADDRESS,
        carol.address,
        EDITOR_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('grant', [
        SOME_CONTRACT_ADDRESS,
        carol.address,
        ROOT_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      actions[0].data = daoInterface.encodeFunctionData('revoke', [
        SOME_CONTRACT_ADDRESS,
        carol.address,
        ROOT_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('grant', [
        SOME_CONTRACT_ADDRESS,
        carol.address,
        DEPLOYER_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      actions[0].data = daoInterface.encodeFunctionData('revoke', [
        SOME_CONTRACT_ADDRESS,
        carol.address,
        DEPLOYER_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it('Should only allow to target the intended plugin contract', async () => {
      const actions: IDAO.ActionStruct[] = [
        {to: dao.address, value: 0, data: '0x'},
      ];

      // Valid grant
      actions[0].data = daoInterface.encodeFunctionData('grant', [
        SOME_CONTRACT_ADDRESS,
        carol.address,
        MEMBER_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);

      // Valid revoke
      actions[0].data = daoInterface.encodeFunctionData('revoke', [
        SOME_CONTRACT_ADDRESS,
        carol.address,
        MEMBER_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('grant', [
        ADDRESS_TWO,
        carol.address,
        MEMBER_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      actions[0].data = daoInterface.encodeFunctionData('revoke', [
        ADDRESS_TWO,
        carol.address,
        MEMBER_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('grant', [
        dao.address,
        carol.address,
        MEMBER_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      actions[0].data = daoInterface.encodeFunctionData('revoke', [
        dao.address,
        carol.address,
        MEMBER_PERMISSION_ID,
      ]);
      expect(
        await memberAccessExecuteCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it("Should allow granting to whatever 'who' address", async () => {
      const actions: IDAO.ActionStruct[] = [
        {to: dao.address, value: 0, data: '0x'},
      ];
      for (const grantedToAddress of [
        SOME_CONTRACT_ADDRESS,
        bob.address,
        dao.address,
        ADDRESS_ONE,
      ]) {
        // Valid grant
        actions[0].data = daoInterface.encodeFunctionData('grant', [
          SOME_CONTRACT_ADDRESS,
          grantedToAddress,
          MEMBER_PERMISSION_ID,
        ]);
        expect(
          await memberAccessExecuteCondition.isGranted(
            ADDRESS_ONE, // where (used)
            ADDRESS_TWO, // who (used)
            EXECUTE_PERMISSION_ID, // permission (used)
            daoInterface.encodeFunctionData('execute', [
              ONE_BYTES32,
              actions,
              0,
            ])
          )
        ).to.eq(true);

        // Valid revoke
        actions[0].data = daoInterface.encodeFunctionData('revoke', [
          SOME_CONTRACT_ADDRESS,
          grantedToAddress,
          MEMBER_PERMISSION_ID,
        ]);
        expect(
          await memberAccessExecuteCondition.isGranted(
            ADDRESS_ONE, // where (used)
            ADDRESS_TWO, // who (used)
            EXECUTE_PERMISSION_ID, // permission (used)
            daoInterface.encodeFunctionData('execute', [
              ONE_BYTES32,
              actions,
              0,
            ])
          )
        ).to.eq(true);
      }
    });
  });

  describe('Direct grant and revoke are not allowed', () => {
    it('Should reject granting and revoking directly', async () => {
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
            MEMBER_PERMISSION_ID,
          ])
        )
      ).to.eq(false);
    });
  });

  describe('Decoders', () => {
    it('Should decode getSelector properly', async () => {
      const actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            PLUGIN_ADDR_1,
            pspAddress,
            MEMBER_PERMISSION_ID,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            PLUGIN_ADDR_1,
            pspAddress,
            MEMBER_PERMISSION_ID,
          ]),
        },
      ];

      expect(
        await memberAccessExecuteCondition.getSelector(actions[0].data)
      ).to.eq((actions[0].data as string).slice(0, 10));

      expect(
        await memberAccessExecuteCondition.getSelector(actions[1].data)
      ).to.eq((actions[1].data as string).slice(0, 10));
    });

    it('Should decode decodeGrantRevokeCalldata properly', async () => {
      const calldataList = [
        daoInterface.encodeFunctionData('grant', [
          PLUGIN_ADDR_1,
          pspAddress,
          MEMBER_PERMISSION_ID,
        ]),
        daoInterface.encodeFunctionData('revoke', [
          PLUGIN_ADDR_2,
          bob.address,
          ROOT_PERMISSION_ID,
        ]),
      ];

      // 1
      let [selector, where, who, permissionId] =
        await memberAccessExecuteCondition.decodeGrantRevokeCalldata(
          calldataList[0]
        );
      expect(selector).to.eq(calldataList[0].slice(0, 10));
      expect(where).to.eq(PLUGIN_ADDR_1);
      expect(who).to.eq(pspAddress);
      expect(permissionId).to.eq(MEMBER_PERMISSION_ID);

      // 2
      [selector, where, who, permissionId] =
        await memberAccessExecuteCondition.decodeGrantRevokeCalldata(
          calldataList[2]
        );
      expect(selector).to.eq(calldataList[2].slice(0, 10));
      expect(where).to.eq(PLUGIN_ADDR_2);
      expect(who).to.eq(bob.address);
      expect(permissionId).to.eq(ROOT_PERMISSION_ID);
    });
  });
});
