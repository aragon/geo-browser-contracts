// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.8;

import {IDAO, PluginUUPSUpgradeable} from "@aragon/osx/core/plugin/PluginUUPSUpgradeable.sol";
import {SafeCastUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {RATIO_BASE, _applyRatioCeiled} from "@aragon/osx/plugins/utils/Ratio.sol";
import {IMajorityVoting} from "@aragon/osx/plugins/governance/majority-voting/IMajorityVoting.sol";
import {MajorityVotingBase} from "@aragon/osx/plugins/governance/majority-voting/MajorityVotingBase.sol";
import {MEMBER_PERMISSION_ID, EDITOR_PERMISSION_ID, UPDATE_ADDRESSES_PERMISSION_ID} from "./constants.sol";

bytes4 constant MAIN_SPACE_VOTING_INTERFACE_ID = MainVotingPlugin.initialize.selector ^
    MainVotingPlugin.editorAdded.selector ^
    MainVotingPlugin.editorRemoved.selector ^
    MainVotingPlugin.isMember.selector ^
    MainVotingPlugin.isEditor.selector;

/// @title MainVotingPlugin
/// @author Aragon Association - 2021-2023.
/// @notice The majority voting implementation using a list of member addresses.
/// @dev This contract inherits from `MajorityVotingBase` and implements the `IMajorityVoting` interface.
contract MainVotingPlugin is MajorityVotingBase {
    using SafeCastUpgradeable for uint256;

    /// @notice The amount of editors added by this plugin
    uint256 public editorCount;

    /// @notice Emitted when an editor has been reported as added
    event EditorAdded(address editor);

    /// @notice Emitted when an editor has been reported as removed
    event EditorRemoved(address editor);

    /// @notice Thrown when reporting a new editor who doesn't hold EDITOR_PERMISSION_ID.
    error NotAnEditorYet();

    /// @notice Thrown when reporting a removed editor who still holds EDITOR_PERMISSION_ID.
    error StillAnEditor();

    /// @notice Thrown if reporting a removed editor, when there would be no editors left.
    error NoEditorsLeft();

    /// @notice Initializes the component.
    /// @dev This method is required to support [ERC-1822](https://eips.ethereum.org/EIPS/eip-1822).
    /// @param _dao The IDAO interface of the associated DAO.
    /// @param _votingSettings The voting settings.
    function initialize(
        IDAO _dao,
        VotingSettings calldata _votingSettings,
        address _initialEditor
    ) external initializer {
        __MajorityVotingBase_init(_dao, _votingSettings);

        _editorAdded(_initialEditor);
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(bytes4 _interfaceId) public view virtual override returns (bool) {
        return
            _interfaceId == MAIN_SPACE_VOTING_INTERFACE_ID || super.supportsInterface(_interfaceId);
    }

    /// @notice The function proposeNewEditor creates an action to call this function after an editor is added.
    /// @param _editor The address of the new editor
    /// @dev This function is also used during the plugin initialization.
    function editorAdded(address _editor) external auth(UPDATE_ADDRESSES_PERMISSION_ID) {
        _editorAdded(_editor);
    }

    /// @notice The function proposeRemoveEditor creates an action to call this function after an editor is removed.
    /// @param _editor The addresses of the members to be removed.
    function editorRemoved(address _editor) external auth(UPDATE_ADDRESSES_PERMISSION_ID) {
        _editorRemoved(_editor);
    }

    /// @inheritdoc MajorityVotingBase
    /// @notice Warning: the snapshot block feature is not available here, since the condition of being an editor depends on permissions, which don't support snapshotting.
    function totalVotingPower(uint256) public view override returns (uint256) {
        return editorCount;
    }

    /// @notice Returns whether the given address holds membership permission on the main voting plugin
    function isMember(address _account) public view returns (bool) {
        return
            dao().hasPermission(address(this), _account, MEMBER_PERMISSION_ID, bytes("")) ||
            isEditor(_account);
    }

    /// @notice Returns whether the given address holds editor permission on the main voting plugin
    function isEditor(address _account) public view returns (bool) {
        return dao().hasPermission(address(this), _account, EDITOR_PERMISSION_ID, bytes(""));
    }

    /// @inheritdoc MajorityVotingBase
    function createProposal(
        bytes calldata _metadata,
        IDAO.Action[] calldata _actions,
        uint256 _allowFailureMap,
        uint64 _startDate,
        uint64 _endDate,
        VoteOption _voteOption,
        bool _tryEarlyExecution
    ) external override returns (uint256 proposalId) {
        if (!isEditor(_msgSender())) {
            revert ProposalCreationForbidden(_msgSender());
        }

        uint64 snapshotBlock;
        unchecked {
            snapshotBlock = block.number.toUint64() - 1; // The snapshot block must be mined already to protect the transaction against backrunning transactions causing census changes.
        }

        (_startDate, _endDate) = _validateProposalDates(_startDate, _endDate);

        proposalId = _createProposal({
            _creator: _msgSender(),
            _metadata: _metadata,
            _startDate: _startDate,
            _endDate: _endDate,
            _actions: _actions,
            _allowFailureMap: _allowFailureMap
        });

        // Store proposal related information
        Proposal storage proposal_ = proposals[proposalId];

        proposal_.parameters.startDate = _startDate;
        proposal_.parameters.endDate = _endDate;
        proposal_.parameters.snapshotBlock = snapshotBlock;
        proposal_.parameters.votingMode = votingMode();
        proposal_.parameters.supportThreshold = supportThreshold();
        proposal_.parameters.minVotingPower = _applyRatioCeiled(
            totalVotingPower(snapshotBlock),
            minParticipation()
        );

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
        if (!isEditor(_account)) {
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

    function _editorAdded(address _editor) internal {
        if (!isEditor(_editor)) {
            revert NotAnEditorYet();
        }

        editorCount++;
        emit EditorAdded({editor: _editor});
    }

    function _editorRemoved(address _editor) internal {
        if (isEditor(_editor)) {
            revert StillAnEditor();
        } else if (editorCount <= 1) {
            revert NoEditorsLeft();
        }

        editorCount--;
        emit EditorRemoved({editor: _editor});
    }

    /// @dev This empty reserved space is put in place to allow future versions to add new
    /// variables without shifting down storage in the inheritance chain.
    /// https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[50] private __gap;
}
