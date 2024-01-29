// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {PermissionCondition} from "@aragon/osx/core/permission/PermissionCondition.sol";
import {PermissionManager} from "@aragon/osx/core/permission/PermissionManager.sol";
import {MEMBER_PERMISSION_ID} from "../constants.sol";
import {MainVotingPlugin} from "../governance/MainVotingPlugin.sol";

/// @notice The condition associated with `TestSharedPlugin`
contract MemberAccessExecuteCondition is PermissionCondition {
    /// @notice The address of the contract where the permission can be granted
    address private targetContract;

    /// @notice The constructor of the condition
    /// @param _targetContract The address of the contract where the permission can be granted
    constructor(address _targetContract) {
        targetContract = _targetContract;
    }

    /// @notice Checks whether the current action attempts to add or remove members
    function isGranted(
        address _where,
        address _who,
        bytes32 _permissionId,
        bytes calldata _data
    ) external view returns (bool) {
        (_where, _who, _permissionId);

        if (
            getSelector(_data) != MainVotingPlugin.addMember.selector &&
            getSelector(_data) != MainVotingPlugin.removeMember.selector
        ) {
            return false;
        } else if (_where != targetContract) {
            return false;
        }

        return true;
    }

    function getSelector(bytes memory _data) public pure returns (bytes4 selector) {
        // Slices are only supported for bytes calldata, not bytes memory
        // Bytes memory requires an assembly block
        assembly {
            selector := mload(add(_data, 0x20)) // 32
        }
    }
}
