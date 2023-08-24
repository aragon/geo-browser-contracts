// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.8;

import {IDAO, PluginUUPSUpgradeable} from "@aragon/osx/core/plugin/PluginUUPSUpgradeable.sol";

/// @title SpaceVotingPlugin
/// @dev Release 1, Build 1
contract SpaceVotingPlugin is PluginUUPSUpgradeable {
    bytes32 public constant CONTENT_PERMISSION_ID = keccak256("CONTENT_PERMISSION");
    bytes32 public constant SUBSPACE_PERMISSION_ID = keccak256("SUBSPACE_PERMISSION");

    /// @notice Emitted when the contents of a space change.
    /// @param blockIndex The index of the block that has new contents.
    /// @param contentUri The IPFS URI pointing to the new contents.
    event ContentChanged(uint32 blockIndex, string contentUri);

    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the plugin when build 1 is installed.
    /// @param _dao The address of the DAO to read the permissions from.
    /// @param _firstBlockContentUri A IPFS URI pointing to the contents of the very first block.
    function initialize(IDAO _dao, string memory _firstBlockContentUri) external initializer {
        __PluginUUPSUpgradeable_init(_dao);

        emit ContentChanged({blockIndex: 0, contentUri: _firstBlockContentUri});
    }

    /// @notice Emits an event with new contents for the given block index. Caller needs CONTENT_PERMISSION.
    /// @param _blockIndex The index of the block whose contents are being changed.
    /// @param _contentUri An IPFS URI pointing to the new contents behind the block.
    function setContent(
        uint32 _blockIndex,
        string memory _contentUri
    ) external auth(CONTENT_PERMISSION_ID) {
        emit ContentChanged({blockIndex: _blockIndex, contentUri: _contentUri});
    }

    /// @notice This empty reserved space is put in place to allow future versions to add new variables without shifting down storage in the inheritance chain (see [OpenZeppelin's guide about storage gaps](https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps)).
    uint256[50] private __gap;
}
