// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.8;

import {IDAO, PluginUUPSUpgradeable} from "@aragon/osx/core/plugin/PluginUUPSUpgradeable.sol";

bytes4 constant MAIN_SPACE_VOTING_INTERFACE_ID = MainVotingPlugin.initialize.selector ^
    MainVotingPlugin.editorCount.selector;

/// @title MainVotingPlugin
/// @dev Release 1, Build 1
contract MainVotingPlugin is PluginUUPSUpgradeable {
    /// @notice Initializes the plugin when build 1 is installed.
    /// @param _dao The address of the DAO to read the permissions from.
    function initialize(IDAO _dao) external initializer {
        __PluginUUPSUpgradeable_init(_dao);
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(
        bytes4 _interfaceId
    ) public view override(PluginUUPSUpgradeable) returns (bool) {
        return
            _interfaceId == MAIN_SPACE_VOTING_INTERFACE_ID || super.supportsInterface(_interfaceId);
    }

    function editorCount() public pure returns (uint32) {
        return 1;
    }

    /// @notice This empty reserved space is put in place to allow future versions to add new variables without shifting down storage in the inheritance chain (see [OpenZeppelin's guide about storage gaps](https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps)).
    uint256[50] private __gap;
}
