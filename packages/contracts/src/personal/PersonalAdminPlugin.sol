// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.8;

import {SafeCastUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {ProposalUpgradeable} from "@aragon/osx/core/plugin/proposal/ProposalUpgradeable.sol";
import {PluginCloneable} from "@aragon/osx/core/plugin/PluginCloneable.sol";
import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {PermissionManager} from "@aragon/osx/core/permission/PermissionManager.sol";
import {SpacePlugin} from "../space/SpacePlugin.sol";
import {IMembers} from "../base/IMembers.sol";
import {IEditors} from "../base/IEditors.sol";
import {PersonalMemberAddHelper} from "./PersonalMemberAddHelper.sol";
import {EDITOR_PERMISSION_ID} from "../constants.sol";

/// @title PersonalAdminPlugin
/// @author Aragon - 2023
/// @notice The admin governance plugin giving execution permission on the DAO to a single address.
contract PersonalAdminPlugin is PluginCloneable, ProposalUpgradeable, IEditors, IMembers {
    using SafeCastUpgradeable for uint256;

    /// @notice The [ERC-165](https://eips.ethereum.org/EIPS/eip-165) interface ID of the contract.
    bytes4 public constant ADMIN_INTERFACE_ID =
        this.initialize.selector ^
            this.executeProposal.selector ^
            this.submitEdits.selector ^
            this.submitAcceptSubspace.selector ^
            this.submitRemoveSubspace.selector ^
            this.proposeAddMember.selector ^
            this.addMember.selector ^
            this.submitRemoveMember.selector ^
            this.submitNewEditor.selector ^
            this.submitRemoveEditor.selector ^
            this.leaveSpace.selector;

    /// @notice The ID of the permission required to call the `addMember` function.
    bytes32 public constant ADD_MEMBER_PERMISSION_ID = keccak256("ADD_MEMBER_PERMISSION");

    /// @notice The address of the plugin where new memberships are approved, using a different set of rules.
    PersonalMemberAddHelper public personalMemberAddHelper;

    /// @notice Whether an address is considered as a space member (not editor)
    mapping(address => bool) internal members;

    /// @notice Thrown when attempting propose membership for an existing member.
    error AlreadyAMember(address _member);

    /// @notice Raised when a wallet who is not an editor or a member attempts to do something
    error NotAMember(address caller);

    modifier onlyMembers() {
        if (!isMember(msg.sender)) {
            revert NotAMember(msg.sender);
        }
        _;
    }

    /// @notice Initializes the contract.
    /// @param _dao The associated DAO.
    /// @dev This method is required to support [ERC-1167](https://eips.ethereum.org/EIPS/eip-1167).
    function initialize(
        IDAO _dao,
        address _initialEditor,
        address _personalMemberAddHelper
    ) external initializer {
        __PluginCloneable_init(_dao);

        emit EditorAdded(address(_dao), _initialEditor);

        personalMemberAddHelper = PersonalMemberAddHelper(_personalMemberAddHelper);
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(
        bytes4 _interfaceId
    ) public view override(PluginCloneable, ProposalUpgradeable) returns (bool) {
        return
            _interfaceId == ADMIN_INTERFACE_ID ||
            _interfaceId == type(IEditors).interfaceId ||
            super.supportsInterface(_interfaceId);
    }

    /// @notice Returns whether the given address holds editor permission on the plugin
    function isEditor(address _account) public view returns (bool) {
        // Does the address hold the permission on the plugin?
        return dao().hasPermission(address(this), _account, EDITOR_PERMISSION_ID, bytes(""));
    }

    /// @notice Returns whether the given address holds membership/editor permission on the plugin
    function isMember(address _account) public view returns (bool) {
        return members[_account] || isEditor(_account);
    }

    /// @notice Creates and executes a new proposal.
    /// @param _metadata The metadata of the proposal.
    /// @param _actions The actions to be executed.
    /// @param _allowFailureMap A bitmap allowing the proposal to succeed, even if individual actions might revert. If the bit at index `i` is 1, the proposal succeeds even if the `i`th action reverts. A failure map value of 0 requires every action to not revert.
    function executeProposal(
        bytes calldata _metadata,
        IDAO.Action[] calldata _actions,
        uint256 _allowFailureMap
    ) external auth(EDITOR_PERMISSION_ID) {
        uint64 _currentTimestamp64 = block.timestamp.toUint64();

        uint256 _proposalId = _createProposal({
            _creator: msg.sender,
            _metadata: _metadata,
            _startDate: _currentTimestamp64,
            _endDate: _currentTimestamp64,
            _actions: _actions,
            _allowFailureMap: _allowFailureMap
        });
        dao().execute(bytes32(_proposalId), _actions, _allowFailureMap);
    }

    /// @notice Creates and executes a proposal that makes the DAO emit new content on the given space.
    /// @param _contentUri The URI of the IPFS content to publish
    /// @param _spacePlugin The address of the space plugin where changes will be executed
    function submitEdits(string memory _contentUri, address _spacePlugin) public onlyMembers {
        IDAO.Action[] memory _actions = new IDAO.Action[](1);

        _actions[0].to = _spacePlugin;
        _actions[0].data = abi.encodeCall(SpacePlugin.publishEdits, (_contentUri));

        uint256 _proposalId = _createProposal(msg.sender, _actions);

        dao().execute(bytes32(_proposalId), _actions, 0);

        // The event will be emitted by the space plugin
    }

    /// @notice Creates and executes a proposal that makes the DAO accept the given DAO as a subspace.
    /// @param _subspaceDao The address of the DAO that holds the new subspace
    /// @param _spacePlugin The address of the space plugin where changes will be executed
    function submitAcceptSubspace(IDAO _subspaceDao, address _spacePlugin) public onlyMembers {
        IDAO.Action[] memory _actions = new IDAO.Action[](1);
        _actions[0].to = _spacePlugin;
        _actions[0].data = abi.encodeCall(SpacePlugin.acceptSubspace, (address(_subspaceDao)));

        uint256 _proposalId = _createProposal(msg.sender, _actions);

        dao().execute(bytes32(_proposalId), _actions, 0);

        // The event will be emitted by the space plugin
    }

    /// @notice Creates and executes a proposal that makes the DAO remove the given DAO as a subspace.
    /// @param _subspaceDao The address of the DAO that holds the subspace to remove
    /// @param _spacePlugin The address of the space plugin where changes will be executed
    function submitRemoveSubspace(IDAO _subspaceDao, address _spacePlugin) public onlyMembers {
        IDAO.Action[] memory _actions = new IDAO.Action[](1);
        _actions[0].to = _spacePlugin;
        _actions[0].data = abi.encodeCall(SpacePlugin.removeSubspace, (address(_subspaceDao)));

        uint256 _proposalId = _createProposal(msg.sender, _actions);

        dao().execute(bytes32(_proposalId), _actions, 0);

        // The event will be emitted by the space plugin
    }

    /// @notice Sets the given address as a member of the space
    /// @param _newMember The address to define as a member
    /// @dev Called by the DAO via the PersonalMemberAddHelper. Not by members or editors.
    function addMember(address _newMember) public auth(ADD_MEMBER_PERMISSION_ID) {
        if (members[_newMember]) {
            revert AlreadyAMember(_newMember);
        }

        members[_newMember] = true;
        emit MemberAdded(address(dao()), _newMember);
    }

    /// @notice Creates and executes a proposal that makes the DAO revoke membership permission from the given address
    /// @param _member The address that will no longer be a member
    function submitRemoveMember(address _member) public auth(EDITOR_PERMISSION_ID) {
        if (!members[_member]) return;

        members[_member] = false;
        emit MemberRemoved(address(dao()), _member);
    }

    /// @notice Creates and executes a proposal that makes the DAO revoke any permission from the sender address
    function leaveSpace() external {
        if (members[msg.sender]) {
            members[msg.sender] = false;
            emit MemberLeft(address(dao()), msg.sender);
        }

        if (isEditor(msg.sender)) {
            IDAO.Action[] memory _actions;
            _actions = new IDAO.Action[](1);
            _actions[0].to = address(dao());
            _actions[0].data = abi.encodeCall(
                PermissionManager.revoke,
                (address(this), msg.sender, EDITOR_PERMISSION_ID)
            );

            uint256 _proposalId = _createProposal(msg.sender, _actions);
            dao().execute(bytes32(_proposalId), _actions, 0);
            emit EditorLeft(address(dao()), msg.sender);
        }
    }

    /// @notice Creates and executes a proposal that makes the DAO grant editor permission to the given address
    /// @param _newEditor The address to grant editor permission to
    function submitNewEditor(address _newEditor) public auth(EDITOR_PERMISSION_ID) {
        IDAO.Action[] memory _actions = new IDAO.Action[](1);
        _actions[0].to = address(dao());
        _actions[0].data = abi.encodeCall(
            PermissionManager.grant,
            (address(this), _newEditor, EDITOR_PERMISSION_ID)
        );

        uint256 _proposalId = _createProposal(msg.sender, _actions);

        dao().execute(bytes32(_proposalId), _actions, 0);

        emit EditorAdded(address(dao()), _newEditor);
    }

    /// @notice Creates and executes a proposal that makes the DAO revoke editor permission from the given address
    /// @param _editor The address that will no longer be an editor
    function submitRemoveEditor(address _editor) public auth(EDITOR_PERMISSION_ID) {
        IDAO.Action[] memory _actions = new IDAO.Action[](1);
        _actions[0].to = address(dao());
        _actions[0].data = abi.encodeCall(
            PermissionManager.revoke,
            (address(this), _editor, EDITOR_PERMISSION_ID)
        );

        uint256 _proposalId = _createProposal(msg.sender, _actions);

        dao().execute(bytes32(_proposalId), _actions, 0);

        emit EditorRemoved(address(dao()), _editor);
    }

    /// @notice Creates a proposal on the PersonalMemberAddHelper to add a new member. If approved, `addMember` will be called back.
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
            personalMemberAddHelper.proposeAddMember(
                _metadataContentUri,
                _proposedMember,
                msg.sender
            );
    }

    // Internal helpers

    /// @notice Internal, simplified function to create a proposal.
    /// @param _creator The address who created the proposal.
    /// @param _actions The actions that will be executed after the proposal passes.
    /// @return proposalId The ID of the proposal.
    function _createProposal(
        address _creator,
        IDAO.Action[] memory _actions
    ) internal returns (uint256 proposalId) {
        proposalId = _createProposalId();
        uint64 _currentTimestamp64 = block.timestamp.toUint64();

        emit ProposalCreated({
            proposalId: proposalId,
            creator: _creator,
            metadata: "",
            startDate: _currentTimestamp64,
            endDate: _currentTimestamp64,
            actions: _actions,
            allowFailureMap: 0
        });
    }
}
