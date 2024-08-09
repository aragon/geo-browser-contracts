// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {MemberAddCondition} from "../conditions/MemberAddCondition.sol";

/// @notice The condition associated with `TestSharedPlugin`
contract TestMemberAddCondition is MemberAddCondition {
    constructor(address _targetContract) MemberAddCondition(_targetContract) {}

    function getSelector(bytes memory _data) public pure returns (bytes4 selector) {
        return super._getSelector(_data);
    }

    function decodeAddMemberCalldata(
        bytes memory _data
    ) public pure returns (bytes4 sig, address account) {
        return super._decodeAddMemberCalldata(_data);
    }
}
