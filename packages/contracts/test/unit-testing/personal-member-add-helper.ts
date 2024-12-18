import {
  DAO,
  IDAO,
  IERC165Upgradeable__factory,
  IPlugin__factory,
  IProposal__factory,
  PersonalAdminPlugin,
  PersonalAdminPlugin__factory,
  PersonalMemberAddHelper,
  PersonalMemberAddHelper__factory,
  ExecuteSelectorCondition,
  ExecuteSelectorCondition__factory,
  TestCloneFactory__factory,
  TestCloneFactory,
} from '../../typechain';
import {
  ApprovedEvent,
  ProposalCreatedEvent,
} from '../../typechain/src/personal/PersonalMemberAddHelper';
import {findEvent} from '../../utils/helpers';
import {getInterfaceID} from '../../utils/interfaces';
import {deployTestDao} from '../helpers/test-dao';
import {
  ADDRESS_ONE,
  ADDRESS_TWO,
  ADDRESS_ZERO,
  EDITOR_PERMISSION_ID,
  EMPTY_DATA,
  EXECUTE_PERMISSION_ID,
  mineBlock,
  PROPOSER_PERMISSION_ID,
  ROOT_PERMISSION_ID,
  ADD_MEMBER_PERMISSION_ID,
  UPDATE_SETTINGS_PERMISSION_ID,
  ZERO_BYTES32,
} from './common';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {BigNumber} from 'ethers';
import {hexlify, toUtf8Bytes} from 'ethers/lib/utils';
import {ethers} from 'hardhat';

export type InitData = {contentUri: string};
export const defaultInitData: InitData = {
  contentUri: 'ipfs://',
};

export const memberAddInterface = new ethers.utils.Interface([
  'function initialize(address,tuple(uint64))',
  'function updateSettings(tuple(uint64))',
  'function proposeAddMember(bytes,address,address)',
  'function getProposal(uint256)',
]);
const personalAdminPluginInterface =
  PersonalAdminPlugin__factory.createInterface();

