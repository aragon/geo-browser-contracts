// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {PermissionCondition} from "@aragon/osx/core/permission/PermissionCondition.sol";
import {PermissionManager} from "@aragon/osx/core/permission/PermissionManager.sol";
import {MEMBER_PERMISSION_ID} from "./constants.sol";

/// @notice The condition associated with `TestSharedPlugin`
contract MemberAccessExecuteCondition is PermissionCondition {
    /// @notice The address of the contract where the permission can be granted
    address private targetContract;

    /// @notice The constructor of the condition
    /// @param _targetContract The address of the contract where the permission can be granted
    constructor(address _targetContract) {
        targetContract = _targetContract;
    }

    /// @notice Checks whether the current action wants to grant membership on the predefined address
    function isGranted(
        address _where,
        address _who,
        bytes32 _permissionId,
        bytes calldata _data
    ) external view returns (bool) {
        (_where, _who, _permissionId);

        // Is execute()?
        if (getSelector(_data) != IDAO.execute.selector) {
            return false;
        }

        (, IDAO.Action[] memory _actions, ) = abi.decode(
            _data[4:],
            (bytes32, IDAO.Action[], uint256)
        );

        // Check actions
        if (_actions.length != 1) return false;

        // Decode the call being requested (both have the same parameters)
        (
            bytes4 _requestedSelector,
            address _requestedWhere,
            ,
            bytes32 _requestedPermission
        ) = decodeGrantRevokeCalldata(_actions[0].data);

        if (
            _requestedSelector != PermissionManager.grant.selector &&
            _requestedSelector != PermissionManager.revoke.selector
        ) return false;

        if (_requestedWhere != targetContract) return false;
        else if (_requestedPermission != MEMBER_PERMISSION_ID) return false;

        return true;
    }

    function getSelector(bytes memory _data) public pure returns (bytes4 selector) {
        // Slices are only supported for bytes calldata, not bytes memory
        // Bytes memory requires an assembly block
        assembly {
            selector := mload(add(_data, 0x20)) // 32
        }
    }

    function decodeGrantRevokeCalldata(
        bytes memory _data
    ) public pure returns (bytes4 sig, address where, address who, bytes32 permissionId) {
        // Slicing is only supported for bytes calldata, not bytes memory
        // Bytes memory requires an assembly block
        assembly {
            sig := mload(add(_data, 0x20)) // 32
            where := mload(add(_data, 0x24)) // 32 + 4
            who := mload(add(_data, 0x44)) // 32 + 4 + 32
            permissionId := mload(add(_data, 0x64)) // 32 + 4 + 32 + 32
        }
    }
}
