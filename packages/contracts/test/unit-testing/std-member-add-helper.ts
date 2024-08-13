import {
  DAO,
  IDAO,
  IERC165Upgradeable__factory,
  IMultisig__factory,
  IPlugin__factory,
  IProposal__factory,
  StdGovernancePlugin,
  StdGovernancePlugin__factory,
  StdMemberAddHelper,
  StdMemberAddHelper__factory,
  ExecuteSelectorCondition,
  ExecuteSelectorCondition__factory,
  SpacePlugin,
  SpacePlugin__factory,
} from '../../typechain';
import {
  ApprovedEvent,
  ProposalCreatedEvent,
} from '../../typechain/src/standard/StdMemberAddHelper';
import {deployWithProxy, findEvent} from '../../utils/helpers';
import {getInterfaceID} from '../../utils/interfaces';
import {deployTestDao} from '../helpers/test-dao';
import {
  ADDRESS_ONE,
  ADDRESS_TWO,
  ADDRESS_ZERO,
  EMPTY_DATA,
  EXECUTE_PERMISSION_ID,
  mineBlock,
  PROPOSER_PERMISSION_ID,
  ROOT_PERMISSION_ID,
  UPDATE_ADDRESSES_PERMISSION_ID,
  UPDATE_MULTISIG_SETTINGS_PERMISSION_ID,
  UPGRADE_PLUGIN_PERMISSION_ID,
  VoteOption,
  ZERO_BYTES32,
} from './common';
import {defaultStdGovernanceSettings} from './common';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {BigNumber} from 'ethers';
import {hexlify, toUtf8Bytes} from 'ethers/lib/utils';
import {ethers} from 'hardhat';

export type InitData = {contentUri: string};
export const defaultInitData: InitData = {
  contentUri: 'ipfs://',
};

export const multisigInterface = new ethers.utils.Interface([
  'function initialize(address,tuple(uint64))',
  'function updateMultisigSettings(tuple(uint64))',
  'function proposeAddMember(bytes,address,address)',
  'function getProposal(uint256)',
]);
const stdGovernancePluginInterface =
  StdGovernancePlugin__factory.createInterface();