describe('Personal Member Add Plugin', function () {
  let signers: SignerWithAddress[];
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let dao: DAO;
  let personalMemberAddHelper: PersonalMemberAddHelper;
  let executeSelectorCondition: ExecuteSelectorCondition;
  let personalAdminPlugin: PersonalAdminPlugin;
  let testCloneFactory: TestCloneFactory;
  let pid: BigNumber;

  before(async () => {
    signers = await ethers.getSigners();
    [alice, bob, carol, dave] = signers;
    dao = await deployTestDao(alice);

    const TestCloneFactory = new TestCloneFactory__factory(alice);
    testCloneFactory = await TestCloneFactory.deploy();
  });

  beforeEach(async () => {
    // Personal admin (plugin)
    const PersonalAdminPluginFactory = new PersonalAdminPlugin__factory(alice);
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

    // Personal member add (helper)
    const PersonalMemberAddFactory = new PersonalMemberAddHelper__factory(
      alice
    );
    const anticipatedHelperAddress = ethers.utils.getContractAddress({
      from: testCloneFactory.address,
      nonce: nonce + 1,
    });
    await testCloneFactory.clonePersonalMemberAddHelper();
    personalMemberAddHelper = PersonalMemberAddFactory.attach(
      anticipatedHelperAddress
    );

    await initializePAP(anticipatedHelperAddress);
    await initializePMAH();

    executeSelectorCondition = await new ExecuteSelectorCondition__factory(
      alice
    ).deploy(
      personalAdminPlugin.address,
      personalAdminPluginInterface.getSighash('addMember')
    );

    // The helper can execute on the DAO
    await dao.grantWithCondition(
      dao.address,
      personalMemberAddHelper.address,
      EXECUTE_PERMISSION_ID,
      executeSelectorCondition.address
    );
    // The plugin can also execute on the DAO
    await dao.grant(
      dao.address,
      personalAdminPlugin.address,
      EXECUTE_PERMISSION_ID
    );
    // The DAO can manage editors on the standard governance plugin
    await dao.grant(
      personalAdminPlugin.address,
      dao.address,
      ADD_MEMBER_PERMISSION_ID
    );
    // The DAO can update the plugin settings
    await dao.grant(
      personalMemberAddHelper.address,
      dao.address,
      UPDATE_SETTINGS_PERMISSION_ID
    );
    // The DAO is ROOT on itself
    await dao.grant(dao.address, dao.address, ROOT_PERMISSION_ID);
    // The plugin can propose members on the helper
    await dao.grant(
      personalMemberAddHelper.address,
      personalAdminPlugin.address,
      PROPOSER_PERMISSION_ID
    );
    // Alice can make the DAO execute arbitrary stuff (test)
    await dao.grant(dao.address, alice.address, EXECUTE_PERMISSION_ID);

    // Alice is an editor
    await dao.grant(
      personalAdminPlugin.address,
      alice.address,
      EDITOR_PERMISSION_ID
    );

    // Bob is a member
    await mineBlock();
    await personalAdminPlugin.proposeAddMember('0x', bob.address);
  });

  function initializePAP(helperAddr: string) {
    return personalAdminPlugin.initialize(
      dao.address,
      alice.address, // this just emits an event, not granting the permission here
      helperAddr
    );
  }

  function initializePMAH() {
    return personalMemberAddHelper.initialize(dao.address, {
      proposalDuration: 60 * 60 * 24 * 5,
    });
  }

  describe('initialize', () => {
    it('reverts if trying to re-initialize', async () => {
      await expect(
        personalMemberAddHelper.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
        })
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });
  });

  describe('Before approving', () => {
    it('Only addresses with PROPOSER_PERMISSION_ID can propose members', async () => {
      // ok
      await expect(
        personalAdminPlugin.proposeAddMember(
          toUtf8Bytes('ipfs://'),
          carol.address
        )
      ).to.not.be.reverted;

      await dao.revoke(
        personalMemberAddHelper.address,
        personalAdminPlugin.address,
        PROPOSER_PERMISSION_ID
      );

      // Now it fails
      await expect(
        personalAdminPlugin.proposeAddMember(
          toUtf8Bytes('ipfs://'),
          dave.address
        )
      ).to.be.reverted;
    });

    it('Only callers implementing the right interface can propose members', async () => {
      // From a compatible plugin
      await expect(
        personalAdminPlugin.proposeAddMember(
          toUtf8Bytes('ipfs://'),
          carol.address
        )
      ).to.not.be.reverted;

      await dao.grant(
        personalMemberAddHelper.address,
        alice.address,
        PROPOSER_PERMISSION_ID
      );

      // Fail despite the permission
      await expect(
        personalMemberAddHelper.proposeAddMember(
          toUtf8Bytes('ipfs://'),
          dave.address,
          alice.address
        )
      ).to.be.reverted;
    });

    it('Allows any address to request membership via the PersonalAdminPlugin', async () => {
      // Random
      expect(await personalAdminPlugin.isMember(carol.address)).to.be.false;
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(carol)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      let proposal = await personalMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.actions.length).to.eq(1);
      expect(proposal.failsafeActionMap).to.eq(0);
      expect(await personalAdminPlugin.isMember(carol.address)).to.eq(false);

      // Member
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(bob)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), ADDRESS_ONE)
      ).to.not.be.reverted;

      proposal = await personalMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.actions.length).to.eq(1);
      expect(proposal.failsafeActionMap).to.eq(0);
      expect(await personalAdminPlugin.isMember(ADDRESS_ONE)).to.eq(false);

      // Editor
      expect(await personalAdminPlugin.isMember(ADDRESS_TWO)).to.eq(false);
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(alice)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), ADDRESS_TWO)
      ).to.not.be.reverted;
      expect(await personalAdminPlugin.isMember(ADDRESS_TWO)).to.eq(true);

      proposal = await personalMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(true);
      expect(proposal.actions.length).to.eq(1);
      expect(proposal.failsafeActionMap).to.eq(0);
      // Auto executed
      expect(await personalAdminPlugin.isMember(ADDRESS_TWO)).to.eq(true);
    });

    it('Editors should be members too', async () => {
      expect(await personalAdminPlugin.isMember(alice.address)).to.eq(true);

      expect(await personalAdminPlugin.isMember(bob.address)).to.eq(true);
      await makeEditor(bob.address);
      expect(await personalAdminPlugin.isMember(bob.address)).to.eq(true);
    });

    it('Emits an event when membership is requested', async () => {
      pid = await personalMemberAddHelper.proposalCount();

      const tx = await personalAdminPlugin
        .connect(carol)
        .proposeAddMember(toUtf8Bytes('ipfs://2345'), carol.address);

      await expect(tx).to.emit(personalMemberAddHelper, 'ProposalCreated');

      const event = await findEvent<ProposalCreatedEvent>(
        tx,
        'ProposalCreated'
      );

      expect(!!event).to.eq(true);
      expect(event!.args.proposalId).to.equal(pid);
      expect(event!.args.creator).to.equal(carol.address);
      expect(event!.args.metadata).to.equal(
        hexlify(toUtf8Bytes('ipfs://2345'))
      );
      expect(event!.args.actions.length).to.equal(1);
      expect(event!.args.actions[0].to).to.equal(personalAdminPlugin.address);
      expect(event!.args.actions[0].value).to.equal(0);
      expect(event!.args.actions[0].data).to.equal(
        personalAdminPluginInterface.encodeFunctionData('addMember', [
          carol.address,
        ])
      );
      expect(event!.args.allowFailureMap).to.equal(0);
    });

    it('isMember() returns true when appropriate', async () => {
      expect(await personalAdminPlugin.isMember(ADDRESS_ZERO)).to.eq(false);
      expect(await personalAdminPlugin.isMember(ADDRESS_ONE)).to.eq(false);
      expect(await personalAdminPlugin.isMember(ADDRESS_TWO)).to.eq(false);

      expect(await personalAdminPlugin.isMember(alice.address)).to.eq(true);
      expect(await personalAdminPlugin.isMember(bob.address)).to.eq(true);
      expect(await personalAdminPlugin.isMember(carol.address)).to.eq(false);

      await makeMember(carol.address);
      expect(await personalAdminPlugin.isMember(carol.address)).to.eq(true);

      await pullMember(carol.address);
      expect(await personalAdminPlugin.isMember(carol.address)).to.eq(false);

      await makeEditor(carol.address);
      expect(await personalAdminPlugin.isMember(carol.address)).to.eq(true);

      await pullEditor(carol.address);
      expect(await personalAdminPlugin.isMember(carol.address)).to.eq(false);
    });

    it('isEditor() returns true when appropriate', async () => {
      expect(await personalAdminPlugin.isEditor(ADDRESS_ZERO)).to.eq(false);
      expect(await personalAdminPlugin.isEditor(ADDRESS_ONE)).to.eq(false);
      expect(await personalAdminPlugin.isEditor(ADDRESS_TWO)).to.eq(false);

      expect(await personalAdminPlugin.isEditor(alice.address)).to.eq(true);
      expect(await personalAdminPlugin.isEditor(bob.address)).to.eq(false);
      expect(await personalAdminPlugin.isEditor(carol.address)).to.eq(false);

      await makeEditor(carol.address);
      expect(await personalAdminPlugin.isEditor(carol.address)).to.eq(true);

      await pullEditor(carol.address);
      expect(await personalAdminPlugin.isEditor(carol.address)).to.eq(false);
    });
  });

  describe('Membership approval', () => {
    // Alice: editor
    // Bob: editor
    // Carol: editor

    beforeEach(async () => {
      await makeEditor(bob.address);
      await makeEditor(carol.address);
    });

    it('Only editors can approve adding members', async () => {
      // Requesting membership for Dave
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(false);
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(false);

      // Dave cannot approve (fail)
      await expect(personalMemberAddHelper.connect(dave).approve(pid)).to.be
        .reverted;

      // Dave is still not a member
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(false);

      // Approve it (Alice)
      await expect(personalMemberAddHelper.connect(alice).approve(pid)).to.not
        .be.reverted;

      // Dave is now a member
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(true);

      // Now requesting for 0x1
      expect(await personalAdminPlugin.isMember(ADDRESS_ONE)).to.eq(false);
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), ADDRESS_ONE)
      ).to.not.be.reverted;
      expect(await personalAdminPlugin.isMember(ADDRESS_ONE)).to.eq(false);

      // Dave cannot approve (fail)
      await expect(personalMemberAddHelper.connect(dave).approve(pid)).to.be
        .reverted;

      // ADDRESS_ONE is still not a member
      expect(await personalAdminPlugin.isMember(ADDRESS_ONE)).to.eq(false);

      // Approve it (Bob)
      await expect(personalMemberAddHelper.connect(bob).approve(pid)).to.not.be
        .reverted;

      // ADDRESS_ONE is now a member
      expect(await personalAdminPlugin.isMember(ADDRESS_ONE)).to.eq(true);

      // Now requesting for 0x2
      expect(await personalAdminPlugin.isMember(ADDRESS_TWO)).to.eq(false);
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), ADDRESS_TWO)
      ).to.not.be.reverted;
      expect(await personalAdminPlugin.isMember(ADDRESS_TWO)).to.eq(false);

      // Dave cannot approve (fail)
      await expect(personalMemberAddHelper.connect(dave).approve(pid)).to.be
        .reverted;

      // ADDRESS_TWO is still not a member
      expect(await personalAdminPlugin.isMember(ADDRESS_TWO)).to.eq(false);

      // Approve it (Carol)
      await expect(personalMemberAddHelper.connect(carol).approve(pid)).to.not
        .be.reverted;

      // ADDRESS_TWO is now a member
      expect(await personalAdminPlugin.isMember(ADDRESS_TWO)).to.eq(true);
    });

    it('Proposals should be unsettled when created by a non-editor', async () => {
      // Proposed by a random wallet
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;

      let proposal = await personalMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(false);

      await makeMember(dave.address);

      // Proposed by a (now) member
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), ADDRESS_ONE)
      ).to.not.be.reverted;

      expect((await personalMemberAddHelper.getProposal(pid)).executed).to.eq(
        false
      );
      expect(await personalAdminPlugin.isMember(ADDRESS_ONE)).to.eq(false);

      // Proposed by an editor
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(alice)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), ADDRESS_TWO)
      ).to.not.be.reverted;

      proposal = await personalMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(true);
      expect(await personalAdminPlugin.isMember(ADDRESS_TWO)).to.eq(true);
    });

    it('Only editors can reject new membership proposals', async () => {
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(false);

      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;

      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(false);

      // Reject it (Dave) => fail
      await expect(personalMemberAddHelper.connect(dave).reject(pid)).to.be
        .reverted;

      // Still not a member
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(false);

      // Reject it (Bob) => success
      await expect(personalMemberAddHelper.connect(bob).reject(pid)).to.not.be
        .reverted;

      // Still not a member
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(false);

      // Try to approve it (bob) => fail
      await expect(personalMemberAddHelper.connect(bob).approve(pid)).to.be
        .reverted;

      expect((await personalMemberAddHelper.getProposal(pid)).executed).to.eq(
        false
      );
    });

    it("Proposals created by a non-editor need an editor's approval", async () => {
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(false);

      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;

      const proposal = await personalMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(false);

      // Dave cannot
      await expect(personalMemberAddHelper.connect(dave).approve(pid)).to.be
        .reverted;
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(false);

      // Alice can
      await expect(personalMemberAddHelper.connect(alice).approve(pid)).to.not
        .be.reverted;
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(true);
    });

    it('Proposals created by an editor are automatically executed', async () => {
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(false);

      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(alice)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;

      const proposal = await personalMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(true);
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(true);
    });

    it('Approvals are immediately executed', async () => {
      // Dave proposes himself
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;

      let proposal = await personalMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);

      // Approve it (Dave) => fail
      await expect(personalMemberAddHelper.connect(dave).approve(pid)).to.be
        .reverted;

      proposal = await personalMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);

      // Approve it (Alice) => succeed
      await expect(personalMemberAddHelper.connect(alice).approve(pid)).to.not
        .be.reverted;

      proposal = await personalMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(true);

      // Now Dave is a member
      expect(await personalAdminPlugin.isMember(dave.address)).to.eq(true);
    });
  });

  describe('Proposal data', () => {
    // Alice: editor
    // Bob: member

    it('proposeAddMember should generate the right action list', async () => {
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(carol)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      const proposal = await personalMemberAddHelper.getProposal(pid);
      expect(proposal.actions.length).to.eq(1);
      expect(proposal.actions[0].to).to.eq(personalAdminPlugin.address);
      expect(proposal.actions[0].value).to.eq(0);
      expect(proposal.actions[0].data).to.eq(
        personalAdminPluginInterface.encodeFunctionData('addMember', [
          carol.address,
        ])
      );
    });

    it('Proposing an existing member fails', async () => {
      // Alice is an editor but not specifically a member
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), alice.address)
      ).to.not.be.reverted;

      // Alice is technically a member now
      await makeMember(alice.address);
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), alice.address)
      )
        .to.be.revertedWithCustomError(personalAdminPlugin, 'AlreadyAMember')
        .withArgs(alice.address);

      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), bob.address)
      )
        .to.be.revertedWithCustomError(personalAdminPlugin, 'AlreadyAMember')
        .withArgs(bob.address);

      // More times
      await expect(
        personalAdminPlugin
          .connect(carol)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), alice.address)
      ).to.be.reverted;

      await expect(
        personalAdminPlugin
          .connect(bob)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), alice.address)
      ).to.be.reverted;

      await expect(
        personalAdminPlugin
          .connect(alice)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), alice.address)
      ).to.be.reverted;
    });

    it('Attempting to approve twice fails', async () => {
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      await expect(personalMemberAddHelper.approve(pid)).to.not.be.reverted;
      await expect(personalMemberAddHelper.approve(pid)).to.be.reverted;
    });

    it('Attempting to reject twice fails', async () => {
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      await expect(personalMemberAddHelper.reject(pid)).to.not.be.reverted;
      await expect(personalMemberAddHelper.reject(pid)).to.be.reverted;
    });

    it('Rejected proposals cannot be approved', async () => {
      pid = await personalMemberAddHelper.proposalCount();
      await expect(
        personalAdminPlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      await expect(personalMemberAddHelper.reject(pid)).to.not.be.reverted;
      await expect(personalMemberAddHelper.approve(pid)).to.be.reverted;
    });

    it('Only the DAO can call the plugin to update the settings', async () => {
      // Nobody else can
      await expect(
        personalMemberAddHelper.connect(alice).updateSettings({
          proposalDuration: 60 * 60 * 24 * 5,
        })
      ).to.be.reverted;
      await expect(
        personalMemberAddHelper.connect(bob).updateSettings({
          proposalDuration: 60 * 60 * 24 * 5,
        })
      ).to.be.reverted;
      await expect(
        personalMemberAddHelper.connect(carol).updateSettings({
          proposalDuration: 60 * 60 * 24 * 5,
        })
      ).to.be.reverted;
      await expect(
        personalMemberAddHelper.connect(dave).updateSettings({
          proposalDuration: 60 * 60 * 24 * 5,
        })
      ).to.be.reverted;

      // The DAO can
      const actions: IDAO.ActionStruct[] = [
        {
          to: personalMemberAddHelper.address,
          value: 0,
          data: PersonalMemberAddHelper__factory.createInterface().encodeFunctionData(
            'updateSettings',
            [
              {
                proposalDuration: 60 * 60 * 24 * 5,
              },
            ]
          ),
        },
      ];

      await expect(dao.execute(ZERO_BYTES32, actions, 0)).to.not.be.reverted;
    });
  });

  describe('Other tests', () => {
    describe('initialize', () => {
      it('should emit `SettingsUpdated` during initialization', async () => {
        const nonce = await ethers.provider.getTransactionCount(
          testCloneFactory.address
        );
        const PersonalMemberAddFactory = new PersonalMemberAddHelper__factory(
          alice
        );
        const anticipatedHelperAddress = ethers.utils.getContractAddress({
          from: testCloneFactory.address,
          nonce,
        });
        await testCloneFactory.clonePersonalMemberAddHelper();
        personalMemberAddHelper = PersonalMemberAddFactory.attach(
          anticipatedHelperAddress
        );
        const settings: PersonalMemberAddHelper.SettingsStruct = {
          proposalDuration: 60 * 60 * 24 * 5,
        };

        await expect(personalMemberAddHelper.initialize(dao.address, settings))
          .to.emit(personalMemberAddHelper, 'SettingsUpdated')
          .withArgs(60 * 60 * 24 * 5);
      });
    });

    describe('plugin interface: ', () => {
      it('does not support the empty interface', async () => {
        expect(await personalMemberAddHelper.supportsInterface('0xffffffff')).to
          .be.false;
      });

      it('supports the `IERC165Upgradeable` interface', async () => {
        const iface = IERC165Upgradeable__factory.createInterface();
        expect(
          await personalMemberAddHelper.supportsInterface(getInterfaceID(iface))
        ).to.be.true;
      });

      it('supports the `IPlugin` interface', async () => {
        const iface = IPlugin__factory.createInterface();
        expect(
          await personalMemberAddHelper.supportsInterface(getInterfaceID(iface))
        ).to.be.true;
      });

      it('supports the `IProposal` interface', async () => {
        const iface = IProposal__factory.createInterface();
        expect(
          await personalMemberAddHelper.supportsInterface(getInterfaceID(iface))
        ).to.be.true;
      });
    });

    describe('updateSettings:', () => {
      it('should emit `SettingsUpdated` when `updateMutlsigSettings` gets called', async () => {
        await dao.grant(
          personalMemberAddHelper.address,
          alice.address,
          await personalMemberAddHelper.UPDATE_SETTINGS_PERMISSION_ID()
        );
        const settings = {
          proposalDuration: 60 * 60 * 24 * 5,
        };

        await expect(personalMemberAddHelper.updateSettings(settings))
          .to.emit(personalMemberAddHelper, 'SettingsUpdated')
          .withArgs(60 * 60 * 24 * 5);
      });
    });

    describe('createProposal:', () => {
      it('increments the proposal counter', async () => {
        const pc = await personalMemberAddHelper.proposalCount();

        await expect(
          personalAdminPlugin.proposeAddMember(EMPTY_DATA, carol.address)
        ).not.to.be.reverted;

        expect(await personalMemberAddHelper.proposalCount()).to.equal(
          pc.add(1)
        );
      });

      it('creates unique proposal IDs for each proposal', async () => {
        const proposalId0 =
          await personalAdminPlugin.callStatic.proposeAddMember(
            EMPTY_DATA,
            carol.address
          );
        // create a new proposal for the proposalCounter to be incremented
        await expect(
          personalAdminPlugin.proposeAddMember(EMPTY_DATA, carol.address)
        ).not.to.be.reverted;

        const proposalId1 =
          await personalAdminPlugin.callStatic.proposeAddMember(
            EMPTY_DATA,
            dave.address
          );

        expect(proposalId0).to.equal(1);
        expect(proposalId1).to.equal(2);

        expect(proposalId0).to.not.equal(proposalId1);
      });

      it('emits the `ProposalCreated` event', async () => {
        await expect(
          personalAdminPlugin.proposeAddMember(EMPTY_DATA, carol.address)
        ).to.emit(personalMemberAddHelper, 'ProposalCreated');
      });

      it('reverts if the settings have been changed in the same block', async () => {
        await dao.grant(
          personalMemberAddHelper.address,
          dao.address,
          await personalMemberAddHelper.UPDATE_SETTINGS_PERMISSION_ID()
        );

        await ethers.provider.send('evm_setAutomine', [false]);

        await dao.execute(
          ZERO_BYTES32,
          [
            {
              to: personalMemberAddHelper.address,
              value: 0,
              data: personalMemberAddHelper.interface.encodeFunctionData(
                'updateSettings',
                [
                  {
                    proposalDuration: 60 * 60 * 24 * 5,
                  },
                ]
              ),
            },
          ],
          0
        );
        await expect(
          personalAdminPlugin.proposeAddMember(EMPTY_DATA, carol.address)
        ).to.revertedWithCustomError(
          personalMemberAddHelper,
          'ProposalCreationForbiddenOnSameBlock'
        );

        await ethers.provider.send('evm_setAutomine', [true]);
      });
    });

    describe('canApprove:', () => {
      beforeEach(async () => {
        await makeEditor(bob.address); // have 2 editors
        await mineBlock();

        expect(await personalAdminPlugin.isEditor(alice.address)).to.be.true;
        expect(await personalAdminPlugin.isEditor(bob.address)).to.be.true;
        expect(await personalAdminPlugin.isEditor(carol.address)).to.be.false;

        // Alice approves
        pid = await personalMemberAddHelper.proposalCount();
        await personalAdminPlugin
          .connect(carol)
          .proposeAddMember(EMPTY_DATA, carol.address);
      });

      it('returns `false` if the proposal is already executed', async () => {
        expect((await personalMemberAddHelper.getProposal(pid)).executed).to.be
          .false;
        await personalMemberAddHelper.connect(bob).approve(pid);

        expect((await personalMemberAddHelper.getProposal(pid)).executed).to.be
          .true;
        expect(await personalMemberAddHelper.canApprove(pid, bob.address)).to.be
          .false;
      });

      it('returns `false` if the approver is not an editor', async () => {
        // Non editors
        await Promise.all(
          [carol, dave, signers[4], signers[5]].map(async wallet => {
            expect(await personalAdminPlugin.isEditor(wallet.address)).to.be
              .false;
            expect(
              await personalMemberAddHelper.canApprove(pid, wallet.address)
            ).to.be.false;
          })
        );
      });

      it('returns `true` if the approver is an editor', async () => {
        // Editors
        await Promise.all(
          [alice, bob].map(async wallet => {
            expect(await personalAdminPlugin.isEditor(wallet.address)).to.be
              .true;
            expect(
              await personalMemberAddHelper.canApprove(pid, wallet.address)
            ).to.be.true;
          })
        );
      });

      it('returns `false` if already approved', async () => {
        expect(await personalMemberAddHelper.canApprove(pid, bob.address)).to.be
          .true;
        await personalMemberAddHelper.connect(bob).approve(pid);
        expect(await personalMemberAddHelper.canApprove(pid, bob.address)).to.be
          .false;
      });
    });

    describe('approve:', () => {
      beforeEach(async () => {
        await makeEditor(bob.address); // have 2 editors
        await mineBlock();

        // Alice approves
        pid = await personalMemberAddHelper.proposalCount();
        await personalAdminPlugin
          .connect(carol)
          .proposeAddMember(EMPTY_DATA, carol.address);
      });

      it('reverts when approving multiple times', async () => {
        await personalMemberAddHelper.connect(bob).approve(pid);

        // Try to vote again
        await expect(personalMemberAddHelper.connect(bob).approve(pid))
          .to.be.revertedWithCustomError(
            personalMemberAddHelper,
            'ApprovalCastForbidden'
          )
          .withArgs(pid, bob.address);
      });

      it('approves with the msg.sender address', async () => {
        const tx = await personalMemberAddHelper.connect(bob).approve(pid);

        const event = await findEvent<ApprovedEvent>(tx, 'Approved');
        expect(event!.args.proposalId).to.eq(pid);
        expect(event!.args.editor).to.eq(bob.address);
      });
    });
  });

  // Helpers

  function makeMember(account: string) {
    return personalAdminPlugin
      .connect(alice)
      .proposeAddMember('0x', account)
      .then(tx => tx.wait());
  }
  function pullMember(account: string) {
    return personalAdminPlugin
      .connect(alice)
      .submitRemoveMember(account)
      .then(tx => tx.wait());
  }
  function makeEditor(newEditor: string) {
    return dao
      .connect(alice)
      .grant(personalAdminPlugin.address, newEditor, EDITOR_PERMISSION_ID)
      .then(tx => tx.wait());
  }
  function pullEditor(editor: string) {
    return dao
      .connect(alice)
      .revoke(personalAdminPlugin.address, editor, EDITOR_PERMISSION_ID)
      .then(tx => tx.wait());
  }
});
