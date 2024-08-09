// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {SafeCastUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {PermissionManager} from "@aragon/osx/core/permission/PermissionManager.sol";
import {ProposalUpgradeable} from "@aragon/osx/core/plugin/proposal/ProposalUpgradeable.sol";
import {PluginCloneable} from "@aragon/osx/core/plugin/PluginCloneable.sol";
import {IEditors} from "../base/IEditors.sol";
import {PersonalAdminPlugin} from "./PersonalAdminPlugin.sol";

bytes4 constant PERSONAL_MEMBER_ADD_INTERFACE_ID = PersonalMemberAddHelper.initialize.selector ^
    PersonalMemberAddHelper.updateSettings.selector ^
    PersonalMemberAddHelper.proposeAddMember.selector ^
    PersonalMemberAddHelper.getProposal.selector;

/// @title Personal access plugin (SingleApproval) - Release 1, Build 1
/// @author Aragon - 2024
/// @notice The on-chain governance plugin in which a proposal passes when approved by the first editor
contract PersonalMemberAddHelper is PluginCloneable, ProposalUpgradeable {
    using SafeCastUpgradeable for uint256;

    /// @notice The ID of the permission required to call the `addAddresses` functions.
    bytes32 public constant UPDATE_SETTINGS_PERMISSION_ID = keccak256("UPDATE_SETTINGS_PERMISSION");

    /// @notice The ID of the permission required to create new membership proposals.
    bytes32 public constant PROPOSER_PERMISSION_ID = keccak256("PROPOSER_PERMISSION");

    /// @notice A container for proposal-related information.
    /// @param executed Whether the proposal is executed or not.
    /// @param approvals The number of approvals casted.
    /// @param parameters The proposal-specific approve settings at the time of the proposal creation.
    /// @param approvers The approves casted by the approvers.
    /// @param actions The actions to be executed when the proposal passes.
    /// @param destinationPlugin The address of the plugin where addMember should be called.
    /// @param failsafeActionMap A bitmap allowing the proposal to succeed, even if certain actions might revert. If the bit at index `i` is 1, the proposal succeeds even if the `i`th action reverts. A failure map value of 0 requires every action to not revert.
    struct Proposal {
        bool executed;
        ProposalParameters parameters;
        IDAO.Action[] actions;
        PersonalAdminPlugin destinationPlugin;
        uint256 failsafeActionMap;
    }

    /// @notice A container for the proposal parameters.
    /// @param startDate The timestamp when the proposal starts.
    /// @param endDate The timestamp when the proposal expires.
    struct ProposalParameters {
        uint64 startDate;
        uint64 endDate;
    }

    /// @notice A container for the plugin settings.
    /// @param proposalDuration The amount of time before a non-approved proposal expires.
    struct Settings {
        uint64 proposalDuration;
    }

    /// @notice A mapping between proposal IDs and proposal information.
    mapping(uint256 => Proposal) internal proposals;

    /// @notice The current plugin settings.
    Settings public settings;

    /// @notice Keeps track at which block number the plugin settings have been changed the last time.
    /// @dev This variable prevents a proposal from being created in the same block in which the plugin settings change.
    uint64 public lastSettingsChange;

    /// @notice Thrown when creating a proposal at the same block that the settings were changed.
    error ProposalCreationForbiddenOnSameBlock();

    /// @notice Thrown if an approver is not allowed to cast an approve. This can be because the proposal
    /// - is not open,
    /// - was executed, or
    /// - the approver is not on the address list
    /// @param proposalId The ID of the proposal.
    /// @param sender The address of the sender.
    error ApprovalCastForbidden(uint256 proposalId, address sender);

    /// @notice Thrown if the proposal execution is forbidden.
    /// @param proposalId The ID of the proposal.
    error ProposalExecutionForbidden(uint256 proposalId);

    /// @notice Thrown when called from an incompatible contract.
    error InvalidInterface();

    /// @notice Emitted when a proposal is approved by an editor.
    /// @param proposalId The ID of the proposal.
    /// @param editor The editor casting the approve.
    event Approved(uint256 indexed proposalId, address indexed editor);

    /// @notice Emitted when a proposal is rejected by an editor.
    /// @param proposalId The ID of the proposal.
    /// @param editor The editor casting the rejection.
    event Rejected(uint256 indexed proposalId, address indexed editor);

    /// @notice Emitted when the plugin settings are set.
    /// @param proposalDuration The amount of time before a non-approved proposal expires.
    event SettingsUpdated(uint64 proposalDuration);

    /// @notice Initializes Release 1, Build 1.
    /// @dev This method is required to support [ERC-1822](https://eips.ethereum.org/EIPS/eip-1822).
    /// @param _dao The IDAO interface of the associated DAO.
    /// @param _Settings The multisig settings.
    function initialize(IDAO _dao, Settings calldata _Settings) external virtual initializer {
        __PluginCloneable_init(_dao);

        _updateSettings(_Settings);
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(
        bytes4 _interfaceId
    ) public view virtual override(PluginCloneable, ProposalUpgradeable) returns (bool) {
        return
            _interfaceId == PERSONAL_MEMBER_ADD_INTERFACE_ID ||
            super.supportsInterface(_interfaceId);
    }

    /// @notice Updates the plugin settings.
    /// @param _Settings The new settings.
    function updateSettings(
        Settings calldata _Settings
    ) external auth(UPDATE_SETTINGS_PERMISSION_ID) {
        _updateSettings(_Settings);
    }

    /// @notice Creates a proposal to add a new member.
    /// @param _metadata The metadata of the proposal.
    /// @param _proposedMember The address of the member who may eventually be added.
    /// @param _proposer The address to use as the proposal creator.
    /// @return proposalId The ID of the proposal.
    function proposeAddMember(
        bytes calldata _metadata,
        address _proposedMember,
        address _proposer
    ) public auth(PROPOSER_PERMISSION_ID) returns (uint256 proposalId) {
        // Check that the caller supports the `addMember` function
        if (!PersonalAdminPlugin(msg.sender).supportsInterface(type(IEditors).interfaceId)) {
            revert InvalidInterface();
        }

        // Build the list of actions
        IDAO.Action[] memory _actions = new IDAO.Action[](1);

        _actions[0] = IDAO.Action({
            to: address(msg.sender), // We are called by the PersonalAdminPlugin
            value: 0,
            data: abi.encodeCall(PersonalAdminPlugin.addMember, (_proposedMember))
        });

        // Create proposal
        uint64 snapshotBlock;
        unchecked {
            snapshotBlock = block.number.toUint64() - 1; // The snapshot block must be mined already to protect the transaction against backrunning transactions causing census changes.
        }

        // Revert if the settings have been changed in the same block as this proposal should be created in.
        // This prevents a malicious party from voting with previous addresses and the new settings.
        if (lastSettingsChange > snapshotBlock) {
            revert ProposalCreationForbiddenOnSameBlock();
        }

        uint64 _startDate = block.timestamp.toUint64();
        uint64 _endDate = _startDate + settings.proposalDuration;

        proposalId = _createProposalId();

        emit ProposalCreated({
            proposalId: proposalId,
            creator: _proposer,
            metadata: _metadata,
            startDate: _startDate,
            endDate: _endDate,
            actions: _actions,
            allowFailureMap: uint8(0)
        });

        // Create the proposal
        Proposal storage proposal_ = proposals[proposalId];

        proposal_.parameters.startDate = _startDate;
        proposal_.parameters.endDate = _endDate;

        proposal_.destinationPlugin = PersonalAdminPlugin(msg.sender);
        for (uint256 i; i < _actions.length; ) {
            proposal_.actions.push(_actions[i]);
            unchecked {
                ++i;
            }
        }

        // An editor needs to approve. If the proposer is an editor, approve right away.
        if (PersonalAdminPlugin(msg.sender).isEditor(_proposer)) {
            _approve(proposalId, _proposer);
        }
    }

    /// @param _proposalId The Id of the proposal to approve.
    function approve(uint256 _proposalId) public {
        _approve(_proposalId, msg.sender);
    }

    /// @notice Internal implementation, allowing proposeAddMember() to specify the approver.
    function _approve(uint256 _proposalId, address _approver) internal {
        if (!_canApprove(_proposalId, _approver)) {
            revert ApprovalCastForbidden(_proposalId, _approver);
        }

        emit Approved({proposalId: _proposalId, editor: _approver});

        _execute(_proposalId);
    }

    /// @notice Rejects the given proposal immediately.
    /// @param _proposalId The Id of the proposal to reject.
    function reject(uint256 _proposalId) public {
        if (!_canApprove(_proposalId, msg.sender)) {
            revert ApprovalCastForbidden(_proposalId, msg.sender);
        }

        Proposal storage proposal_ = proposals[_proposalId];

        // Prevent any further approvals, expire it
        proposal_.parameters.endDate = block.timestamp.toUint64();

        emit Rejected({proposalId: _proposalId, editor: msg.sender});
    }

    function canApprove(uint256 _proposalId, address _account) external view returns (bool) {
        return _canApprove(_proposalId, _account);
    }

    /// @notice Returns all information for a proposal vote by its ID.
    /// @param _proposalId The ID of the proposal.
    /// @return executed Whether the proposal is executed or not.
    /// @return parameters The parameters of the proposal vote.
    /// @return actions The actions to be executed in the associated DAO after the proposal has passed.
    /// @param failsafeActionMap A bitmap allowing the proposal to succeed, even if individual actions might revert. If the bit at index `i` is 1, the proposal succeeds even if the `i`th action reverts. A failure map value of 0 requires every action to not revert.
    function getProposal(
        uint256 _proposalId
    )
        public
        view
        returns (
            bool executed,
            ProposalParameters memory parameters,
            IDAO.Action[] memory actions,
            uint256 failsafeActionMap
        )
    {
        Proposal storage proposal_ = proposals[_proposalId];

        executed = proposal_.executed;
        parameters = proposal_.parameters;
        actions = proposal_.actions;
        failsafeActionMap = proposal_.failsafeActionMap;
    }

    /// @notice Internal function to execute a vote. It assumes the queried proposal exists.
    /// @param _proposalId The ID of the proposal.
    function _execute(uint256 _proposalId) internal {
        Proposal storage proposal_ = proposals[_proposalId];

        proposal_.executed = true;

        _executeProposal(
            dao(),
            _proposalId,
            proposals[_proposalId].actions,
            proposals[_proposalId].failsafeActionMap
        );
    }

    /// @notice Internal function to check if an account can approve. It assumes the queried proposal exists.
    /// @param _proposalId The ID of the proposal.
    /// @param _account The account to check.
    /// @return Returns `true` if the given account can approve on a certain proposal and `false` otherwise.
    function _canApprove(uint256 _proposalId, address _account) internal view returns (bool) {
        Proposal storage proposal_ = proposals[_proposalId];

        if (!_isProposalOpen(proposal_)) {
            // The proposal was executed already
            return false;
        } else if (!proposal_.destinationPlugin.isEditor(_account)) {
            // The approver has no voting power.
            return false;
        }

        return true;
    }

    /// @notice Internal function to check if a proposal vote is still open.
    /// @param proposal_ The proposal struct.
    /// @return True if the proposal vote is open, false otherwise.
    function _isProposalOpen(Proposal storage proposal_) internal view returns (bool) {
        uint64 currentTimestamp64 = block.timestamp.toUint64();
        return
            !proposal_.executed &&
            proposal_.parameters.startDate <= currentTimestamp64 &&
            proposal_.parameters.endDate >= currentTimestamp64;
    }

    /// @notice Internal function to update the plugin settings.
    /// @param _Settings The new settings.
    function _updateSettings(Settings calldata _Settings) internal {
        settings = _Settings;
        lastSettingsChange = block.number.toUint64();

        emit SettingsUpdated({proposalDuration: _Settings.proposalDuration});
    }
}
