import {
  DAO,
  IERC165Upgradeable__factory,
  TestCloneFactory,
  TestCloneFactory__factory,
  PersonalAdminPlugin,
  PersonalAdminPlugin__factory,
  SpacePlugin,
  SpacePlugin__factory,
  PersonalMemberAddHelper,
  PersonalMemberAddHelper__factory,
} from '../../typechain';
import {ExecutedEvent} from '../../typechain/@aragon/osx/core/dao/IDAO';
import {ProposalCreatedEvent} from '../../typechain/src/personal/PersonalAdminPlugin';
import {
  deployWithProxy,
  findEvent,
  findEventTopicLog,
  toBytes32,
} from '../../utils/helpers';
import {getInterfaceID} from '../../utils/interfaces';
import {deployTestDao} from '../helpers/test-dao';
import {
  ADDRESS_ONE,
  ADDRESS_THREE,
  ADDRESS_TWO,
  ADDRESS_ZERO,
  CONTENT_PERMISSION_ID,
  MEMBER_PERMISSION_ID,
  EDITOR_PERMISSION_ID,
  EXECUTE_PERMISSION_ID,
  SUBSPACE_PERMISSION_ID,
  ROOT_PERMISSION_ID,
  PROPOSER_PERMISSION_ID,
  ADD_MEMBER_PERMISSION_ID,
} from './common';
import {
  DAO__factory,
  IPlugin__factory,
  IProposal__factory,
} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {BigNumber} from 'ethers';
import {ethers} from 'hardhat';

export type InitData = {contentUri: string};
export const defaultInitData: InitData = {
  contentUri: 'ipfs://',
};
export const psvpInterface = new ethers.utils.Interface([
  'function initialize(address, address)',
  'function executeProposal(bytes,tuple(address,uint256,bytes)[],uint256)',
  'function submitEdits(string, address)',
  'function submitAcceptSubspace(address _subspaceDao, address _spacePlugin)',
  'function submitRemoveSubspace(address _subspaceDao, address _spacePlugin)',
  'function submitNewEditor(address _newEditor)',
  'function proposeAddMember(address _newMember)',
  'function addMember(address _newMember)',
  'function submitRemoveEditor(address _editor)',
  'function submitRemoveMember(address _member)',
  'function leaveSpace()',
]);

