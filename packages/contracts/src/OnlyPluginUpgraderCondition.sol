// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import {PermissionCondition} from "@aragon/osx/core/permission/PermissionCondition.sol";
import {PermissionManager} from "@aragon/osx/core/permission/PermissionManager.sol";
import {PluginSetupProcessor} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";

/// @notice The condition associated with the `pluginUpgrader`
contract OnlyPluginUpgraderCondition is PermissionCondition {
    bytes32 private constant UPGRADE_PLUGIN_PERMISSION_ID = keccak256("UPGRADE_PLUGIN_PERMISSION");

    /// @notice The address of the DAO contract
    address private dao;
    /// @notice The address of the PluginSetupProcessor contract
    address private psp;
    /// @notice Contracts where the permission can be granted
    mapping(address => bool) private allowedPluginAddresses;

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

        for (uint256 i = 0; i < _targetPluginAddresses.length; ) {
            allowedPluginAddresses[_targetPluginAddresses[i]] = true;

            unchecked {
                i++;
            }
        }
        psp = address(_psp);
        dao = address(_dao);
    }

    /// @notice Checks whether the current action grants update to the PSP, updates a predefined plugin and revokes the update permission
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

        // Unwrap the execute actions
        (, IDAO.Action[] memory _actions, ) = abi.decode(
            _data[4:],
            (bytes32, IDAO.Action[], uint256)
        );

        // Check all actions
        if (_actions.length != 3) return false;

        // Action 1/3: GRANT/REVOKE UPGRADE_PLUGIN_PERMISSION_ID to the PSP on targetPlugis[]
        if (_actions[0].to != dao || _actions[2].to != dao) return false;
        else if (!isValidGrantRevokeCalldata(_actions[0].data, _actions[2].data)) return false;

        // Action 2: CALL PSP.applyUpdate() onto targetPlugins[]
        if (_actions[1].to != psp) return false;
        else if (!isValidApplyUpdateCalldata(_actions[1].data)) return false;

        return true;
    }

    function getSelector(bytes memory _data) public pure returns (bytes4 selector) {
        // Slices are only supported for bytes calldata
        // Bytes memory requires an assembly block
        assembly {
            selector := mload(add(_data, 32))
        }
    }

    function decodeGrantRevokeCalldata(
        bytes memory _data
    ) public pure returns (bytes4 selector, address who, address where, bytes32 permissionId) {
        // Slicing is only supported for bytes calldata, not bytes memory
        // Bytes memory requires an assembly block
        assembly {
            selector := mload(add(_data, 32))
            who := mload(add(_data, 36))
            where := mload(add(_data, 68))
            permissionId := mload(add(_data, 100))
        }
    }

    function decodeApplyUpdateCalldata(
        bytes memory _data
    )
        public
        pure
        returns (
            bytes4 selector,
            address daoAddress,
            PluginSetupProcessor.ApplyUpdateParams memory applyUpdateParams
        )
    {
        // Slicing is only supported for bytes calldata, not bytes memory
        // Bytes memory requires an assembly block
        assembly {
            selector := mload(add(_data, 32))
            daoAddress := mload(add(_data, 36))
            applyUpdateParams := mload(add(_data, 68))
        }
    }

    // Internal helpers

    function isValidGrantRevokeCalldata(
        bytes memory _grantData,
        bytes memory _revokeData
    ) private view returns (bool) {
        // Grant checks
        (
            bytes4 _grantSelector,
            address _grantWhere,
            address _grantWho,
            bytes32 _grantPermission
        ) = decodeGrantRevokeCalldata(_grantData);

        if (_grantSelector != PermissionManager.grant.selector) return false;
        else if (_grantWho != psp) return false;
        else if (_grantPermission != UPGRADE_PLUGIN_PERMISSION_ID) return false;
        else if (!allowedPluginAddresses[_grantWhere]) return false;

        // Revoke checks
        (
            bytes4 _revokeSelector,
            address _revokeWhere,
            address _revokeWho,
            bytes32 _revokePermission
        ) = decodeGrantRevokeCalldata(_revokeData);

        if (_revokeSelector != PermissionManager.revoke.selector) return false;
        else if (_revokeWho != psp) return false;
        else if (_revokePermission != UPGRADE_PLUGIN_PERMISSION_ID) return false;
        else if (!allowedPluginAddresses[_revokeWhere]) return false;

        // Combined checks
        if (_grantWhere != _revokeWhere) return false;

        return true;
    }

    function isValidApplyUpdateCalldata(bytes memory _data) private view returns (bool) {
        (
            bytes4 _selector,
            address _dao,
            PluginSetupProcessor.ApplyUpdateParams memory _applyParams
        ) = decodeApplyUpdateCalldata(_data);

        if (_selector != PluginSetupProcessor.applyUpdate.selector) return false;
        else if (_dao != dao) return false;
        else if (!allowedPluginAddresses[_applyParams.plugin]) return false;

        return true;
    }
}
