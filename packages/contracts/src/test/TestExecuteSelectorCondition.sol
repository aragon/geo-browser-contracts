// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {ExecuteSelectorCondition} from "../conditions/ExecuteSelectorCondition.sol";

/// @notice The condition associated with `TestSharedPlugin`
contract TestExecuteSelectorCondition is ExecuteSelectorCondition {
    constructor(
        address _targetContract,
        bytes4 _selector
    ) ExecuteSelectorCondition(_targetContract, _selector) {}

    function getSelector(bytes memory _data) public pure returns (bytes4 selector) {
        return super._getSelector(_data);
    }

    function decodeAddMemberCalldata(
        bytes memory _data
    ) public pure returns (bytes4 sig, address account) {
        return super._decodeAddMemberCalldata(_data);
    }
}