describe('Personal Admin Plugin', function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let dao: DAO;
  let personalAdminPlugin: PersonalAdminPlugin;
  let testCloneFactory: TestCloneFactory;
  let personalMemberAddHelper: PersonalMemberAddHelper;
  let spacePlugin: SpacePlugin;
  let defaultInput: InitData;
  let dummyActions: any;
  let dummyMetadata: string;

  before(async () => {
    [alice, bob, carol, david] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    defaultInput = {contentUri: 'ipfs://'};
    dummyActions = [
      {
        to: alice.address,
        data: '0x0000',
        value: 0,
      },
    ];
    dummyMetadata = ethers.utils.hexlify(
      ethers.utils.toUtf8Bytes('0x123456789')
    );

    const TestCloneFactory = new TestCloneFactory__factory(alice);
    testCloneFactory = await TestCloneFactory.deploy();
  });

  beforeEach(async () => {
    // Space
    spacePlugin = await deployWithProxy<SpacePlugin>(
      new SpacePlugin__factory(alice)
    );
    await spacePlugin.initialize(
      dao.address,
      defaultInput.contentUri,
      ADDRESS_ZERO
    );

    // Personal admin (plugin)
    const PersonalAdminPluginFactory = new PersonalAdminPlugin__factory(alice);
    const nonce = await ethers.provider.getTransactionCount(
      testCloneFactory.address
    );
    let anticipatedAddress = ethers.utils.getContractAddress({
      from: testCloneFactory.address,
      nonce,
    });
    await testCloneFactory.clonePersonalAdminPlugin();
    personalAdminPlugin = PersonalAdminPluginFactory.attach(anticipatedAddress);
    await initializePAP();

    // Personal member add (helper)
    const PersonalMemberAddFactory = new PersonalMemberAddHelper__factory(
      alice
    );
    anticipatedAddress = ethers.utils.getContractAddress({
      from: testCloneFactory.address,
      nonce: nonce + 1,
    });
    await testCloneFactory.clonePersonalMemberAddHelper();
    personalMemberAddHelper =
      PersonalMemberAddFactory.attach(anticipatedAddress);
    await initializePMAH();

    // Alice is editor
    await dao.grant(
      personalAdminPlugin.address,
      alice.address,
      EDITOR_PERMISSION_ID
    );
    // Bob is a member
    await dao.grant(
      personalAdminPlugin.address,
      bob.address,
      MEMBER_PERMISSION_ID
    );
    // The plugin can execute on the DAO
    await dao.grant(
      dao.address,
      personalAdminPlugin.address,
      EXECUTE_PERMISSION_ID
    );
    // The plugin can propose members on the helper
    await dao.grant(
      personalMemberAddHelper.address,
      personalAdminPlugin.address,
      PROPOSER_PERMISSION_ID
    );
    // The helper can execute on the DAO
    await dao.grant(
      dao.address,
      personalMemberAddHelper.address,
      EXECUTE_PERMISSION_ID
    );
    // The DAO can add members to the space
    await dao.grant(
      personalAdminPlugin.address,
      dao.address,
      ADD_MEMBER_PERMISSION_ID
    );
    // The DAO can use the Space
    await dao.grant(spacePlugin.address, dao.address, CONTENT_PERMISSION_ID);
    await dao.grant(spacePlugin.address, dao.address, SUBSPACE_PERMISSION_ID);
    // The DAO is root on itself
    await dao.grant(dao.address, dao.address, ROOT_PERMISSION_ID);
  });

  function initializePAP() {
    return personalAdminPlugin.initialize(dao.address, alice.address);
  }

  function initializePMAH() {
    return personalMemberAddHelper.initialize(dao.address, {
      proposalDuration: 60 * 60 * 24 * 5,
    });
  }

  describe('initialize: ', async () => {
    it('reverts if trying to re-initialize', async () => {
      // recreate
      const PersonalAdminPluginFactory = new PersonalAdminPlugin__factory(
        alice
      );
      const nonce = await ethers.provider.getTransactionCount(
        testCloneFactory.address
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: testCloneFactory.address,
        nonce,
      });
      await testCloneFactory.clonePersonalAdminPlugin();
      personalAdminPlugin = PersonalAdminPluginFactory.attach(
        anticipatedPluginAddress
      );
      // Should work
      await initializePAP();

      await expect(initializePAP()).to.be.revertedWith(
        'Initializable: contract is already initialized'
      );
    });
  });

  it('isMember() returns true when appropriate', async () => {
    expect(await personalAdminPlugin.isMember(ADDRESS_ZERO)).to.eq(false);
    expect(await personalAdminPlugin.isMember(ADDRESS_ONE)).to.eq(false);
    expect(await personalAdminPlugin.isMember(ADDRESS_TWO)).to.eq(false);

    expect(await personalAdminPlugin.isMember(alice.address)).to.eq(true);
    expect(await personalAdminPlugin.isMember(bob.address)).to.eq(true);
    expect(await personalAdminPlugin.isMember(carol.address)).to.eq(false);

    await dao.grant(
      personalAdminPlugin.address,
      carol.address,
      MEMBER_PERMISSION_ID
    );

    expect(await personalAdminPlugin.isMember(carol.address)).to.eq(true);
  });

  it('isEditor() returns true when appropriate', async () => {
    expect(await personalAdminPlugin.isEditor(ADDRESS_ZERO)).to.eq(false);
    expect(await personalAdminPlugin.isEditor(ADDRESS_ONE)).to.eq(false);
    expect(await personalAdminPlugin.isEditor(ADDRESS_TWO)).to.eq(false);

    expect(await personalAdminPlugin.isEditor(alice.address)).to.eq(true);
    expect(await personalAdminPlugin.isEditor(bob.address)).to.eq(false);
    expect(await personalAdminPlugin.isEditor(carol.address)).to.eq(false);

    await dao.grant(
      personalAdminPlugin.address,
      carol.address,
      EDITOR_PERMISSION_ID
    );

    expect(await personalAdminPlugin.isEditor(carol.address)).to.eq(true);
  });

  describe('Geo Browser customizations', () => {
    it('Only editors can create and execute arbitrary proposals', async () => {
      await expect(
        personalAdminPlugin.connect(bob).executeProposal('0x', dummyActions, 0)
      )
        .to.be.revertedWithCustomError(personalAdminPlugin, 'DaoUnauthorized')
        .withArgs(
          dao.address,
          personalAdminPlugin.address,
          bob.address,
          EDITOR_PERMISSION_ID
        );
      await expect(
        personalAdminPlugin
          .connect(carol)
          .executeProposal('0x', dummyActions, 0)
      )
        .to.be.revertedWithCustomError(personalAdminPlugin, 'DaoUnauthorized')
        .withArgs(
          dao.address,
          personalAdminPlugin.address,
          carol.address,
          EDITOR_PERMISSION_ID
        );

      // Alice is an editor
      await expect(
        personalAdminPlugin
          .connect(alice)
          .executeProposal('0x', dummyActions, 0)
      ).to.emit(personalAdminPlugin, 'ProposalCreated');
    });

    it('Only members or editors can call content proposal wrappers', async () => {
      for (const account of [alice, bob]) {
        await expect(
          personalAdminPlugin
            .connect(account)
            .submitEdits('ipfs://', spacePlugin.address)
        ).to.not.be.reverted;
        await expect(
          personalAdminPlugin
            .connect(account)
            .submitAcceptSubspace(ADDRESS_TWO, spacePlugin.address)
        ).to.not.be.reverted;
        await expect(
          personalAdminPlugin
            .connect(account)
            .submitRemoveSubspace(ADDRESS_THREE, spacePlugin.address)
        ).to.not.be.reverted;
      }
      expect(await personalAdminPlugin.proposalCount()).to.equal(
        BigNumber.from(6)
      );

      // Non members
      await expect(
        personalAdminPlugin
          .connect(carol)
          .submitEdits('ipfs://', spacePlugin.address)
      )
        .to.be.revertedWithCustomError(personalAdminPlugin, 'NotAMember')
        .withArgs(carol.address);
      await expect(
        personalAdminPlugin
          .connect(carol)
          .submitAcceptSubspace(ADDRESS_TWO, spacePlugin.address)
      )
        .to.be.revertedWithCustomError(personalAdminPlugin, 'NotAMember')
        .withArgs(carol.address);
      await expect(
        personalAdminPlugin
          .connect(carol)
          .submitRemoveSubspace(ADDRESS_TWO, spacePlugin.address)
      )
        .to.be.revertedWithCustomError(personalAdminPlugin, 'NotAMember')
        .withArgs(carol.address);
    });

    it('Only editors can call permission proposal wrappers', async () => {
      await expect(personalAdminPlugin.submitNewEditor(ADDRESS_TWO)).to.not.be
        .reverted;
      await expect(personalAdminPlugin.submitRemoveMember(ADDRESS_ONE)).to.not
        .be.reverted;
      await expect(personalAdminPlugin.submitRemoveEditor(ADDRESS_TWO)).to.not
        .be.reverted;

      expect(await personalAdminPlugin.proposalCount()).to.equal(
        BigNumber.from(3)
      );

      // Non editors
      await expect(
        personalAdminPlugin.connect(carol).submitNewEditor(ADDRESS_TWO)
      )
        .to.be.revertedWithCustomError(personalAdminPlugin, 'DaoUnauthorized')
        .withArgs(
          dao.address,
          personalAdminPlugin.address,
          carol.address,
          EDITOR_PERMISSION_ID
        );

      await expect(
        personalAdminPlugin.connect(carol).submitRemoveMember(ADDRESS_ONE)
      )
        .to.be.revertedWithCustomError(personalAdminPlugin, 'DaoUnauthorized')
        .withArgs(
          dao.address,
          personalAdminPlugin.address,
          carol.address,
          EDITOR_PERMISSION_ID
        );

      await expect(
        personalAdminPlugin.connect(carol).submitRemoveEditor(ADDRESS_TWO)
      )
        .to.be.revertedWithCustomError(personalAdminPlugin, 'DaoUnauthorized')
        .withArgs(
          dao.address,
          personalAdminPlugin.address,
          carol.address,
          EDITOR_PERMISSION_ID
        );

      expect(await personalAdminPlugin.proposalCount()).to.equal(
        BigNumber.from(3)
      );
    });

    it('Anyone can call proposeAddMember', async () => {
      for (const account of [alice, bob, carol, david]) {
        await expect(
          personalAdminPlugin
            .connect(account)
            .proposeAddMember('0x', account.address)
        ).to.not.be.reverted;
      }
      expect(await personalAdminPlugin.proposalCount()).to.equal(
        BigNumber.from(0)
      );
    });

    it('Proposal execution is immediate', async () => {
      const data = SpacePlugin__factory.createInterface().encodeFunctionData(
        'publishEdits',
        ['0x']
      );
      const actions = [
        {
          to: spacePlugin.address,
          value: 0,
          data,
        },
      ];
      await expect(
        personalAdminPlugin.connect(alice).executeProposal('0x', actions, 0)
      )
        .to.emit(spacePlugin, 'EditsPublished')
        .withArgs(dao.address, '0x');
    });

    it('Executed content proposals emit an event', async () => {
      // Encode an action to change some content
      const data = SpacePlugin__factory.createInterface().encodeFunctionData(
        'publishEdits',
        ['0x']
      );
      const actions = [
        {
          to: spacePlugin.address,
          value: 0,
          data,
        },
      ];

      await expect(
        personalAdminPlugin.connect(alice).executeProposal('0x', actions, 0)
      ).to.emit(personalAdminPlugin, 'ProposalCreated');

      // ProposalExecuted is redundant and not emitted

      await expect(
        personalAdminPlugin.connect(alice).executeProposal('0x', actions, 0)
      )
        .to.emit(spacePlugin, 'EditsPublished')
        .withArgs(dao.address, '0x');
    });

    it('Approved subspaces emit an event', async () => {
      // Encode an action to accept a subspace
      const data = SpacePlugin__factory.createInterface().encodeFunctionData(
        'acceptSubspace',
        [ADDRESS_TWO]
      );
      const actions = [
        {
          to: spacePlugin.address,
          value: 0,
          data,
        },
      ];

      await expect(
        personalAdminPlugin.connect(alice).executeProposal('0x', actions, 0)
      ).to.emit(personalAdminPlugin, 'ProposalCreated');

      // ProposalExecuted is redundant and not emitted

      await expect(
        personalAdminPlugin.connect(alice).executeProposal('0x', actions, 0)
      )
        .to.emit(spacePlugin, 'SubspaceAccepted')
        .withArgs(dao.address, ADDRESS_TWO);
    });

    it('Removed subspaces emit an event', async () => {
      // Encode an action to accept a subspace
      const actionsAccept = [
        {
          to: spacePlugin.address,
          value: 0,
          data: SpacePlugin__factory.createInterface().encodeFunctionData(
            'acceptSubspace',
            [ADDRESS_TWO]
          ),
        },
      ];
      const actionsRemove = [
        {
          to: spacePlugin.address,
          value: 0,
          data: SpacePlugin__factory.createInterface().encodeFunctionData(
            'removeSubspace',
            [ADDRESS_TWO]
          ),
        },
      ];

      await personalAdminPlugin
        .connect(alice)
        .executeProposal('0x', actionsAccept, 0);

      // remove
      await expect(
        personalAdminPlugin
          .connect(alice)
          .executeProposal('0x', actionsRemove, 0)
      ).to.emit(personalAdminPlugin, 'ProposalCreated');

      // ProposalExecuted is redundant and not emitted

      await expect(
        personalAdminPlugin
          .connect(alice)
          .executeProposal('0x', actionsRemove, 0)
      )
        .to.emit(spacePlugin, 'SubspaceRemoved')
        .withArgs(dao.address, ADDRESS_TWO);
    });
  });

  describe('Tests replicated from AdminPlugin', () => {
    describe('plugin interface: ', async () => {
      it('does not support the empty interface', async () => {
        expect(await personalAdminPlugin.supportsInterface('0xffffffff')).to.be
          .false;
      });

      it('supports the `IERC165Upgradeable` interface', async () => {
        const iface = IERC165Upgradeable__factory.createInterface();
        expect(
          await personalAdminPlugin.supportsInterface(getInterfaceID(iface))
        ).to.be.true;
      });

      it('supports the `IPlugin` interface', async () => {
        const iface = IPlugin__factory.createInterface();
        expect(
          await personalAdminPlugin.supportsInterface(getInterfaceID(iface))
        ).to.be.true;
      });

      it('supports the `IProposal` interface', async () => {
        const iface = IProposal__factory.createInterface();
        expect(
          await personalAdminPlugin.supportsInterface(getInterfaceID(iface))
        ).to.be.true;
      });
    });

    describe('execute proposal: ', async () => {
      it("fails to call DAO's `execute()` if `EXECUTE_PERMISSION` is not granted to the plugin address", async () => {
        await dao.revoke(
          dao.address,
          personalAdminPlugin.address,
          EXECUTE_PERMISSION_ID
        );

        await expect(
          personalAdminPlugin.executeProposal(dummyMetadata, dummyActions, 0)
        )
          .to.be.revertedWithCustomError(dao, 'Unauthorized')
          .withArgs(
            dao.address,
            personalAdminPlugin.address,
            EXECUTE_PERMISSION_ID
          );
      });

      it('fails to call `executeProposal()` if `EDITOR_PERMISSION_ID` is not granted for the admin address', async () => {
        await dao.revoke(
          personalAdminPlugin.address,
          alice.address,
          EDITOR_PERMISSION_ID
        );

        await expect(
          personalAdminPlugin.executeProposal(dummyMetadata, dummyActions, 0)
        )
          .to.be.revertedWithCustomError(personalAdminPlugin, 'DaoUnauthorized')
          .withArgs(
            dao.address,
            personalAdminPlugin.address,
            alice.address,
            EDITOR_PERMISSION_ID
          );
      });

      it('correctly emits the ProposalCreated event', async () => {
        const currentExpectedProposalId = 0;

        const allowFailureMap = 1;

        const tx = await personalAdminPlugin.executeProposal(
          dummyMetadata,
          dummyActions,
          allowFailureMap
        );

        await expect(tx).to.emit(personalAdminPlugin, 'ProposalCreated');

        const event = await findEvent<ProposalCreatedEvent>(
          tx,
          'ProposalCreated'
        );

        expect(event).to.be.ok;
        expect(event!.args.proposalId).to.equal(currentExpectedProposalId);
        expect(event!.args.creator).to.equal(alice.address);
        expect(event!.args.metadata).to.equal(dummyMetadata);
        expect(event!.args.actions.length).to.equal(1);
        expect(event!.args.actions[0].to).to.equal(dummyActions[0].to);
        expect(event!.args.actions[0].value).to.equal(dummyActions[0].value);
        expect(event!.args.actions[0].data).to.equal(dummyActions[0].data);
        expect(event!.args.allowFailureMap).to.equal(allowFailureMap);
      });

      it('correctly increments the proposal ID', async () => {
        const currentExpectedProposalId = 0;

        await personalAdminPlugin.executeProposal(
          dummyMetadata,
          dummyActions,
          0
        );

        const nextExpectedProposalId = currentExpectedProposalId + 1;

        const tx = await personalAdminPlugin.executeProposal(
          dummyMetadata,
          dummyActions,
          0
        );

        await expect(tx).to.emit(personalAdminPlugin, 'ProposalCreated');

        const event = await findEvent<ProposalCreatedEvent>(
          tx,
          'ProposalCreated'
        );

        expect(event).to.be.ok;
        expect(event!.args.proposalId).to.equal(nextExpectedProposalId);
      });

      it("calls the DAO's execute function correctly with proposalId", async () => {
        {
          const proposalId = 0;
          const allowFailureMap = 1;

          const tx = await personalAdminPlugin.executeProposal(
            dummyMetadata,
            dummyActions,
            allowFailureMap
          );

          const event = await findEventTopicLog<ExecutedEvent>(
            tx,
            DAO__factory.createInterface(),
            'Executed'
          );

          expect(event.args.actor).to.equal(personalAdminPlugin.address);
          expect(event.args.callId).to.equal(toBytes32(proposalId));
          expect(event.args.actions.length).to.equal(1);
          expect(event.args.actions[0].to).to.equal(dummyActions[0].to);
          expect(event.args.actions[0].value).to.equal(dummyActions[0].value);
          expect(event.args.actions[0].data).to.equal(dummyActions[0].data);
          // note that failureMap is different than allowFailureMap. See DAO.sol for details
          expect(event.args.failureMap).to.equal(0);
        }

        {
          const proposalId = 1;

          const tx = await personalAdminPlugin.executeProposal(
            dummyMetadata,
            dummyActions,
            0
          );

          const event = await findEventTopicLog<ExecutedEvent>(
            tx,
            DAO__factory.createInterface(),
            'Executed'
          );
          expect(event.args.callId).to.equal(toBytes32(proposalId));
        }
      });
    });
  });
});
