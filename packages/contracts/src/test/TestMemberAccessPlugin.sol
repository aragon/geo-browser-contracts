// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {MemberAccessPlugin} from "../governance/MemberAccessPlugin.sol";

/// @notice A clone of the MemberAccessPlugin contract, just to test
contract TestMemberAccessPlugin is MemberAccessPlugin {
    function initialize(
        IDAO _dao,
        MultisigSettings calldata _multisigSettings
    ) public override initializer {
        __PluginUUPSUpgradeable_init(_dao);

        _updateMultisigSettings(_multisigSettings);
    }

    function devProposeAddMember(
        bytes calldata _metadata,
        address _proposedMember,
        address _proposer
    ) public returns (uint256 proposalId) {
        return proposeAddMember(_metadata, _proposedMember, _proposer);
    }
}
