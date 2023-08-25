// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {PluginSetup, IPluginSetup} from "@aragon/osx/framework/plugin/setup/PluginSetup.sol";
import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {PermissionLib} from "@aragon/osx/core/permission/PermissionLib.sol";
import {PersonalSpaceVotingPlugin} from "./PersonalSpaceVotingPlugin.sol";

/// @title PersonalSpaceVotingPluginSetup
/// @author Aragon Association - 2022-2023
/// @notice The setup contract of the `PersonalSpaceVotingPlugin` plugin.
contract PersonalSpaceVotingPluginSetup is PluginSetup {
    using Clones for address;

    /// @notice The address of the `PersonalSpaceVotingPlugin` plugin logic contract to be cloned.
    address private immutable implementation_;

    /// @notice Thrown if the admin address is zero.
    /// @param admin The admin address.
    error EditorAddressInvalid(address admin);

    /// @notice The constructor setting the `PersonalSpaceVotingPlugin` implementation contract to clone from.
    constructor() {
        implementation_ = address(new PersonalSpaceVotingPlugin());
    }

    /// @inheritdoc IPluginSetup
    function prepareInstallation(
        address _dao,
        bytes calldata _data
    ) external returns (address plugin, PreparedSetupData memory preparedSetupData) {
        // Decode `_data` to extract the params needed for cloning and initializing the `PersonalSpaceVotingPlugin` plugin.
        address admin = abi.decode(_data, (address));

        if (admin == address(0)) {
            revert EditorAddressInvalid({admin: admin});
        }

        // Clone plugin contract.
        plugin = implementation_.clone();

        // Initialize cloned plugin contract.
        PersonalSpaceVotingPlugin(plugin).initialize(IDAO(_dao));

        // Prepare permissions
        PermissionLib.MultiTargetPermission[]
            memory permissions = new PermissionLib.MultiTargetPermission[](2);

        // Grant `ADMIN_EXECUTE_PERMISSION` of the plugin to the admin.
        permissions[0] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Grant,
            plugin,
            admin,
            PermissionLib.NO_CONDITION,
            PersonalSpaceVotingPlugin(plugin).EDITOR_PERMISSION_ID()
        );

        // Grant `EXECUTE_PERMISSION` on the DAO to the plugin.
        permissions[1] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Grant,
            _dao,
            plugin,
            PermissionLib.NO_CONDITION,
            DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        );

        preparedSetupData.permissions = permissions;
    }

    /// @inheritdoc IPluginSetup
    /// @dev Currently, there is no reliable way to revoke the `ADMIN_EXECUTE_PERMISSION_ID` from all addresses it has been granted to. Accordingly, only the `EXECUTE_PERMISSION_ID` is revoked for this uninstallation.
    function prepareUninstallation(
        address _dao,
        SetupPayload calldata _payload
    ) external view returns (PermissionLib.MultiTargetPermission[] memory permissions) {
        // Prepare permissions
        permissions = new PermissionLib.MultiTargetPermission[](1);

        permissions[0] = PermissionLib.MultiTargetPermission(
            PermissionLib.Operation.Revoke,
            _dao,
            _payload.plugin,
            PermissionLib.NO_CONDITION,
            DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        );
    }

    /// @inheritdoc IPluginSetup
    function implementation() external view returns (address) {
        return implementation_;
    }
}
