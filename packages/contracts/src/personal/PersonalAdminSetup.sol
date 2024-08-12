// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {PluginSetup, IPluginSetup} from "@aragon/osx/framework/plugin/setup/PluginSetup.sol";
import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {PermissionLib} from "@aragon/osx/core/permission/PermissionLib.sol";
import {PersonalAdminPlugin} from "./PersonalAdminPlugin.sol";
import {PersonalMemberAddHelper} from "./PersonalMemberAddHelper.sol";
import {ExecuteSelectorCondition} from "../conditions/ExecuteSelectorCondition.sol";
import {EDITOR_PERMISSION_ID} from "../constants.sol";

uint64 constant MEMBER_ADD_PROPOSAL_DURATION = 7 days;

/// @title PersonalAdminSetup
/// @author Aragon - 2023
/// @notice The setup contract of the `PersonalAdminPlugin` plugin.
contract PersonalAdminSetup is PluginSetup {
    using Clones for address;

    /// @notice The address of the `PersonalAdminPlugin` plugin logic contract to be cloned.
    address private immutable pluginImplementation;
    address public immutable helperImplementation;

    /// @notice Thrown if the editor address is zero.
    /// @param editor The initial editor address.
    error EditorAddressInvalid(address editor);

    /// @notice The constructor setting the `PersonalAdminPlugin` and `PersonalMemberAddHelper` implementation contract to clone from.
    constructor() {
        pluginImplementation = address(new PersonalAdminPlugin());
        helperImplementation = address(new PersonalMemberAddHelper());
    }

    /// @inheritdoc IPluginSetup
    function prepareInstallation(
        address _dao,
        bytes calldata _data
    ) external returns (address plugin, PreparedSetupData memory preparedSetupData) {
        // Decode `_data` to extract the params needed for cloning and initializing the `PersonalAdminPlugin` plugin.
        address editor = decodeInstallationParams(_data);

        if (editor == address(0)) {
            revert EditorAddressInvalid({editor: editor});
        }

        // Clone the contracts
        plugin = pluginImplementation.clone();
        address helper = helperImplementation.clone();

        // Initialize the cloned contracts
        PersonalAdminPlugin(plugin).initialize(IDAO(_dao), editor, helper);

        PersonalMemberAddHelper.Settings memory _helperSettings = PersonalMemberAddHelper.Settings({
            proposalDuration: MEMBER_ADD_PROPOSAL_DURATION
        });
        PersonalMemberAddHelper(helper).initialize(IDAO(_dao), _helperSettings);

        // Condition contract (helper can only execute addMember on the plugin)
        address _executeSelectorCondition = address(
            new ExecuteSelectorCondition(plugin, PersonalAdminPlugin.addMember.selector)
        );

        // Prepare permissions
        PermissionLib.MultiTargetPermission[]
            memory permissions = new PermissionLib.MultiTargetPermission[](6);

        // The plugin has `EXECUTE_PERMISSION` on the DAO.
        permissions[0] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Grant,
            _dao,
            plugin,
            PermissionLib.NO_CONDITION,
            DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        );
        // The first editor has `EDITOR_PERMISSION` on the plugin
        permissions[1] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Grant,
            plugin,
            editor,
            PermissionLib.NO_CONDITION,
            EDITOR_PERMISSION_ID
        );
        // The plugin has `PROPOSER_PERMISSION` on the helper
        permissions[2] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Grant,
            helper,
            plugin,
            PermissionLib.NO_CONDITION,
            PersonalMemberAddHelper(helper).PROPOSER_PERMISSION_ID()
        );
        // The helper has conditional `EXECUTE_PERMISSION` on the DAO.
        permissions[3] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Grant,
            _dao,
            helper,
            // Conditional execution
            _executeSelectorCondition,
            DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        );
        // The DAO has `ADD_MEMBER_PERMISSION` on the plugin
        permissions[4] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Grant,
            plugin,
            _dao,
            PermissionLib.NO_CONDITION,
            PersonalAdminPlugin(plugin).ADD_MEMBER_PERMISSION_ID()
        );
        // The DAO has `UPDATE_SETTINGS_PERMISSION_ID` on the helper.
        permissions[5] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Grant,
            helper,
            _dao,
            PermissionLib.NO_CONDITION,
            PersonalMemberAddHelper(helper).UPDATE_SETTINGS_PERMISSION_ID()
        );

        preparedSetupData.permissions = permissions;

        preparedSetupData.helpers = new address[](1);
        preparedSetupData.helpers[0] = helper;
    }

    /// @inheritdoc IPluginSetup
    /// @dev There is no reliable way to revoke `EDITOR_PERMISSION_ID` from all addresses it has been granted to. Removing `EXECUTE_PERMISSION_ID` only, as being an editor or a member is useless without EXECUTE.
    function prepareUninstallation(
        address _dao,
        SetupPayload calldata _payload
    ) external view returns (PermissionLib.MultiTargetPermission[] memory permissions) {
        // Prepare permissions
        permissions = new PermissionLib.MultiTargetPermission[](2);

        // Revoke EXECUTE on the DAO
        permissions[0] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Revoke,
            _dao,
            _payload.plugin,
            PermissionLib.NO_CONDITION,
            DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        );
        // Revoke conditional EXECUTE on the DAO
        permissions[1] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Revoke,
            _dao,
            _payload.currentHelpers[0],
            address(0),
            DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        );
    }

    /// @inheritdoc IPluginSetup
    function implementation() external view returns (address) {
        return pluginImplementation;
    }

    /// @notice Encodes the given installation parameters into a byte array
    function encodeInstallationParams(address _initialEditor) public pure returns (bytes memory) {
        return abi.encode(_initialEditor);
    }

    /// @notice Decodes the given byte array into the original installation parameters
    function decodeInstallationParams(
        bytes memory _data
    ) public pure returns (address initialEditor) {
        (initialEditor) = abi.decode(_data, (address));
    }
}
