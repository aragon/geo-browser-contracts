// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {PermissionLib} from "@aragon/osx/core/permission/PermissionLib.sol";
import {PluginSetup, IPluginSetup} from "@aragon/osx/framework/plugin/setup/PluginSetup.sol";
import {MainVotingPlugin} from "./MainVotingPlugin.sol";
import {CONTENT_PERMISSION_ID, SUBSPACE_PERMISSION_ID} from "./constants.sol";

/// @title MainVotingPluginSetup
/// @dev Release 1, Build 1
contract MainVotingPluginSetup is PluginSetup {
    address private immutable pluginImplementation;

    constructor() {
        pluginImplementation = address(new MainVotingPlugin());
    }

    /// @inheritdoc IPluginSetup
    function prepareInstallation(
        address _dao,
        bytes memory _data
    ) external returns (address plugin, PreparedSetupData memory preparedSetupData) {
        // Decode incoming params
        string memory firstBlockContentUri = abi.decode(_data, (string));

        // Deploy new plugin instance
        plugin = createERC1967Proxy(
            pluginImplementation,
            abi.encodeWithSelector(MainVotingPlugin.initialize.selector, _dao, firstBlockContentUri)
        );

        PermissionLib.MultiTargetPermission[]
            memory permissions = new PermissionLib.MultiTargetPermission[](2);

        // The DAO can emit content
        permissions[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: CONTENT_PERMISSION_ID
        });
        // The DAO can accept a subspace
        permissions[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: SUBSPACE_PERMISSION_ID
        });
        // The deployer can upgrade the space
        // permissions[2] = PermissionLib.MultiTargetPermission({
        //     operation: PermissionLib.Operation.Grant,
        //     where: plugin,
        //     who: msg.sender,
        //     condition: PermissionLib.NO_CONDITION,
        //     permissionId: UPGRADE_PLUGIN_PERMISSION_ID
        // });

        preparedSetupData.permissions = permissions;
    }

    /// @inheritdoc IPluginSetup
    function prepareUninstallation(
        address _dao,
        SetupPayload calldata _payload
    ) external pure returns (PermissionLib.MultiTargetPermission[] memory permissionChanges) {
        permissionChanges = new PermissionLib.MultiTargetPermission[](2);

        // The DAO can emit content
        permissionChanges[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: CONTENT_PERMISSION_ID
        });
        // The DAO can accept a subspace
        permissionChanges[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: SUBSPACE_PERMISSION_ID
        });
        // The deployer can upgrade the space
        // permissionChanges[2] = PermissionLib.MultiTargetPermission({
        //     operation: PermissionLib.Operation.Revoke,
        //     where: _payload.plugin,
        //     who: msg.sender,
        //     condition: PermissionLib.NO_CONDITION,
        //     permissionId: UPGRADE_PLUGIN_PERMISSION_ID
        // });
    }

    /// @inheritdoc IPluginSetup
    function implementation() external view returns (address) {
        return pluginImplementation;
    }
}
