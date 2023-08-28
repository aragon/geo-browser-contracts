// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.8;

import {IDAO, PluginUUPSUpgradeable} from "@aragon/osx/core/plugin/PluginUUPSUpgradeable.sol";

/// @title SpacePlugin
/// @dev Release 1, Build 1
contract SpacePlugin is PluginUUPSUpgradeable {
    bytes32 public constant CONTENT_PERMISSION_ID = keccak256("CONTENT_PERMISSION");
    bytes32 public constant SUBSPACE_PERMISSION_ID = keccak256("SUBSPACE_PERMISSION");

    /// @notice Emitted when the contents of a space change.
    /// @param blockIndex The index of the block whose items have new contents.
    /// @param itemIndex The index of the item that has new contents.
    /// @param contentUri An IPFS URI pointing to the new contents behind the block's item.
    event ContentChanged(uint32 blockIndex, uint32 itemIndex, string contentUri);

    /// @notice Emitted when the DAO accepts another DAO as a subspace.
    /// @param dao The address of the DAO to be accepted as a subspace.
    event SubspaceAccepted(address dao);

    /// @notice Emitted when the DAO stops recognizing another DAO as a subspace.
    /// @param dao The address of the DAO to be removed as a subspace.
    event SubspaceRemoved(address dao);

    /// @notice Initializes the plugin when build 1 is installed.
    /// @param _dao The address of the DAO to read the permissions from.
    /// @param _firstBlockContentUri A IPFS URI pointing to the contents of the first block's item (title).
    function initialize(IDAO _dao, string memory _firstBlockContentUri) external initializer {
        __PluginUUPSUpgradeable_init(_dao);

        emit ContentChanged({blockIndex: 0, itemIndex: 0, contentUri: _firstBlockContentUri});
    }

    /// @notice Emits an event with new contents for the given block index. Caller needs CONTENT_PERMISSION.
    /// @param _blockIndex The index of the block whose items have new contents.
    /// @param _itemIndex The index of the item that has new contents.
    /// @param _contentUri An IPFS URI pointing to the new contents behind the block's item.
    function setContent(
        uint32 _blockIndex,
        uint32 _itemIndex,
        string memory _contentUri
    ) external auth(CONTENT_PERMISSION_ID) {
        emit ContentChanged({
            blockIndex: _blockIndex,
            itemIndex: _itemIndex,
            contentUri: _contentUri
        });
    }

    /// @notice Emits an event accepting another DAO as a subspace. Caller needs CONTENT_PERMISSION.
    /// @param _dao The address of the DAO to accept as a subspace.
    function acceptSubspace(address _dao) external auth(SUBSPACE_PERMISSION_ID) {
        emit SubspaceAccepted(_dao);
    }

    /// @notice Emits an event removing another DAO as a subspace. Caller needs CONTENT_PERMISSION.
    /// @param _dao The address of the DAO to remove as a subspace.
    function removeSubspace(address _dao) external auth(SUBSPACE_PERMISSION_ID) {
        emit SubspaceRemoved(_dao);
    }

    /// @notice This empty reserved space is put in place to allow future versions to add new variables without shifting down storage in the inheritance chain (see [OpenZeppelin's guide about storage gaps](https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps)).
    uint256[50] private __gap;
}
