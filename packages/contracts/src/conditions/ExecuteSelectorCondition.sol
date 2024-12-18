// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {PermissionCondition} from "@aragon/osx/core/permission/PermissionCondition.sol";

/// @notice Restricts execution to only a specific address and selector
contract ExecuteSelectorCondition is PermissionCondition {
    /// @notice The address of the contract where the permission can be granted
    address private targetContract;

    /// @notice The selector of the function that can be called
    bytes4 private targetSelector;

    /// @notice The constructor of the condition
    /// @param _targetContract The address of the contract where the permission can be granted
    constructor(address _targetContract, bytes4 _targetSelector) {
        targetContract = _targetContract;
        targetSelector = _targetSelector;
    }

    /// @notice Checks whether the current action executes an allowed function
    function isGranted(
        address _where,
        address _who,
        bytes32 _permissionId,
        bytes calldata _data
    ) external view returns (bool) {
        (_where, _who, _permissionId);

        // Is it execute()?
        if (_getSelector(_data) != IDAO.execute.selector) {
            return false;
        }

        (, IDAO.Action[] memory _actions, ) = abi.decode(
            _data[4:],
            (bytes32, IDAO.Action[], uint256)
        );

        // Check actions
        if (_actions.length != 1) return false;
        else if (_actions[0].to != targetContract) return false;

        // Decode the call being requested (both have the same parameters)
        (bytes4 _requestedSelector, ) = _decodeAddMemberCalldata(_actions[0].data);

        if (_requestedSelector != targetSelector) return false;

        return true;
    }

    function _getSelector(bytes memory _data) internal pure returns (bytes4 selector) {
        // Slices are only supported for bytes calldata, not bytes memory
        // Bytes memory requires an assembly block
        assembly {
            selector := mload(add(_data, 0x20)) // 32
        }
    }

    function _decodeAddMemberCalldata(
        bytes memory _data
    ) internal pure returns (bytes4 sig, address account) {
        // Slicing is only supported for bytes calldata, not bytes memory
        // Bytes memory requires an assembly block
        assembly {
            sig := mload(add(_data, 0x20)) // 32
            account := mload(add(_data, 0x24)) // 32 + 4
        }
    }
}