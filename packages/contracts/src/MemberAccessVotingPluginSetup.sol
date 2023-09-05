// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {PermissionLib} from "@aragon/osx/core/permission/PermissionLib.sol";
import {PluginSetup, IPluginSetup} from "@aragon/osx/framework/plugin/setup/PluginSetup.sol";
import {MemberAccessVotingPlugin, UPDATE_MULTISIG_SETTINGS_PERMISSION_ID} from "./MemberAccessVotingPlugin.sol";
import {MemberAccessVotingCondition} from "./MemberAccessVotingCondition.sol";

/// @title MemberAccessPluginSetup
/// @dev Release 1, Build 1
contract MemberAccessPluginSetup is PluginSetup {
    address private immutable pluginImplementation;
    bytes32 public constant EXECUTE_PERMISSION_ID = keccak256("EXECUTE_PERMISSION");

    constructor() {
        pluginImplementation = address(new MemberAccessVotingPlugin());
    }

    /// @inheritdoc IPluginSetup
    function prepareInstallation(
        address _dao,
        bytes memory _data
    ) external returns (address plugin, PreparedSetupData memory preparedSetupData) {
        (
            address mainVotingPlugin,
            MemberAccessVotingPlugin.MultisigSettings memory _multisigSettings
        ) = abi.decode(_data, (address, MemberAccessVotingPlugin.MultisigSettings));

        plugin = createERC1967Proxy(
            pluginImplementation,
            abi.encodeWithSelector(
                MemberAccessVotingPlugin.initialize.selector,
                _dao,
                _multisigSettings
            )
        );

        // Condition contract
        address conditionContract = address(new MemberAccessVotingCondition(mainVotingPlugin));

        PermissionLib.MultiTargetPermission[]
            memory permissions = new PermissionLib.MultiTargetPermission[](2);

        // The plugin needs to execute on the DAO
        permissions[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: _dao,
            who: plugin,
            condition: conditionContract,
            permissionId: EXECUTE_PERMISSION_ID
        });

        // The DAO needs to be able to update the plugin settings
        permissions[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: UPDATE_MULTISIG_SETTINGS_PERMISSION_ID
        });

        preparedSetupData.permissions = permissions;
    }

    /// @inheritdoc IPluginSetup
    function prepareUninstallation(
        address _dao,
        SetupPayload calldata _payload
    ) external pure returns (PermissionLib.MultiTargetPermission[] memory permissions) {
        permissions = new PermissionLib.MultiTargetPermission[](2);

        permissions[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _dao,
            who: _payload.plugin,
            condition: PermissionLib.NO_CONDITION,
            permissionId: EXECUTE_PERMISSION_ID
        });
        permissions[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: UPDATE_MULTISIG_SETTINGS_PERMISSION_ID
        });
    }

    /// @inheritdoc IPluginSetup
    function implementation() external view returns (address) {
        return pluginImplementation;
    }
}
