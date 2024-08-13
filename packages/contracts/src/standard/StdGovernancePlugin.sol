// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.8;

import {IDAO, PluginUUPSUpgradeable} from "@aragon/osx/core/plugin/PluginUUPSUpgradeable.sol";
import {SafeCastUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {PermissionManager} from "@aragon/osx/core/permission/PermissionManager.sol";
import {RATIO_BASE, _applyRatioCeiled} from "@aragon/osx/plugins/utils/Ratio.sol";
import {IMajorityVoting} from "./base/IMajorityVoting.sol";
import {MajorityVotingBase} from "./base/MajorityVotingBase.sol";
import {IMembers} from "../base/IMembers.sol";
import {IEditors} from "../base/IEditors.sol";
import {Addresslist} from "./base/Addresslist.sol";
import {StdMemberAddHelper, STD_MEMBER_ADD_INTERFACE_ID} from "./StdMemberAddHelper.sol";
import {SpacePlugin} from "../space/SpacePlugin.sol";

// The [ERC-165](https://eips.ethereum.org/EIPS/eip-165) interface ID of the contract.
bytes4 constant STD_GOVERNANCE_PLUGIN_INTERFACE_ID = StdGovernancePlugin.initialize.selector ^
    StdGovernancePlugin.createProposal.selector ^
    StdGovernancePlugin.proposeEdits.selector ^
    StdGovernancePlugin.proposeAcceptSubspace.selector ^
    StdGovernancePlugin.proposeRemoveSubspace.selector ^
    StdGovernancePlugin.proposeAddMember.selector ^
    StdGovernancePlugin.proposeRemoveMember.selector ^
    StdGovernancePlugin.proposeAddEditor.selector ^
    StdGovernancePlugin.proposeRemoveEditor.selector ^
    StdGovernancePlugin.addEditor.selector ^
    StdGovernancePlugin.removeEditor.selector ^
    StdGovernancePlugin.addMember.selector ^
    StdGovernancePlugin.removeMember.selector ^
    StdGovernancePlugin.leaveSpace.selector ^
    StdGovernancePlugin.cancelProposal.selector;

/// @title StdGovernancePlugin (Address list)
/// @author Aragon - 2023
/// @notice The majority voting implementation using a list of member addresses.
/// @dev This contract inherits from `MajorityVotingBase` and implements the `IMajorityVoting` interface.
contract StdGovernancePlugin is Addresslist, MajorityVotingBase, IEditors, IMembers {
    using SafeCastUpgradeable for uint256;

    /// @notice The ID of the permission required to call the `addAddresses` and `removeAddresses` functions.
    bytes32 public constant UPDATE_ADDRESSES_PERMISSION_ID =
        keccak256("UPDATE_ADDRESSES_PERMISSION");

    /// @notice Who created each proposal
    mapping(uint256 => address) internal proposalCreators;

    /// @notice Whether an address is considered as a space member (not editor)
    mapping(address => bool) internal members;

    /// @notice The address of the plugin where new memberships are approved, using a different set of rules.
    StdMemberAddHelper public stdMemberAddHelper;

    /// @notice Emitted when the creator cancels a proposal
    event ProposalCanceled(uint256 proposalId);

    /// @notice Raised when more than one editor is attempted to be added or removed
    error OnlyOneEditorPerCall(uint256 length);

    /// @notice Raised when attempting to remove the last editor
    error NoEditorsLeft();

    /// @notice Raised when a non-editor attempts to leave a space
    error NotAnEditor();

    /// @notice Raised when a wallet who is not an editor or a member attempts to do something
    error NotAMember(address caller);

    /// @notice Raised when someone who didn't create a proposal attempts to cancel it
    error OnlyCreatorCanCancel();

    /// @notice Raised when attempting to cancel a proposal that already ended
    error ProposalIsNotOpen();

    /// @notice Raised when a content proposal is called with empty data
    error EmptyContent();

    /// @notice Thrown when the given contract doesn't support a required interface.
    error InvalidInterface(address);

    /// @notice Raised when a non-editor attempts to call a restricted function.
    error Unauthorized();

    /// @notice Thrown when attempting propose membership for an existing member.
    error AlreadyAMember(address _member);

    /// @notice Thrown when attempting propose removing membership for a non-member.
    error AlreadyNotAMember(address _member);

    /// @notice Thrown when attempting propose removing membership for a non-member.
    error AlreadyAnEditor(address _editor);

    /// @notice Thrown when attempting propose removing someone who already isn't an editor.
    error AlreadyNotAnEditor(address _editor);

    modifier onlyMembers() {
        if (!isMember(msg.sender)) {
            revert NotAMember(msg.sender);
        }
        _;
    }

    /// @notice Initializes the component.
    /// @dev This method is required to support [ERC-1822](https://eips.ethereum.org/EIPS/eip-1822).
    /// @param _dao The IDAO interface of the associated DAO.
    /// @param _votingSettings The voting settings.
    function initialize(
        IDAO _dao,
        VotingSettings calldata _votingSettings,
        address[] calldata _initialEditors,
        StdMemberAddHelper _stdMemberAddHelper
    ) external initializer {
        __MajorityVotingBase_init(_dao, _votingSettings);

        _addAddresses(_initialEditors);
        emit EditorsAdded(_initialEditors);

        if (!_stdMemberAddHelper.supportsInterface(STD_MEMBER_ADD_INTERFACE_ID)) {
            revert InvalidInterface(address(_stdMemberAddHelper));
        }
        stdMemberAddHelper = _stdMemberAddHelper;
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(bytes4 _interfaceId) public view virtual override returns (bool) {
        return
            _interfaceId == STD_GOVERNANCE_PLUGIN_INTERFACE_ID ||
            _interfaceId == type(Addresslist).interfaceId ||
            _interfaceId == type(MajorityVotingBase).interfaceId ||
            _interfaceId == type(IMembers).interfaceId ||
            _interfaceId == type(IEditors).interfaceId ||
            super.supportsInterface(_interfaceId);
    }

    /// @notice Returns whether the given address is currently listed as an editor
    function isEditor(address _account) public view returns (bool) {
        return isListed(_account);
    }

    /// @notice Returns whether the given address holds membership/editor permission on the standard governance plugin
    function isMember(address _account) public view returns (bool) {
        return members[_account] || isEditor(_account);
    }

    /// @inheritdoc MajorityVotingBase
    function totalVotingPower(uint256 _blockNumber) public view override returns (uint256) {
        return addresslistLengthAtBlock(_blockNumber);
    }

    /// @notice Determines whether at least one editor besides the creator has approved.
    /// @param _proposalId The ID of the proposal to check.
    function isMinParticipationReached(uint256 _proposalId) public view override returns (bool) {
        Proposal storage proposal_ = proposals[_proposalId];

        // Zero votes?
        if (proposal_.tally.yes == 0 && proposal_.tally.no == 0 && proposal_.tally.abstain == 0) {
            return false;
        }
        // Do we have only one potential voter?
        else if (addresslistLengthAtBlock(proposal_.parameters.snapshotBlock) == 1) {
            // If so, we don't want to brick the DAO
            return true;
        }

        // Did other voters participate, other than the creator?
        return proposal_.didNonProposersVote;
    }

    /// @notice Adds new editors to the address list.
    /// @param _account The address of the new editor.
    /// @dev This function is used during the plugin initialization.
    function addEditor(address _account) external auth(UPDATE_ADDRESSES_PERMISSION_ID) {
        if (isEditor(_account)) return;

        address[] memory _editors = new address[](1);
        _editors[0] = _account;

        _addAddresses(_editors);
        emit EditorAdded(address(dao()), _account);
    }

    /// @notice Removes existing editors from the address list.
    /// @param _account The addresses of the editors to be removed. NOTE: Only one member can be removed at a time.
    function removeEditor(address _account) external auth(UPDATE_ADDRESSES_PERMISSION_ID) {
        if (!isEditor(_account)) return;
        else if (addresslistLength() <= 1) revert NoEditorsLeft();

        address[] memory _editors = new address[](1);
        _editors[0] = _account;

        _removeAddresses(_editors);
        emit EditorRemoved(address(dao()), _account);
    }

    /// @notice Defines the given address as a new space member that can create proposals.
    /// @param _account The address of the space member to be added.
    /// @dev Called by the DAO, via StdMemberAddHelper contract.
    function addMember(address _account) external auth(UPDATE_ADDRESSES_PERMISSION_ID) {
        if (members[_account]) return;

        members[_account] = true;
        emit MemberAdded(address(dao()), _account);
    }

    /// @notice Removes the given address as a proposal creator.
    /// @param _account The address of the space member to be removed.
    function removeMember(address _account) external auth(UPDATE_ADDRESSES_PERMISSION_ID) {
        if (!members[_account]) return;

        members[_account] = false;
        emit MemberRemoved(address(dao()), _account);
    }

    /// @notice Removes msg.sender from the list of editors and members, whichever is applicable. If the last editor leaves the space, the space will become read-only.
    function leaveSpace() external {
        if (isEditor(msg.sender)) {
            // Not checking whether msg.sender is the last editor. It is acceptable
            // that a DAO/Space remains in read-only mode, as it can always be forked.

            address[] memory _editors = new address[](1);
            _editors[0] = msg.sender;

            _removeAddresses(_editors);
            emit EditorLeft(address(dao()), msg.sender);
        }

        if (members[msg.sender]) {
            members[msg.sender] = false;
            emit MemberLeft(address(dao()), msg.sender);
        }
    }

    /// @notice Removes msg.sender from the list of editors. If the last editor leaves the space, the space will become read-only.
    function leaveSpaceAsEditor() external {
        if (!isEditor(msg.sender)) {
            revert NotAnEditor();
        }

        // Not checking whether msg.sender is the last editor. It is acceptable
        // that a DAO/Space remains in read-only mode, as it can always be forked.

        address[] memory _editors = new address[](1);
        _editors[0] = msg.sender;

        _removeAddresses(_editors);
        emit EditorLeft(address(dao()), msg.sender);
    }

    /// @inheritdoc MajorityVotingBase
    function createProposal(
        bytes calldata _metadataContentUri,
        IDAO.Action[] calldata _actions,
        uint256 _allowFailureMap,
        VoteOption _voteOption,
        bool _tryEarlyExecution
    ) external override onlyMembers returns (uint256 proposalId) {
        uint64 snapshotBlock;
        unchecked {
            snapshotBlock = block.number.toUint64() - 1; // The snapshot block must be mined already to protect the transaction against backrunning transactions causing census changes.
        }
        uint64 _startDate = block.timestamp.toUint64();

        proposalId = _createProposal({
            _creator: msg.sender,
            _metadata: _metadataContentUri,
            _startDate: _startDate,
            _endDate: _startDate + duration(),
            _actions: _actions,
            _allowFailureMap: _allowFailureMap
        });

        // Store proposal related information
        Proposal storage proposal_ = proposals[proposalId];

        proposal_.parameters.startDate = _startDate;
        proposal_.parameters.endDate = _startDate + duration();
        proposal_.parameters.snapshotBlock = snapshotBlock;
        proposal_.parameters.votingMode = votingMode();
        proposal_.parameters.supportThreshold = supportThreshold();
        proposalCreators[proposalId] = msg.sender;

        // Reduce costs
        if (_allowFailureMap != 0) {
            proposal_.allowFailureMap = _allowFailureMap;
        }

        for (uint256 i; i < _actions.length; ) {
            proposal_.actions.push(_actions[i]);
            unchecked {
                ++i;
            }
        }

        if (_voteOption != VoteOption.None) {
            vote(proposalId, _voteOption, _tryEarlyExecution);
        }
    }

    /// @notice Creates and executes a proposal that makes the DAO emit new content on the given space.
    /// @param _metadataContentUri The metadata of the proposal.
    /// @param _editsContentUri The URI of the IPFS content to publish
    /// @param _spacePlugin The address of the space plugin where changes will be executed
    function proposeEdits(
        bytes calldata _metadataContentUri,
        string memory _editsContentUri,
        address _spacePlugin
    ) public onlyMembers returns (uint256 proposalId) {
        if (_spacePlugin == address(0)) {
            revert EmptyContent();
        }

        proposalId = _proposeWrappedAction(
            _metadataContentUri,
            _spacePlugin,
            abi.encodeCall(SpacePlugin.publishEdits, (_editsContentUri))
        );
    }

    /// @notice Creates a proposal to make the DAO accept the given DAO as a subspace.
    /// @param _metadataContentUri The metadata of the proposal.
    /// @param _subspaceDao The address of the DAO that holds the new subspace
    /// @param _spacePlugin The address of the space plugin where changes will be executed
    function proposeAcceptSubspace(
        bytes calldata _metadataContentUri,
        IDAO _subspaceDao,
        address _spacePlugin
    ) public onlyMembers returns (uint256 proposalId) {
        if (address(_subspaceDao) == address(0) || _spacePlugin == address(0)) {
            revert EmptyContent();
        }

        proposalId = _proposeWrappedAction(
            _metadataContentUri,
            _spacePlugin,
            abi.encodeCall(SpacePlugin.acceptSubspace, (address(_subspaceDao)))
        );
    }

    /// @notice Creates a proposal to make the DAO remove the given DAO as a subspace.
    /// @param _metadataContentUri The metadata of the proposal.
    /// @param _subspaceDao The address of the DAO that holds the subspace to remove
    /// @param _spacePlugin The address of the space plugin where changes will be executed
    function proposeRemoveSubspace(
        bytes calldata _metadataContentUri,
        IDAO _subspaceDao,
        address _spacePlugin
    ) public onlyMembers returns (uint256 proposalId) {
        if (address(_subspaceDao) == address(0) || _spacePlugin == address(0)) {
            revert EmptyContent();
        }

        proposalId = _proposeWrappedAction(
            _metadataContentUri,
            _spacePlugin,
            abi.encodeCall(SpacePlugin.removeSubspace, (address(_subspaceDao)))
        );
    }

    /// @notice Creates a proposal on the StdMemberAddHelper to add a new member.
    /// @param _metadataContentUri The metadata of the proposal.
    /// @param _proposedMember The address of the member who may eveutnally be added.
    /// @return proposalId NOTE: The proposal ID will belong to the helper, not to this contract.
    function proposeAddMember(
        bytes calldata _metadataContentUri,
        address _proposedMember
    ) public returns (uint256 proposalId) {
        if (members[_proposedMember]) {
            revert AlreadyAMember(_proposedMember);
        }

        /// @dev Creating the actual proposal on the helper because the approval rules differ.
        /// @dev Keeping all wrappers on the this contract, even if one type of approvals is handled on the StdMemberAddHelper.
        return
            stdMemberAddHelper.proposeAddMember(_metadataContentUri, _proposedMember, msg.sender);
    }

    /// @notice Creates a proposal to remove an existing member.
    /// @param _metadataContentUri The metadata of the proposal.
    /// @param _member The address of the member who may eveutnally be removed.
    function proposeRemoveMember(
        bytes calldata _metadataContentUri,
        address _member
    ) public returns (uint256 proposalId) {
        if (!isEditor(msg.sender)) {
            revert Unauthorized();
        } else if (!members[_member]) {
            revert AlreadyNotAMember(_member);
        }

        proposalId = _proposeWrappedAction(
            _metadataContentUri,
            address(this),
            abi.encodeCall(StdGovernancePlugin.removeMember, (_member))
        );
    }

    /// @notice Creates a proposal to remove an existing member.
    /// @param _metadataContentUri The metadata of the proposal.
    /// @param _proposedEditor The address of the wallet who may eveutnally be made an editor.
    function proposeAddEditor(
        bytes calldata _metadataContentUri,
        address _proposedEditor
    ) public onlyMembers returns (uint256 proposalId) {
        if (isEditor(_proposedEditor)) {
            revert AlreadyAnEditor(_proposedEditor);
        }

        proposalId = _proposeWrappedAction(
            _metadataContentUri,
            address(this),
            abi.encodeCall(StdGovernancePlugin.addEditor, (_proposedEditor))
        );
    }

    /// @notice Creates a proposal to remove an existing editor.
    /// @param _metadataContentUri The metadata of the proposal.
    /// @param _editor The address of the editor who may eveutnally be removed.
    function proposeRemoveEditor(
        bytes calldata _metadataContentUri,
        address _editor
    ) public onlyMembers returns (uint256 proposalId) {
        if (!isEditor(_editor)) {
            revert AlreadyNotAnEditor(_editor);
        }

        proposalId = _proposeWrappedAction(
            _metadataContentUri,
            address(this),
            abi.encodeCall(StdGovernancePlugin.removeEditor, (_editor))
        );
    }

    /// @notice Cancels the given proposal. It can only be called by the creator and the proposal must have not ended.
    function cancelProposal(uint256 _proposalId) external {
        if (proposalCreators[_proposalId] != msg.sender) {
            revert OnlyCreatorCanCancel();
        }
        Proposal storage proposal_ = proposals[_proposalId];
        if (!_isProposalOpen(proposal_)) {
            revert ProposalIsNotOpen();
        }

        // Make it end now
        proposal_.parameters.endDate = block.timestamp.toUint64();
        emit ProposalCanceled(_proposalId);
    }

    /// @notice Creates a proposal with the given calldata as the only action.
    /// @param _metadataContentUri The IPFS URI of the metadata.
    /// @param _to The contract to call with the action.
    /// @param _data The calldata to eventually invoke.
    function _proposeWrappedAction(
        bytes memory _metadataContentUri,
        address _to,
        bytes memory _data
    ) internal returns (uint256 proposalId) {
        uint64 snapshotBlock;
        unchecked {
            snapshotBlock = block.number.toUint64() - 1; // The snapshot block must be mined already to protect the transaction against backrunning transactions causing census changes.
        }
        uint64 _startDate = block.timestamp.toUint64();

        proposalId = _createProposalId();

        // Store proposal related information
        Proposal storage proposal_ = proposals[proposalId];

        proposal_.parameters.startDate = _startDate;
        proposal_.parameters.endDate = _startDate + duration();
        proposal_.parameters.snapshotBlock = snapshotBlock;
        proposal_.parameters.votingMode = votingMode();
        proposal_.parameters.supportThreshold = supportThreshold();
        proposal_.actions.push(IDAO.Action({to: _to, value: 0, data: _data}));

        proposalCreators[proposalId] = msg.sender;

        emit ProposalCreated({
            proposalId: proposalId,
            creator: msg.sender,
            metadata: _metadataContentUri,
            startDate: _startDate,
            endDate: proposal_.parameters.endDate,
            actions: proposal_.actions,
            allowFailureMap: 0
        });

        if (isEditor(msg.sender)) {
            // We assume that the proposer approves (if an editor)
            vote(proposalId, VoteOption.Yes, true);
        }
    }

    /// @inheritdoc MajorityVotingBase
    function _vote(
        uint256 _proposalId,
        VoteOption _voteOption,
        address _voter,
        bool _tryEarlyExecution
    ) internal override {
        Proposal storage proposal_ = proposals[_proposalId];

        VoteOption state = proposal_.voters[_voter];

        // Remove the previous vote.
        if (state == VoteOption.Yes) {
            proposal_.tally.yes = proposal_.tally.yes - 1;
        } else if (state == VoteOption.No) {
            proposal_.tally.no = proposal_.tally.no - 1;
        } else if (state == VoteOption.Abstain) {
            proposal_.tally.abstain = proposal_.tally.abstain - 1;
        }

        // Store the updated/new vote for the voter.
        if (_voteOption == VoteOption.Yes) {
            proposal_.tally.yes = proposal_.tally.yes + 1;
        } else if (_voteOption == VoteOption.No) {
            proposal_.tally.no = proposal_.tally.no + 1;
        } else if (_voteOption == VoteOption.Abstain) {
            proposal_.tally.abstain = proposal_.tally.abstain + 1;
        }

        proposal_.voters[_voter] = _voteOption;

        emit VoteCast({
            proposalId: _proposalId,
            voter: _voter,
            voteOption: _voteOption,
            votingPower: 1
        });

        if (proposalCreators[_proposalId] != msg.sender && !proposal_.didNonProposersVote) {
            proposal_.didNonProposersVote = true;
        }

        if (_tryEarlyExecution && _canExecute(_proposalId)) {
            _execute(_proposalId);
        }
    }

    /// @inheritdoc MajorityVotingBase
    function _canVote(
        uint256 _proposalId,
        address _account,
        VoteOption _voteOption
    ) internal view override returns (bool) {
        Proposal storage proposal_ = proposals[_proposalId];

        // The proposal vote hasn't started or has already ended.
        if (!_isProposalOpen(proposal_)) {
            return false;
        }

        // The voter votes `None` which is not allowed.
        if (_voteOption == VoteOption.None) {
            return false;
        }

        // The voter has no voting power.
        if (!isListedAtBlock(_account, proposal_.parameters.snapshotBlock)) {
            return false;
        }

        // The voter has already voted but vote replacement is not allowed.
        if (
            proposal_.voters[_account] != VoteOption.None &&
            proposal_.parameters.votingMode != VotingMode.VoteReplacement
        ) {
            return false;
        }

        return true;
    }

    /// @dev This empty reserved space is put in place to allow future versions to add new
    /// variables without shifting down storage in the inheritance chain.
    /// https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[47] private __gap;
}