describe('Member Add Plugin', function () {
  let signers: SignerWithAddress[];
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dave: SignerWithAddress;
  let dao: DAO;
  let stdMemberAddHelper: StdMemberAddHelper;
  let executeSelectorCondition: ExecuteSelectorCondition;
  let stdGovernancePlugin: StdGovernancePlugin;
  let spacePlugin: SpacePlugin;
  let defaultInput: InitData;
  let pid: BigNumber;

  before(async () => {
    signers = await ethers.getSigners();
    [alice, bob, carol, dave] = signers;
    dao = await deployTestDao(alice);

    defaultInput = {contentUri: 'ipfs://'};
  });

  beforeEach(async () => {
    stdMemberAddHelper = await deployWithProxy<StdMemberAddHelper>(
      new StdMemberAddHelper__factory(alice)
    );
    stdGovernancePlugin = await deployWithProxy<StdGovernancePlugin>(
      new StdGovernancePlugin__factory(alice)
    );
    spacePlugin = await deployWithProxy<SpacePlugin>(
      new SpacePlugin__factory(alice)
    );

    executeSelectorCondition = await new ExecuteSelectorCondition__factory(
      alice
    ).deploy(
      stdGovernancePlugin.address,
      stdGovernancePluginInterface.getSighash('addMember')
    );

    // inits
    await stdMemberAddHelper.initialize(dao.address, {
      proposalDuration: 60 * 60 * 24 * 5,
    });
    await stdGovernancePlugin.initialize(
      dao.address,
      defaultStdGovernanceSettings,
      [alice.address],
      stdMemberAddHelper.address
    );
    await spacePlugin.initialize(
      dao.address,
      defaultInput.contentUri,
      ADDRESS_ZERO
    );

    // The plugin can execute on the DAO
    await dao.grantWithCondition(
      dao.address,
      stdMemberAddHelper.address,
      EXECUTE_PERMISSION_ID,
      executeSelectorCondition.address
    );
    // The standard governance plugin can also execute on the DAO
    await dao.grant(
      dao.address,
      stdGovernancePlugin.address,
      EXECUTE_PERMISSION_ID
    );
    // The DAO can report new/removed editors to the standard governance plugin
    await dao.grant(
      stdGovernancePlugin.address,
      dao.address,
      UPDATE_ADDRESSES_PERMISSION_ID
    );
    // The DAO can update the plugin settings
    await dao.grant(
      stdMemberAddHelper.address,
      dao.address,
      UPDATE_MULTISIG_SETTINGS_PERMISSION_ID
    );
    // The DAO can upgrade the plugin
    await dao.grant(
      stdMemberAddHelper.address,
      dao.address,
      UPGRADE_PLUGIN_PERMISSION_ID
    );
    // The DAO is ROOT on itself
    await dao.grant(dao.address, dao.address, ROOT_PERMISSION_ID);
    // The plugin can propose members on the member add helper
    await dao.grant(
      stdMemberAddHelper.address,
      stdGovernancePlugin.address,
      PROPOSER_PERMISSION_ID
    );
    // Alice can make the DAO execute arbitrary stuff (test)
    await dao.grant(dao.address, alice.address, EXECUTE_PERMISSION_ID);

    // Alice is an editor (see stdGovernancePlugin initialize)

    // Bob is a member
    await mineBlock();
    await stdGovernancePlugin.proposeAddMember('0x', bob.address);
  });

  describe('initialize', () => {
    it('reverts if trying to re-initialize', async () => {
      await expect(
        stdMemberAddHelper.initialize(dao.address, {
          proposalDuration: 60 * 60 * 24 * 5,
        })
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });
  });

  describe('Before approving', () => {
    it('Only addresses with PROPOSER_PERMISSION_ID can propose members', async () => {
      // ok
      await expect(
        stdGovernancePlugin.proposeAddMember(
          toUtf8Bytes('ipfs://'),
          carol.address
        )
      ).to.not.be.reverted;

      await dao.revoke(
        stdMemberAddHelper.address,
        stdGovernancePlugin.address,
        PROPOSER_PERMISSION_ID
      );

      // Now it fails
      await expect(
        stdGovernancePlugin.proposeAddMember(
          toUtf8Bytes('ipfs://'),
          dave.address
        )
      ).to.be.reverted;
    });

    it('Only callers implementing multisig can propose members', async () => {
      // From a compatible plugin
      await expect(
        stdGovernancePlugin.proposeAddMember(
          toUtf8Bytes('ipfs://'),
          carol.address
        )
      ).to.not.be.reverted;

      await dao.grant(
        stdMemberAddHelper.address,
        alice.address,
        PROPOSER_PERMISSION_ID
      );

      // Fail despite the permission
      await expect(
        stdMemberAddHelper.proposeAddMember(
          toUtf8Bytes('ipfs://'),
          dave.address,
          alice.address
        )
      ).to.be.reverted;
    });

    it('Allows any address to request membership via the StdGovernancePlugin', async () => {
      // Random
      expect(await stdGovernancePlugin.isMember(carol.address)).to.be.false;
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(carol)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      let proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.approvals).to.eq(0);
      expect(proposal.parameters.minApprovals).to.eq(1);
      expect(proposal.actions.length).to.eq(1);
      expect(proposal.failsafeActionMap).to.eq(0);
      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(false);

      // Member
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(bob)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), ADDRESS_ONE)
      ).to.not.be.reverted;

      proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.approvals).to.eq(0);
      expect(proposal.parameters.minApprovals).to.eq(1);
      expect(proposal.actions.length).to.eq(1);
      expect(proposal.failsafeActionMap).to.eq(0);
      expect(await stdGovernancePlugin.isMember(ADDRESS_ONE)).to.eq(false);

      // Editor
      pid = await stdMemberAddHelper.proposalCount();
      expect(await stdGovernancePlugin.isMember(ADDRESS_TWO)).to.eq(false);
      await expect(
        stdGovernancePlugin
          .connect(alice)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), ADDRESS_TWO)
      ).to.not.be.reverted;
      expect(await stdGovernancePlugin.isMember(ADDRESS_TWO)).to.eq(true);

      proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(true);
      expect(proposal.approvals).to.eq(1);
      expect(proposal.parameters.minApprovals).to.eq(1);
      expect(proposal.actions.length).to.eq(1);
      expect(proposal.failsafeActionMap).to.eq(0);
      // Auto executed
      expect(await stdGovernancePlugin.isMember(ADDRESS_TWO)).to.eq(true);
    });

    it('Editors should be members too', async () => {
      expect(await stdGovernancePlugin.isMember(alice.address)).to.eq(true);

      expect(await stdGovernancePlugin.isMember(bob.address)).to.eq(true);
      await stdGovernancePlugin.proposeAddEditor('0x', bob.address);
      expect(await stdGovernancePlugin.isMember(bob.address)).to.eq(true);
    });

    it('Emits an event when membership is requested', async () => {
      pid = await stdMemberAddHelper.proposalCount();

      const tx = await stdGovernancePlugin
        .connect(carol)
        .proposeAddMember(toUtf8Bytes('ipfs://2345'), carol.address);

      await expect(tx).to.emit(stdMemberAddHelper, 'ProposalCreated');

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
      expect(event!.args.actions[0].to).to.equal(stdGovernancePlugin.address);
      expect(event!.args.actions[0].value).to.equal(0);
      expect(event!.args.actions[0].data).to.equal(
        stdGovernancePluginInterface.encodeFunctionData('addMember', [
          carol.address,
        ])
      );
      expect(event!.args.allowFailureMap).to.equal(0);
    });

    it('isMember() returns true when appropriate', async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(1);

      expect(await stdGovernancePlugin.isMember(ADDRESS_ZERO)).to.eq(false);
      expect(await stdGovernancePlugin.isMember(ADDRESS_ONE)).to.eq(false);
      expect(await stdGovernancePlugin.isMember(ADDRESS_TWO)).to.eq(false);

      expect(await stdGovernancePlugin.isMember(alice.address)).to.eq(true);
      expect(await stdGovernancePlugin.isMember(bob.address)).to.eq(true);
      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(false);

      await stdGovernancePlugin.proposeAddMember('0x', carol.address);
      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(true);

      await stdGovernancePlugin.proposeRemoveMember('0x', carol.address);
      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(false);

      await proposeNewEditor(carol.address);

      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(true);
    });

    it('isEditor() returns true when appropriate', async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(1);

      expect(await stdGovernancePlugin.isEditor(ADDRESS_ZERO)).to.eq(false);
      expect(await stdGovernancePlugin.isEditor(ADDRESS_ONE)).to.eq(false);
      expect(await stdGovernancePlugin.isEditor(ADDRESS_TWO)).to.eq(false);

      expect(await stdGovernancePlugin.isEditor(alice.address)).to.eq(true);
      expect(await stdGovernancePlugin.isEditor(bob.address)).to.eq(false);
      expect(await stdGovernancePlugin.isEditor(carol.address)).to.eq(false);

      await proposeNewEditor(carol.address);

      expect(await stdGovernancePlugin.isEditor(carol.address)).to.eq(true);
    });
  });

  describe('One editor case', () => {
    it('Only the editor can approve memberships', async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(1);

      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(carol)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(false);

      // Approve it (Bob) => fail
      await expect(stdMemberAddHelper.connect(bob).approve(pid)).to.be.reverted;

      // Still not a member
      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(false);

      // Approve it (Alice) => success
      await expect(stdMemberAddHelper.connect(alice).approve(pid)).to.not.be
        .reverted;

      // Now Carol is a member
      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(true);
    });

    it('Only the editor can reject memberships', async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(1);

      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(false);

      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(carol)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(false);

      // Reject it (Bob) => fail
      await expect(stdMemberAddHelper.connect(bob).reject(pid)).to.be.reverted;

      // Still not a member
      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(false);

      // Reject it (Alice) => success
      await expect(stdMemberAddHelper.connect(alice).reject(pid)).to.not.be
        .reverted;

      // Carol is not a member
      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(false);

      // Try to approve it (Alice) => fail
      await expect(stdMemberAddHelper.connect(alice).approve(pid)).to.be
        .reverted;
    });

    it('Membership approvals are immediate', async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(1);

      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(carol)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      // Approve it (Alice) => success
      await expect(stdMemberAddHelper.connect(alice).approve(pid)).to.not.be
        .reverted;

      const proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(true);

      // Approve it (Alice) => fail
      await expect(stdMemberAddHelper.connect(alice).approve(pid)).to.be
        .reverted;
    });

    it('Membership rejections are immediate', async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(1);

      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(carol)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      // Reject it (Alice) => success
      await expect(stdMemberAddHelper.connect(alice).reject(pid)).to.not.be
        .reverted;

      const proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);

      // Try to approve it (Alice) => fail
      await expect(stdMemberAddHelper.connect(bob).reject(pid)).to.be.reverted;
    });

    it('Proposal execution is immediate when created by the only editor', async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(1);

      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(false);

      // Alice proposes
      await expect(
        stdGovernancePlugin.proposeAddMember(
          toUtf8Bytes('ipfs://1234'),
          carol.address
        )
      ).to.not.be.reverted;

      // Now Carol is a member
      expect(await stdGovernancePlugin.isMember(carol.address)).to.eq(true);
    });

    it("Proposals created by a non-editor need an editor's approval", async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(1);
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;

      const proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(1);
      expect(await stdMemberAddHelper.canExecute(pid)).to.eq(false);
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      // Dave cannot
      await expect(stdMemberAddHelper.connect(dave).approve(pid)).to.be
        .reverted;
      await expect(stdMemberAddHelper.connect(dave).execute(pid)).to.be
        .reverted;
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      // Alice can
      await expect(stdMemberAddHelper.connect(alice).approve(pid)).to.not.be
        .reverted;
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(true);
    });
  });

  describe('Multiple editors case', () => {
    // Alice: editor
    // Bob: editor
    // Carol: editor

    beforeEach(async () => {
      let pid = 0;
      await proposeNewEditor(bob.address);
      await proposeNewEditor(carol.address);
      pid = 1;
      await stdGovernancePlugin.connect(bob).vote(pid, VoteOption.Yes, true);
    });

    it('Only editors can approve adding members', async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(3);

      // Requesting membership for Dave
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      // Dave cannot approve (fail)
      await expect(stdMemberAddHelper.connect(dave).approve(pid)).to.be
        .reverted;

      // Dave is still not a member
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      // Approve it (Alice)
      await expect(stdMemberAddHelper.connect(alice).approve(pid)).to.not.be
        .reverted;

      // Dave is now a member
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(true);

      // Now requesting for 0x1
      expect(await stdGovernancePlugin.isMember(ADDRESS_ONE)).to.eq(false);
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), ADDRESS_ONE)
      ).to.not.be.reverted;
      expect(await stdGovernancePlugin.isMember(ADDRESS_ONE)).to.eq(false);

      // Dave cannot approve (fail)
      await expect(stdMemberAddHelper.connect(dave).approve(pid)).to.be
        .reverted;

      // ADDRESS_ONE is still not a member
      expect(await stdGovernancePlugin.isMember(ADDRESS_ONE)).to.eq(false);

      // Approve it (Bob)
      await expect(stdMemberAddHelper.connect(bob).approve(pid)).to.not.be
        .reverted;

      // ADDRESS_ONE is now a member
      expect(await stdGovernancePlugin.isMember(ADDRESS_ONE)).to.eq(true);

      // Now requesting for 0x2
      expect(await stdGovernancePlugin.isMember(ADDRESS_TWO)).to.eq(false);
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), ADDRESS_TWO)
      ).to.not.be.reverted;
      expect(await stdGovernancePlugin.isMember(ADDRESS_TWO)).to.eq(false);

      // Dave cannot approve (fail)
      await expect(stdMemberAddHelper.connect(dave).approve(pid)).to.be
        .reverted;

      // ADDRESS_TWO is still not a member
      expect(await stdGovernancePlugin.isMember(ADDRESS_TWO)).to.eq(false);

      // Approve it (Carol)
      await expect(stdMemberAddHelper.connect(carol).approve(pid)).to.not.be
        .reverted;

      // ADDRESS_TWO is now a member
      expect(await stdGovernancePlugin.isMember(ADDRESS_TWO)).to.eq(true);
    });

    it('Proposals should be unsettled after created', async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(3);

      // Proposed by a random wallet
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;

      let proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(1);
      expect(await stdMemberAddHelper.canExecute(pid)).to.eq(false);
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      await stdGovernancePlugin.proposeAddMember('0x', dave.address);

      // Proposed by a (now) member
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), ADDRESS_ONE)
      ).to.not.be.reverted;

      expect((await stdMemberAddHelper.getProposal(pid)).executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(1);
      expect(await stdMemberAddHelper.canExecute(pid)).to.eq(false);
      expect(await stdGovernancePlugin.isMember(ADDRESS_ONE)).to.eq(false);

      // Proposed by an editor
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(alice)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), ADDRESS_TWO)
      ).to.not.be.reverted;

      proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(2);
      expect(await stdMemberAddHelper.canExecute(pid)).to.eq(false);
      expect(await stdGovernancePlugin.isMember(ADDRESS_TWO)).to.eq(false);
    });

    it('Only editors can reject new membership proposals', async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(3);

      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;

      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      // Reject it (Dave) => fail
      await expect(stdMemberAddHelper.connect(dave).reject(pid)).to.be.reverted;

      // Still not a member
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      // Reject it (Bob) => success
      await expect(stdMemberAddHelper.connect(bob).reject(pid)).to.not.be
        .reverted;

      // Still not a member
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      // Try to approve it (bob) => fail
      await expect(stdMemberAddHelper.connect(bob).approve(pid)).to.be.reverted;

      expect((await stdMemberAddHelper.getProposal(pid)).executed).to.eq(false);
    });

    it("Proposals created by a non-editor need an editor's approval", async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(3);
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;

      const proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(1);
      expect(await stdMemberAddHelper.canExecute(pid)).to.eq(false);
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      // Dave cannot
      await expect(stdMemberAddHelper.connect(dave).approve(pid)).to.be
        .reverted;
      await expect(stdMemberAddHelper.connect(dave).execute(pid)).to.be
        .reverted;
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);

      // Alice can
      await expect(stdMemberAddHelper.connect(alice).approve(pid)).to.not.be
        .reverted;
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(true);
    });

    it("Proposals created by an editor need another editor's approval", async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(3);

      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(alice)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;

      const proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);
      expect(proposal.parameters.minApprovals).to.eq(2);
      expect(await stdMemberAddHelper.canExecute(pid)).to.eq(false);
    });

    it('Memberships are approved when the first non-proposer editor approves', async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(3);

      // Alice proposes a mew member
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(alice)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;

      let proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(false);

      // Approve it (Alice) => fail
      await expect(stdMemberAddHelper.connect(alice).approve(pid)).to.be
        .reverted;

      // Approve it (Dave) => fail
      await expect(stdMemberAddHelper.connect(dave).approve(pid)).to.be
        .reverted;

      // Approve it (Bob) => succeed
      await expect(stdMemberAddHelper.connect(bob).approve(pid)).to.not.be
        .reverted;

      proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.executed).to.eq(true);

      // Now Dave is a member
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(true);
    });

    it('Memberships are rejected when the first non-proposer editor rejects', async () => {
      expect(await stdGovernancePlugin.addresslistLength()).to.eq(3);

      // Alice proposes a mew member
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(alice)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), dave.address)
      ).to.not.be.reverted;

      expect((await stdMemberAddHelper.getProposal(pid)).executed).to.eq(false);

      // Reject it (Alice) => can't change
      await expect(stdMemberAddHelper.connect(alice).reject(pid)).to.be
        .reverted;

      // Reject it (Dave) => fail
      await expect(stdMemberAddHelper.connect(dave).reject(pid)).to.be.reverted;

      // Reject it (Bob) => succeed
      await expect(stdMemberAddHelper.connect(bob).reject(pid)).to.not.be
        .reverted;

      // Reject it (Carol) => can't anymore
      await expect(stdMemberAddHelper.connect(carol).reject(pid)).to.be
        .reverted;

      expect((await stdMemberAddHelper.getProposal(pid)).executed).to.eq(false);

      // Dave is still not a member
      expect(await stdGovernancePlugin.isMember(dave.address)).to.eq(false);
    });
  });

  describe('Approving', () => {
    // Alice: editor
    // Bob: member

    it('proposeNewMember should generate the right action list', async () => {
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(carol)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      const proposal = await stdMemberAddHelper.getProposal(pid);
      expect(proposal.actions.length).to.eq(1);
      expect(proposal.actions[0].to).to.eq(stdGovernancePlugin.address);
      expect(proposal.actions[0].value).to.eq(0);
      expect(proposal.actions[0].data).to.eq(
        stdGovernancePluginInterface.encodeFunctionData('addMember', [
          carol.address,
        ])
      );
    });

    it('Proposing an existing member fails', async () => {
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), alice.address)
      )
        .to.be.revertedWithCustomError(stdGovernancePlugin, 'AlreadyAMember')
        .withArgs(alice.address);

      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), bob.address)
      )
        .to.be.revertedWithCustomError(stdGovernancePlugin, 'AlreadyAMember')
        .withArgs(bob.address);

      // More
      await expect(
        stdGovernancePlugin
          .connect(carol)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), alice.address)
      ).to.be.reverted;

      await expect(
        stdGovernancePlugin
          .connect(bob)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), alice.address)
      ).to.be.reverted;

      await expect(
        stdGovernancePlugin
          .connect(alice)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), alice.address)
      ).to.be.reverted;
    });

    it('Attempting to approve twice fails', async () => {
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      await expect(stdMemberAddHelper.approve(pid)).to.not.be.reverted;
      await expect(stdMemberAddHelper.approve(pid)).to.be.reverted;
    });

    it('Attempting to reject twice fails', async () => {
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      await expect(stdMemberAddHelper.reject(pid)).to.not.be.reverted;
      await expect(stdMemberAddHelper.reject(pid)).to.be.reverted;
    });

    it('Rejected proposals cannot be approved', async () => {
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      await expect(stdMemberAddHelper.reject(pid)).to.not.be.reverted;
      await expect(stdMemberAddHelper.approve(pid)).to.be.reverted;
    });

    it('Rejected proposals cannot be executed', async () => {
      pid = await stdMemberAddHelper.proposalCount();
      await expect(
        stdGovernancePlugin
          .connect(dave)
          .proposeAddMember(toUtf8Bytes('ipfs://1234'), carol.address)
      ).to.not.be.reverted;

      await expect(stdMemberAddHelper.reject(pid)).to.not.be.reverted;
      await expect(stdMemberAddHelper.execute(pid)).to.be.reverted;
    });

    it('Only the DAO can call the plugin to update the settings', async () => {
      // Nobody else can
      await expect(
        stdMemberAddHelper.connect(alice).updateMultisigSettings({
          proposalDuration: 60 * 60 * 24 * 5,
        })
      ).to.be.reverted;
      await expect(
        stdMemberAddHelper.connect(bob).updateMultisigSettings({
          proposalDuration: 60 * 60 * 24 * 5,
        })
      ).to.be.reverted;
      await expect(
        stdMemberAddHelper.connect(carol).updateMultisigSettings({
          proposalDuration: 60 * 60 * 24 * 5,
        })
      ).to.be.reverted;
      await expect(
        stdMemberAddHelper.connect(dave).updateMultisigSettings({
          proposalDuration: 60 * 60 * 24 * 5,
        })
      ).to.be.reverted;

      // The DAO can
      const actions: IDAO.ActionStruct[] = [
        {
          to: stdMemberAddHelper.address,
          value: 0,
          data: StdMemberAddHelper__factory.createInterface().encodeFunctionData(
            'updateMultisigSettings',
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

    it('The DAO can upgrade the plugin', async () => {
      // Nobody else can
      await expect(stdMemberAddHelper.connect(alice).upgradeTo(ADDRESS_ONE)).to
        .be.reverted;
      await expect(stdMemberAddHelper.connect(bob).upgradeTo(ADDRESS_ONE)).to.be
        .reverted;
      await expect(
        stdMemberAddHelper.connect(carol).upgradeToAndCall(
          stdMemberAddHelper.implementation(), // upgrade to itself
          EMPTY_DATA
        )
      ).to.be.reverted;
      await expect(
        stdMemberAddHelper.connect(dave).upgradeToAndCall(
          stdMemberAddHelper.implementation(), // upgrade to itself
          EMPTY_DATA
        )
      ).to.be.reverted;

      // The DAO can
      const actions: IDAO.ActionStruct[] = [
        {
          to: stdMemberAddHelper.address,
          value: 0,
          data: StdMemberAddHelper__factory.createInterface().encodeFunctionData(
            'upgradeTo',
            [await stdMemberAddHelper.implementation()]
          ),
        },
      ];

      await expect(dao.execute(ZERO_BYTES32, actions, 0)).to.not.be.reverted;
    });
  });

  describe('Tests replicated from MultisigPlugin', () => {
    describe('initialize', () => {
      it('reverts if trying to re-initialize', async () => {
        await expect(
          stdMemberAddHelper.initialize(dao.address, {
            proposalDuration: 60 * 60 * 24 * 5,
          })
        ).to.be.revertedWith('Initializable: contract is already initialized');
        await expect(
          stdGovernancePlugin.initialize(
            dao.address,
            defaultStdGovernanceSettings,
            [alice.address],
            stdMemberAddHelper.address
          )
        ).to.be.revertedWith('Initializable: contract is already initialized');
        await expect(
          spacePlugin.initialize(
            dao.address,
            defaultInput.contentUri,
            ADDRESS_ZERO
          )
        ).to.be.revertedWith('Initializable: contract is already initialized');
      });

      it('should emit `MultisigSettingsUpdated` during initialization', async () => {
        stdMemberAddHelper = await deployWithProxy<StdMemberAddHelper>(
          new StdMemberAddHelper__factory(alice)
        );
        const multisigSettings: StdMemberAddHelper.MultisigSettingsStruct = {
          proposalDuration: 60 * 60 * 24 * 5,
        };

        await expect(
          stdMemberAddHelper.initialize(dao.address, multisigSettings)
        )
          .to.emit(stdMemberAddHelper, 'MultisigSettingsUpdated')
          .withArgs(60 * 60 * 24 * 5);
      });
    });

    describe('plugin interface: ', () => {
      it('does not support the empty interface', async () => {
        expect(await stdMemberAddHelper.supportsInterface('0xffffffff')).to.be
          .false;
      });

      it('supports the `IERC165Upgradeable` interface', async () => {
        const iface = IERC165Upgradeable__factory.createInterface();
        expect(
          await stdMemberAddHelper.supportsInterface(getInterfaceID(iface))
        ).to.be.true;
      });

      it('supports the `IPlugin` interface', async () => {
        const iface = IPlugin__factory.createInterface();
        expect(
          await stdMemberAddHelper.supportsInterface(getInterfaceID(iface))
        ).to.be.true;
      });

      it('supports the `IProposal` interface', async () => {
        const iface = IProposal__factory.createInterface();
        expect(
          await stdMemberAddHelper.supportsInterface(getInterfaceID(iface))
        ).to.be.true;
      });

      it('supports the `IMultisig` interface', async () => {
        const iface = IMultisig__factory.createInterface();
        expect(
          await stdMemberAddHelper.supportsInterface(getInterfaceID(iface))
        ).to.be.true;
      });

      it('supports the `Multisig` interface', async () => {
        expect(
          await stdMemberAddHelper.supportsInterface(
            getInterfaceID(multisigInterface)
          )
        ).to.be.true;
      });
    });

    describe('updateMultisigSettings:', () => {
      it('should emit `MultisigSettingsUpdated` when `updateMutlsigSettings` gets called', async () => {
        await dao.grant(
          stdMemberAddHelper.address,
          alice.address,
          await stdMemberAddHelper.UPDATE_MULTISIG_SETTINGS_PERMISSION_ID()
        );
        const multisigSettings = {
          proposalDuration: 60 * 60 * 24 * 5,
        };

        await expect(
          stdMemberAddHelper.updateMultisigSettings(multisigSettings)
        )
          .to.emit(stdMemberAddHelper, 'MultisigSettingsUpdated')
          .withArgs(60 * 60 * 24 * 5);
      });
    });

    describe('createProposal:', () => {
      it('increments the proposal counter', async () => {
        const pc = await stdMemberAddHelper.proposalCount();

        await expect(
          stdGovernancePlugin.proposeAddMember(EMPTY_DATA, carol.address)
        ).not.to.be.reverted;

        expect(await stdMemberAddHelper.proposalCount()).to.equal(pc.add(1));
      });

      it('creates unique proposal IDs for each proposal', async () => {
        const proposalId0 =
          await stdGovernancePlugin.callStatic.proposeAddMember(
            EMPTY_DATA,
            carol.address
          );
        // create a new proposal for the proposalCounter to be incremented
        await expect(
          stdGovernancePlugin.proposeAddMember(EMPTY_DATA, carol.address)
        ).not.to.be.reverted;

        const proposalId1 =
          await stdGovernancePlugin.callStatic.proposeAddMember(
            EMPTY_DATA,
            dave.address
          );

        expect(proposalId0).to.equal(1);
        expect(proposalId1).to.equal(2);

        expect(proposalId0).to.not.equal(proposalId1);
      });

      it('emits the `ProposalCreated` event', async () => {
        await expect(
          stdGovernancePlugin.proposeAddMember(EMPTY_DATA, carol.address)
        ).to.emit(stdMemberAddHelper, 'ProposalCreated');
      });

      it('reverts if the multisig settings have been changed in the same block', async () => {
        await dao.grant(
          stdMemberAddHelper.address,
          dao.address,
          await stdMemberAddHelper.UPDATE_MULTISIG_SETTINGS_PERMISSION_ID()
        );

        await ethers.provider.send('evm_setAutomine', [false]);

        await dao.execute(
          ZERO_BYTES32,
          [
            {
              to: stdMemberAddHelper.address,
              value: 0,
              data: stdMemberAddHelper.interface.encodeFunctionData(
                'updateMultisigSettings',
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
          stdGovernancePlugin.proposeAddMember(EMPTY_DATA, carol.address)
        ).to.revertedWithCustomError(
          stdMemberAddHelper,
          'ProposalCreationForbiddenOnSameBlock'
        );

        await ethers.provider.send('evm_setAutomine', [true]);
      });
    });

    describe('canApprove:', () => {
      beforeEach(async () => {
        await proposeNewEditor(bob.address); // have 2 editors
        await mineBlock();

        expect(await stdGovernancePlugin.isEditor(alice.address)).to.be.true;
        expect(await stdGovernancePlugin.isEditor(bob.address)).to.be.true;
        expect(await stdGovernancePlugin.isEditor(carol.address)).to.be.false;

        // Alice approves
        pid = await stdMemberAddHelper.proposalCount();
        await stdGovernancePlugin.proposeAddMember(EMPTY_DATA, carol.address);
      });

      it('returns `false` if the proposal is already executed', async () => {
        expect((await stdMemberAddHelper.getProposal(pid)).executed).to.be
          .false;
        await stdMemberAddHelper.connect(bob).approve(pid);

        expect((await stdMemberAddHelper.getProposal(pid)).executed).to.be.true;
        expect(await stdMemberAddHelper.canApprove(pid, signers[3].address)).to
          .be.false;
      });

      it('returns `false` if the approver is not an editor', async () => {
        expect(await stdGovernancePlugin.isEditor(signers[9].address)).to.be
          .false;

        expect(await stdMemberAddHelper.canApprove(pid, signers[9].address)).to
          .be.false;
      });

      it('returns `false` if the approver has already approved', async () => {
        expect(await stdMemberAddHelper.canApprove(pid, bob.address)).to.be
          .true;
        await stdMemberAddHelper.connect(bob).approve(pid);
        expect(await stdMemberAddHelper.canApprove(pid, bob.address)).to.be
          .false;
      });

      it('returns `true` if the approver is listed', async () => {
        expect(await stdMemberAddHelper.canApprove(pid, bob.address)).to.be
          .true;
      });

      it('returns `false` if the proposal is settled', async () => {
        pid = await stdMemberAddHelper.proposalCount();
        await stdGovernancePlugin.proposeAddMember(EMPTY_DATA, carol.address);

        expect(await stdMemberAddHelper.canApprove(pid, bob.address)).to.be
          .true;

        await stdMemberAddHelper.connect(bob).approve(pid);

        expect(await stdMemberAddHelper.canApprove(pid, bob.address)).to.be
          .false;
      });
    });

    describe('hasApproved', () => {
      beforeEach(async () => {
        await proposeNewEditor(bob.address); // have 2 editors
        await mineBlock();

        // Carol is a member
        pid = await stdMemberAddHelper.proposalCount();
        await stdGovernancePlugin.proposeAddMember(EMPTY_DATA, carol.address);
      });

      it("returns `false` if user hasn't approved yet", async () => {
        expect(await stdMemberAddHelper.hasApproved(pid, bob.address)).to.be
          .false;
      });

      it('returns `true` if user has approved', async () => {
        await stdMemberAddHelper.connect(bob).approve(pid);
        expect(await stdMemberAddHelper.hasApproved(pid, bob.address)).to.be
          .true;
      });
    });

    describe('approve:', () => {
      beforeEach(async () => {
        await proposeNewEditor(bob.address); // have 2 editors
        await mineBlock();

        // Alice approves
        pid = await stdMemberAddHelper.proposalCount();
        await stdGovernancePlugin.proposeAddMember(EMPTY_DATA, carol.address);
      });

      it('reverts when approving multiple times', async () => {
        await stdMemberAddHelper.connect(bob).approve(pid);

        // Try to vote again
        await expect(stdMemberAddHelper.connect(bob).approve(pid))
          .to.be.revertedWithCustomError(
            stdMemberAddHelper,
            'ApprovalCastForbidden'
          )
          .withArgs(pid, bob.address);
      });

      it('reverts if minimal approval is not met yet', async () => {
        const proposal = await stdMemberAddHelper.getProposal(pid);
        expect(proposal.approvals).to.eq(1);
        await expect(stdMemberAddHelper.execute(pid))
          .to.be.revertedWithCustomError(
            stdMemberAddHelper,
            'ProposalExecutionForbidden'
          )
          .withArgs(pid);
      });

      it('approves with the msg.sender address', async () => {
        expect((await stdMemberAddHelper.getProposal(pid)).approvals).to.equal(
          1
        );

        const tx = await stdMemberAddHelper.connect(bob).approve(pid);

        const event = await findEvent<ApprovedEvent>(tx, 'Approved');
        expect(event!.args.proposalId).to.eq(pid);
        expect(event!.args.editor).to.eq(bob.address);

        expect((await stdMemberAddHelper.getProposal(pid)).approvals).to.equal(
          2
        );
      });
    });

    describe('canExecute:', () => {
      beforeEach(async () => {
        await proposeNewEditor(bob.address); // have 2 editors
        await mineBlock();

        expect(await stdGovernancePlugin.isEditor(alice.address)).to.be.true;
        expect(await stdGovernancePlugin.isEditor(bob.address)).to.be.true;
        expect(await stdGovernancePlugin.isEditor(carol.address)).to.be.false;

        // Alice approves
        pid = await stdMemberAddHelper.proposalCount();
        await stdGovernancePlugin.proposeAddMember(EMPTY_DATA, carol.address);
      });

      it('returns `false` if the proposal has not reached the minimum approval yet', async () => {
        const proposal = await stdMemberAddHelper.getProposal(pid);
        expect(proposal.approvals).to.be.lt(proposal.parameters.minApprovals);

        expect(await stdMemberAddHelper.canExecute(pid)).to.be.false;
      });

      it('returns `false` if the proposal is already executed', async () => {
        expect((await stdMemberAddHelper.getProposal(pid)).executed).to.be
          .false;
        expect(
          (await stdMemberAddHelper.getProposal(pid)).actions.length
        ).to.eq(1);

        // Approve and execute
        await stdMemberAddHelper.connect(bob).approve(pid);

        expect((await stdMemberAddHelper.getProposal(pid)).executed).to.be.true;

        expect(await stdMemberAddHelper.canExecute(pid)).to.be.false;
      });
    });

    describe('execute:', () => {
      beforeEach(async () => {
        await proposeNewEditor(bob.address); // have 2 editors
        await mineBlock();

        // Alice approves
        pid = await stdMemberAddHelper.proposalCount();
        await stdGovernancePlugin.proposeAddMember(EMPTY_DATA, carol.address);
      });

      it('reverts if the minimum approval is not met', async () => {
        await expect(stdMemberAddHelper.execute(pid))
          .to.be.revertedWithCustomError(
            stdMemberAddHelper,
            'ProposalExecutionForbidden'
          )
          .withArgs(pid);
      });

      it('emits the `Approved`, `ProposalExecuted`, and `Executed` events if execute is called inside the `approve` method', async () => {
        await expect(stdMemberAddHelper.connect(bob).approve(pid))
          .to.emit(dao, 'Executed')
          .to.emit(stdMemberAddHelper, 'ProposalExecuted')
          .to.emit(stdMemberAddHelper, 'Approved');
      });
    });
  });

  // Helpers

  const proposeNewEditor = (_editor: string, proposer = alice) => {
    const actions: IDAO.ActionStruct[] = [
      {
        to: stdGovernancePlugin.address,
        value: 0,
        data: stdGovernancePluginInterface.encodeFunctionData('addEditor', [
          _editor,
        ]),
      },
    ];

    return stdGovernancePlugin
      .connect(proposer)
      .createProposal(
        toUtf8Bytes('ipfs://'),
        actions,
        0, // fail safe
        VoteOption.Yes,
        true // auto execute
      )
      .then(tx => tx.wait());
  };
});
