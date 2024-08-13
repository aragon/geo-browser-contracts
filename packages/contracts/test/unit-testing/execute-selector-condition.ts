import {
  DAO,
  DAO__factory,
  IDAO,
  StdGovernancePlugin__factory,
  ExecuteSelectorCondition,
  ExecuteSelectorCondition__factory,
  TestExecuteSelectorCondition__factory,
  TestExecuteSelectorCondition,
} from '../../typechain';
import {getPluginSetupProcessorAddress} from '../../utils/helpers';
import {deployTestDao} from '../helpers/test-dao';
import {ADDRESS_ONE, ADDRESS_TWO, EXECUTE_PERMISSION_ID} from './common';
import {hexlify} from '@ethersproject/bytes';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {toUtf8Bytes} from 'ethers/lib/utils';
import {ethers, network} from 'hardhat';

const SOME_CONTRACT_ADDRESS = '0x' + '1234567890'.repeat(4);
const ONE_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000001';
const daoInterface = DAO__factory.createInterface();
const stdGovernancePluginInterface =
  StdGovernancePlugin__factory.createInterface();

describe('Execute selector Condition', function () {
  const pspAddress = getPluginSetupProcessorAddress(network.name, true);

  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dao: DAO;
  let executeSelectorCondition: ExecuteSelectorCondition;

  before(async () => {
    [alice, bob, carol] = await ethers.getSigners();
    dao = await deployTestDao(alice);
  });

  beforeEach(async () => {
    const factory = new ExecuteSelectorCondition__factory(alice);
    executeSelectorCondition = await factory.deploy(
      SOME_CONTRACT_ADDRESS,
      stdGovernancePluginInterface.getSighash('addMember')
    );
  });

  describe('Executing addMember on a certain contract', () => {
    it('Should only allow executing addMember', async () => {
      const actions: IDAO.ActionStruct[] = [
        {to: SOME_CONTRACT_ADDRESS, value: 0, data: '0x'},
      ];

      // Valid add
      actions[0].data = stdGovernancePluginInterface.encodeFunctionData(
        'addMember',
        [carol.address]
      );
      expect(
        await executeSelectorCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);

      // Invalid
      actions[0].data = stdGovernancePluginInterface.encodeFunctionData(
        'removeMember',
        [carol.address]
      );
      expect(
        await executeSelectorCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('setDaoURI', [
        hexlify(toUtf8Bytes('ipfs://')),
      ]);
      expect(
        await executeSelectorCondition.isGranted(
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
        await executeSelectorCondition.isGranted(
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
        await executeSelectorCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it('Should only allow to target the intended plugin contract', async () => {
      const actions: IDAO.ActionStruct[] = [
        {to: SOME_CONTRACT_ADDRESS, value: 0, data: '0x'},
      ];

      // Valid member add
      actions[0].data = stdGovernancePluginInterface.encodeFunctionData(
        'addMember',
        [carol.address]
      );
      expect(
        await executeSelectorCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(true);

      // Invalid
      actions[0].data = stdGovernancePluginInterface.encodeFunctionData(
        'removeMember',
        [carol.address]
      );
      expect(
        await executeSelectorCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid (editor)
      actions[0].data = stdGovernancePluginInterface.encodeFunctionData(
        'addEditor',
        [carol.address]
      );
      expect(
        await executeSelectorCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid (editor)
      actions[0].data = stdGovernancePluginInterface.encodeFunctionData(
        'removeEditor',
        [carol.address]
      );
      expect(
        await executeSelectorCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      // Invalid
      actions[0].data = daoInterface.encodeFunctionData('grant', [
        ADDRESS_TWO,
        carol.address,
        ONE_BYTES32,
      ]);
      expect(
        await executeSelectorCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      actions[0].data = daoInterface.encodeFunctionData('revoke', [
        ADDRESS_TWO,
        carol.address,
        ONE_BYTES32,
      ]);
      expect(
        await executeSelectorCondition.isGranted(
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
        ONE_BYTES32,
      ]);
      expect(
        await executeSelectorCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);

      actions[0].data = daoInterface.encodeFunctionData('revoke', [
        dao.address,
        carol.address,
        ONE_BYTES32,
      ]);
      expect(
        await executeSelectorCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          daoInterface.encodeFunctionData('execute', [ONE_BYTES32, actions, 0])
        )
      ).to.eq(false);
    });

    it('Should allow adding any address', async () => {
      const actions: IDAO.ActionStruct[] = [
        {to: SOME_CONTRACT_ADDRESS, value: 0, data: '0x'},
      ];
      for (const grantedToAddress of [
        SOME_CONTRACT_ADDRESS,
        bob.address,
        dao.address,
        ADDRESS_ONE,
      ]) {
        // Valid add
        actions[0].data = stdGovernancePluginInterface.encodeFunctionData(
          'addMember',
          [grantedToAddress]
        );
        expect(
          await executeSelectorCondition.isGranted(
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

  describe("Direct add's are not allowed", () => {
    it('Should reject adding and removing directly, rather than executing', async () => {
      // Valid
      expect(
        await executeSelectorCondition.isGranted(
          ADDRESS_ONE, // where (used)
          ADDRESS_TWO, // who (used)
          EXECUTE_PERMISSION_ID, // permission (used)
          stdGovernancePluginInterface.encodeFunctionData('addMember', [
            carol.address,
          ])
        )
      ).to.eq(false);
    });
  });

  describe('Decoders (internal)', () => {
    let testExecuteSelectorCondition: TestExecuteSelectorCondition;

    beforeEach(async () => {
      const factory = new TestExecuteSelectorCondition__factory(alice);
      testExecuteSelectorCondition = await factory.deploy(
        SOME_CONTRACT_ADDRESS,
        stdGovernancePluginInterface.getSighash('addMember')
      );
    });

    it('Should decode getSelector properly', async () => {
      const actions: IDAO.ActionStruct[] = [
        {
          to: dao.address,
          value: 0,
          data: stdGovernancePluginInterface.encodeFunctionData('addMember', [
            pspAddress,
          ]),
        },
        {
          to: dao.address,
          value: 0,
          data: stdGovernancePluginInterface.encodeFunctionData(
            'removeMember',
            [pspAddress]
          ),
        },
      ];

      expect(
        await testExecuteSelectorCondition.getSelector(actions[0].data)
      ).to.eq((actions[0].data as string).slice(0, 10));

      expect(
        await testExecuteSelectorCondition.getSelector(actions[1].data)
      ).to.eq((actions[1].data as string).slice(0, 10));
    });

    it('Should decode decodeGrantRevokeCalldata properly', async () => {
      const factory = new TestExecuteSelectorCondition__factory(alice);
      const testExecuteSelectorCondition = await factory.deploy(
        SOME_CONTRACT_ADDRESS,
        stdGovernancePluginInterface.getSighash('addMember')
      );

      const calldata = stdGovernancePluginInterface.encodeFunctionData(
        'addMember',
        [pspAddress]
      );

      // 1
      const [selector, who] =
        await testExecuteSelectorCondition.decodeAddMemberCalldata(calldata);
      expect(selector).to.eq(calldata.slice(0, 10));
      expect(who).to.eq(pspAddress);
    });
  });
});
