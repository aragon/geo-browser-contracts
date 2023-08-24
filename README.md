# Geo Browser - Aragon OSx

The following project contains the plugin smart contracts providing the foundation of the Geo Browser project. See `packages/contracts` and `packages/contracts-ethers`.

A template for a future JS client and a Subgraph indexer is also provided.

## Contracts

### SpacePlugin

Acts as the source of truth regarding the Space associated to the DAO. It is in charge of emitting the events that notify new content being approved and it also emits events accepting a certain DAO as a Subpspace.

- SpacePlugin
- SpacePluginSetup

### MemberAccess

Provides a simple way for any address to request membership on a space. Editors can approve it.

- MemberAccessPlugin
- MemberAccessPluginSetup

### SpaceVotingPlugin

Default governance plugin for spaces, where all proposals are voted by editors.

- SpaceVotingPlugin
- SpaceVotingPlugin

### PersonalSpaceVotingPlugin

Governance plugin providing the default implementation for personal spaces, where addresses with editor permissioin can apply proposals right away.

- PersonalSpaceVotingPlugin
- PersonalSpaceVotingPlugin

## Getting started

```
yarn
cd packages/contracts
yarn build
yarn test
```
