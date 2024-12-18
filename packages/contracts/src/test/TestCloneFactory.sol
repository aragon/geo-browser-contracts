// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {PersonalAdminPlugin} from "../personal/PersonalAdminPlugin.sol";
import {PersonalMemberAddHelper} from "../personal/PersonalMemberAddHelper.sol";

contract TestCloneFactory {
    using Clones for address;

    address private immutable personalAdminPluginImplementation;
    address private immutable personalAdminHelperImplementation;

    constructor() {
        personalAdminPluginImplementation = address(new PersonalAdminPlugin());
        personalAdminHelperImplementation = address(new PersonalMemberAddHelper());
    }

    function clonePersonalAdminPlugin() external returns (address clone) {
        return personalAdminPluginImplementation.clone();
    }

    function clonePersonalMemberAddHelper() external returns (address clone) {
        return personalAdminHelperImplementation.clone();
    }
}
