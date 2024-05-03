// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

/// @notice Contains the content required to invoke processGeoProposal on the SpacePlugin
/// @param blockIndex The block of content to target
/// @param itemIndex The item within the block to target
/// @param contentUri The IPFS URI where the content is pinned
struct ProposalContentItem {
    uint32 blockIndex;
    uint32 itemIndex;
    string contentUri;
}
