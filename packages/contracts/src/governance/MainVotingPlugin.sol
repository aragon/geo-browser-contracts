// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.8;

import {IDAO, PluginUUPSUpgradeable} from "@aragon/osx/core/plugin/PluginUUPSUpgradeable.sol";
import {SafeCastUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {PermissionManager} from "@aragon/osx/core/permission/PermissionManager.sol";
import {RATIO_BASE, _applyRatioCeiled} from "@aragon/osx/plugins/utils/Ratio.sol";
import {IMajorityVoting} from "@aragon/osx/plugins/governance/majority-voting/IMajorityVoting.sol";
import {MajorityVotingBase} from "./base/MajorityVotingBase.sol";
import {IMembers} from "../base/IMembers.sol";
import {IEditors} from "../base/IEditors.sol";
import {Addresslist} from "./base/Addresslist.sol";
import {SpacePlugin} from "../space/SpacePlugin.sol";

// The [ERC-165](https://eips.ethereum.org/EIPS/eip-165) interface ID of the contract.
bytes4 constant MAIN_SPACE_VOTING_INTERFACE_ID = MainVotingPlugin.initialize.selector ^
    MainVotingPlugin.createProposal.selector ^
    MainVotingPlugin.proposeEdits.selector ^
    MainVotingPlugin.proposeAcceptSubspace.selector ^
    MainVotingPlugin.proposeRemoveSubspace.selector ^
    MainVotingPlugin.addEditor.selector ^
    MainVotingPlugin.removeEditor.selector ^
    MainVotingPlugin.addMember.selector ^
    MainVotingPlugin.removeMember.selector ^
    MainVotingPlugin.cancelProposal.selector;

/// @title MainVotingPlugin (Address list)
/// @author Aragon - 2023
/// @notice The majority voting implementation using a list of member addresses.
/// @dev This contract inherits from `MajorityVotingBase` and implements the `IMajorityVoting` interface.
contract MainVotingPlugin is Addresslist, MajorityVotingBase, IEditors, IMembers {
    using SafeCastUpgradeable for uint256;

    /// @notice The ID of the permission required to call the `addAddresses` and `removeAddresses` functions.
    bytes32 public constant UPDATE_ADDRESSES_PERMISSION_ID =
        keccak256("UPDATE_ADDRESSES_PERMISSION");

    /// @notice Who created each proposal
    mapping(uint256 => address) internal proposalCreators;

    /// @notice Whether an address is considered as a space member (not editor)
    mapping(address => bool) internal members;

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

    /// @notice Thrown when attempting propose removing membership for a non-member.
    error AlreadyNotMember(address _member);

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
        address[] calldata _initialEditors
    ) external initializer {
        __MajorityVotingBase_init(_dao, _votingSettings);

        _addAddresses(_initialEditors);
        emit EditorsAdded(_initialEditors);
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(bytes4 _interfaceId) public view virtual override returns (bool) {
        return
            _interfaceId == MAIN_SPACE_VOTING_INTERFACE_ID ||
            _interfaceId == type(Addresslist).interfaceId ||
            _interfaceId == type(MajorityVotingBase).interfaceId ||
            _interfaceId == type(IMembers).interfaceId ||
            _interfaceId == type(IEditors).interfaceId ||
            super.supportsInterface(_interfaceId);
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

    /// @notice Removes
    function leaveSpace() public {
        if (!isEditor(msg.sender)) {
            revert NotAnEditor();
        } else if (addresslistLength() <= 1) revert NoEditorsLeft();

        address[] memory _editors = new address[](1);
        _editors[0] = msg.sender;

        _removeAddresses(_editors);
        emit EditorLeft(address(dao()), msg.sender);
    }

    /// @notice Returns whether the given address is currently listed as an editor
    function isEditor(address _account) public view returns (bool) {
        return isListed(_account);
    }

    /// @notice Returns whether the given address holds membership/editor permission on the main voting plugin
    function isMember(address _account) public view returns (bool) {
        return members[_account] || isEditor(_account);
    }

    /// @inheritdoc MajorityVotingBase
    function totalVotingPower(uint256 _blockNumber) public view override returns (uint256) {
        return addresslistLengthAtBlock(_blockNumber);
    }

    /// @inheritdoc MajorityVotingBase
    function createProposal(
        bytes calldata _metadata,
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
            _metadata: _metadata,
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
        proposal_.parameters.minVotingPower = _applyRatioCeiled(
            totalVotingPower(snapshotBlock),
            minParticipation()
        );
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
    /// @param _contentUri The URI of the IPFS content to publish
    /// @param _spacePlugin The address of the space plugin where changes will be executed
    function proposeEdits(string memory _contentUri, address _spacePlugin) public onlyMembers {
        if (_spacePlugin == address(0)) {
            revert EmptyContent();
        }

        uint64 snapshotBlock;
        unchecked {
            snapshotBlock = block.number.toUint64() - 1; // The snapshot block must be mined already to protect the transaction against backrunning transactions causing census changes.
        }
        uint64 _startDate = block.timestamp.toUint64();

        uint256 proposalId = _createProposalId();

        // Store proposal related information
        Proposal storage proposal_ = proposals[proposalId];

        proposal_.parameters.startDate = _startDate;
        proposal_.parameters.endDate = _startDate + duration();
        proposal_.parameters.snapshotBlock = snapshotBlock;
        proposal_.parameters.votingMode = votingMode();
        proposal_.parameters.supportThreshold = supportThreshold();
        proposal_.parameters.minVotingPower = _applyRatioCeiled(
            totalVotingPower(snapshotBlock),
            minParticipation()
        );
        proposal_.actions.push(
            IDAO.Action({
                to: _spacePlugin,
                value: 0,
                data: abi.encodeCall(SpacePlugin.publishEdits, (_contentUri))
            })
        );

        proposalCreators[proposalId] = msg.sender;

        emit ProposalCreated({
            proposalId: proposalId,
            creator: proposalCreators[proposalId],
            metadata: "",
            startDate: _startDate,
            endDate: proposal_.parameters.endDate,
            actions: proposal_.actions,
            allowFailureMap: 0
        });
    }

    /// @notice Creates a proposal to make the DAO accept the given DAO as a subspace.
    /// @param _subspaceDao The address of the DAO that holds the new subspace
    /// @param _spacePlugin The address of the space plugin where changes will be executed
    function proposeAcceptSubspace(IDAO _subspaceDao, address _spacePlugin) public onlyMembers {
        if (address(_subspaceDao) == address(0) || _spacePlugin == address(0)) {
            revert EmptyContent();
        }
        uint64 snapshotBlock;
        unchecked {
            snapshotBlock = block.number.toUint64() - 1; // The snapshot block must be mined already to protect the transaction against backrunning transactions causing census changes.
        }
        uint64 _startDate = block.timestamp.toUint64();

        uint256 proposalId = _createProposalId();

        // Store proposal related information
        Proposal storage proposal_ = proposals[proposalId];

        proposal_.parameters.startDate = _startDate;
        proposal_.parameters.endDate = _startDate + duration();
        proposal_.parameters.snapshotBlock = snapshotBlock;
        proposal_.parameters.votingMode = votingMode();
        proposal_.parameters.supportThreshold = supportThreshold();
        proposal_.parameters.minVotingPower = _applyRatioCeiled(
            totalVotingPower(snapshotBlock),
            minParticipation()
        );
        IDAO.Action memory _action = IDAO.Action({
            to: _spacePlugin,
            value: 0,
            data: abi.encodeCall(SpacePlugin.acceptSubspace, (address(_subspaceDao)))
        });
        proposal_.actions.push(_action);

        proposalCreators[proposalId] = msg.sender;

        emit ProposalCreated({
            proposalId: proposalId,
            creator: proposalCreators[proposalId],
            metadata: "",
            startDate: _startDate,
            endDate: proposal_.parameters.endDate,
            actions: proposal_.actions,
            allowFailureMap: 0
        });

        if (isEditor(proposalCreators[proposalId])) {
            // Assuming that the proposer approves (if an editor)
            vote(proposalId, VoteOption.Yes, false);
        }
    }

    /// @notice Creates a proposal to make the DAO remove the given DAO as a subspace.
    /// @param _subspaceDao The address of the DAO that holds the subspace to remove
    /// @param _spacePlugin The address of the space plugin where changes will be executed
    function proposeRemoveSubspace(IDAO _subspaceDao, address _spacePlugin) public onlyMembers {
        if (address(_subspaceDao) == address(0) || _spacePlugin == address(0)) {
            revert EmptyContent();
        }
        uint64 snapshotBlock;
        unchecked {
            snapshotBlock = block.number.toUint64() - 1; // The snapshot block must be mined already to protect the transaction against backrunning transactions causing census changes.
        }
        uint64 _startDate = block.timestamp.toUint64();

        uint256 proposalId = _createProposalId();

        // Store proposal related information
        Proposal storage proposal_ = proposals[proposalId];

        proposal_.parameters.startDate = _startDate;
        proposal_.parameters.endDate = _startDate + duration();
        proposal_.parameters.snapshotBlock = snapshotBlock;
        proposal_.parameters.votingMode = votingMode();
        proposal_.parameters.supportThreshold = supportThreshold();
        proposal_.parameters.minVotingPower = _applyRatioCeiled(
            totalVotingPower(snapshotBlock),
            minParticipation()
        );
        IDAO.Action memory _action = IDAO.Action({
            to: _spacePlugin,
            value: 0,
            data: abi.encodeCall(SpacePlugin.removeSubspace, (address(_subspaceDao)))
        });
        proposal_.actions.push(_action);

        proposalCreators[proposalId] = msg.sender;

        emit ProposalCreated({
            proposalId: proposalId,
            creator: proposalCreators[proposalId],
            metadata: "",
            startDate: _startDate,
            endDate: proposal_.parameters.endDate,
            actions: proposal_.actions,
            allowFailureMap: 0
        });
    }

    /// @notice Creates a proposal to remove an existing member.
    /// @param _metadata The metadata of the proposal.
    /// @param _proposedMember The address of the member who may eveutnally be removed.
    /// @param _spacePlugin The address of the space plugin where changes will be executed
    function proposeRemoveMember(
        bytes calldata _metadata,
        address _proposedMember,
        address _spacePlugin
    ) public onlyMembers {
        if (!isEditor(msg.sender)) {
            revert ProposalCreationForbidden(msg.sender);
        } else if (_spacePlugin == address(0)) {
            revert EmptyContent();
        } else if (!isMember(_proposedMember)) {
            revert AlreadyNotMember(_proposedMember);
        }
        uint64 snapshotBlock;
        unchecked {
            snapshotBlock = block.number.toUint64() - 1; // The snapshot block must be mined already to protect the transaction against backrunning transactions causing census changes.
        }
        uint64 _startDate = block.timestamp.toUint64();

        uint256 proposalId = _createProposalId();

        // Store proposal related information
        Proposal storage proposal_ = proposals[proposalId];

        proposal_.parameters.startDate = _startDate;
        proposal_.parameters.endDate = _startDate + duration();
        proposal_.parameters.snapshotBlock = snapshotBlock;
        proposal_.parameters.votingMode = votingMode();
        proposal_.parameters.supportThreshold = supportThreshold();
        proposal_.parameters.minVotingPower = _applyRatioCeiled(
            totalVotingPower(snapshotBlock),
            minParticipation()
        );
        IDAO.Action memory _action = IDAO.Action({
            to: address(this),
            value: 0,
            data: abi.encodeCall(MainVotingPlugin.removeMember, (_proposedMember))
        });
        proposal_.actions.push(_action);

        proposalCreators[proposalId] = msg.sender;

        emit ProposalCreated({
            proposalId: proposalId,
            creator: proposalCreators[proposalId],
            metadata: _metadata,
            startDate: _startDate,
            endDate: proposal_.parameters.endDate,
            actions: proposal_.actions,
            allowFailureMap: 0
        });
    }

    /// @notice Determines whether at least one editor besides the creator has approved
    /// @param _proposalId The ID of the proposal to check.
    function isMinParticipationReached(uint256 _proposalId) public view override returns (bool) {
        Proposal storage proposal_ = proposals[_proposalId];

        if (proposal_.tally.yes == 0 && proposal_.tally.no == 0 && proposal_.tally.abstain == 0) {
            return false;
        }

        // Just one voter
        if (addresslistLengthAtBlock(proposal_.parameters.snapshotBlock) == 1) {
            return true;
        }

        // More voters expected
        return proposal_.nonCreatorsVoted;
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

        if (proposalCreators[_proposalId] != msg.sender && !proposal_.nonCreatorsVoted) {
            proposal_.nonCreatorsVoted = true;
        }

        if (_tryEarlyExecution && _canExecute(_proposalId)) {
            _execute(_proposalId);
        }
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
    uint256[48] private __gap;
}
