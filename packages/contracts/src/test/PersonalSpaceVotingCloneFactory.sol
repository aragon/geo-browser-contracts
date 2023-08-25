// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {PersonalSpaceVotingPlugin} from "../PersonalSpaceVotingPlugin.sol";

contract PersonalSpaceVotingCloneFactory {
    using Clones for address;

    address private immutable implementation;

    constructor() {
        implementation = address(new PersonalSpaceVotingPlugin());
    }

    function deployClone() external returns (address clone) {
        return implementation.clone();
    }
}
