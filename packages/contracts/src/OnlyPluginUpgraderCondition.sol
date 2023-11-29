// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import {PermissionCondition} from "@aragon/osx/core/permission/PermissionCondition.sol";
import {PermissionManager} from "@aragon/osx/core/permission/PermissionManager.sol";
import {PluginSetupProcessor} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {MEMBER_PERMISSION_ID} from "./constants.sol";

/// @notice The condition associated with the `pluginUpgrader`
contract OnlyPluginUpgraderCondition is PermissionCondition {
    bytes32 private constant UPGRADE_PLUGIN_PERMISSION_ID = keccak256("UPGRADE_PLUGIN_PERMISSION");

    /// @notice The address of the DAO contract
    address private dao;
    /// @notice The address of the PluginSetupProcessor contract
    address private psp;
    /// @notice The address of the contract where the permission can be granted
    address[] private targetPluginAddresses;

    /// @notice Thrown when the constructor receives empty parameters
    error InvalidParameters();

    /// @notice The constructor of the condition
    /// @param _targetPluginAddresses The addresses of the contracts where upgradeTo and upgradeToAndCall can be called
    constructor(DAO _dao, PluginSetupProcessor _psp, address[] memory _targetPluginAddresses) {
        if (
            address(_dao) == address(0) ||
            address(_psp) == address(0) ||
            _targetPluginAddresses.length == 0
        ) {
            revert InvalidParameters();
        }
        targetPluginAddresses = _targetPluginAddresses;
        psp = address(_psp);
        dao = address(_dao);
    }

    function getSelector(bytes memory _data) public pure returns (bytes4 selector) {
        // Slices are only supported for bytes calldata
        // Bytes memory requires an assembly block
        assembly {
            selector := mload(add(_data, 32))
        }
    }

    /// @notice Checks whether the current action wants to grant membership on the predefined address
    function isGranted(
        address _where,
        address _who,
        bytes32 _permissionId,
        bytes calldata _data
    ) external view returns (bool) {
        (_where, _who, _permissionId);

        bytes4 _requestedFuncSig = getSelector(_data);
        if (_requestedFuncSig != IDAO.execute.selector) {
            return false;
        }

        (, IDAO.Action[] memory _actions, ) = abi.decode(
            _data[4:],
            (bytes32, IDAO.Action[], uint256)
        );

        // Check all actions
        if (_actions.length != 3) return false;

        // Action 1: GRANT UPGRADE_PLUGIN_PERMISSION_ID to the PSP on targetPlugis[]
        _requestedFuncSig = getSelector(_actions[0].data);
        if (_requestedFuncSig != PermissionManager.grant.selector) return false;
        else if (_actions[0].to != dao) return false;
        else if (!isValidExecuteGrantRevokeCalldata(_actions[0].data)) return false;

        // Action 2: CALL PSP.applyUpdate() onto targetPlugins[]
        _requestedFuncSig = getSelector(_actions[1].data);
        if (_requestedFuncSig != PluginSetupProcessor.applyUpdate.selector) return false;
        else if (_actions[1].to != psp) return false;
        else if (!isValidExecuteApplyUpdateCalldata(_actions[1].data)) return false;

        // Action 3: REVOKE UPGRADE_PLUGIN_PERMISSION_ID to the PSP on targetPlugis[]
        _requestedFuncSig = getSelector(_actions[2].data);
        if (_requestedFuncSig != PermissionManager.revoke.selector) return false;
        else if (_actions[2].to != dao) return false;
        else if (!isValidExecuteGrantRevokeCalldata(_actions[2].data)) return false;

        return true;
    }

    // Internal helpers

    function isValidExecuteGrantRevokeCalldata(bytes memory _data) private view returns (bool) {
        // Decode the call being requested
        (, address _requestedWhere, address _requestedWho, bytes32 _requestedPermission) = abi
            .decode(
                _data,
                (bytes4 /*funcSig*/, address /*where*/, address /*who*/, bytes32 /*perm*/)
            );

        if (_requestedPermission != UPGRADE_PLUGIN_PERMISSION_ID) return false;
        else if (_requestedWho != psp) return false;

        // Search the first match
        for (uint256 j = 0; j < targetPluginAddresses.length; ) {
            if (_requestedWhere == targetPluginAddresses[j]) return true;

            unchecked {
                j++;
            }
        }
        return false;
    }

    function isValidExecuteApplyUpdateCalldata(bytes memory _data) private view returns (bool) {
        //
        (, address _dao, PluginSetupProcessor.ApplyUpdateParams memory _applyParams) = abi.decode(
            _data,
            (bytes4, address, PluginSetupProcessor.ApplyUpdateParams)
        );

        if (_dao != dao) return false;

        // Search the first match
        for (uint256 j = 0; j < targetPluginAddresses.length; ) {
            if (_applyParams.plugin != targetPluginAddresses[j]) return false;

            unchecked {
                j++;
            }
        }
        return true;
    }
}
