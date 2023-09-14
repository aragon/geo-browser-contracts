# Geo Browser - Aragon OSx

The following project contains the plugin smart contracts providing the foundation of the Geo Browser project. See `packages/contracts` and `packages/contracts-ethers`.

A template for a future JS client and a Subgraph indexer is also provided but not populated.

## Overview

A Space is composed by a DAO and several plugins installed on it. The [DAO](https://github.com/aragon/osx/blob/develop/packages/contracts/src/core/dao/DAO.sol) contract holds all the assets and rights, while plugins are custom, opt-in pieces of logic that can perform certain actions governed by the DAO's permission database.

The DAO contract can be deployed by using Aragon's DAOFactory contract. This will deploy a new DAO with the desired plugins and settings.

The current repository provides the plugins necessary to cover two use cases:

1. A standard space where members propose changes and editors vote on them
   - Space plugin
   - Personal Space Admin plugin
2. A personal space, where editors apply changes immediately
   - Space plugin
   - Member Access plugin
   - Main Voting plugin

## The DAO plugins

### Space plugin

Acts as the source of truth regarding the Space associated to the DAO. It is in charge of emitting the events that notify new content being approved and it also emits events accepting a certain DAO as a Subpspace.

The same plugin is used for both use cases. The difference lies on the governance model, not here.

This plugin is upgradeable.

#### Methods

- `function initialize(IDAO _dao, string _firstBlockContentUri)`
- `function setContent(uint32 _blockIndex, uint32 _itemIndex, string _contentUri)`
- `function acceptSubspace(address _dao)`
- `function removeSubspace(address _dao)`

Inherited:

- `function upgradeTo(address newImplementation)`
- `function upgradeToAndCall(address newImplementation, bytes data)`

#### Getters

Inherited:

- `function implementation() returns (address)`

#### Events

- `event ContentChanged(uint32 blockIndex, uint32 itemIndex, string contentUri)`
- `event SubspaceAccepted(address dao)`
- `event SubspaceRemoved(address dao)`

#### Permissions

- The DAO can emit content events on the plugin
- The DAO can accept a subspace on the plugin
- The DAO can upgrade the plugin
- Optionally, a given pluginUpgrader can upgrade the plugin

### Member Access plugin

Provides a simple way for any address to request membership on a space. It creates a proposal to grant `MEMBERSHIP_PERMISSION` to an address on the main voting plugin and Editors can approve or reject it. Once approved, the permission allows to create proposals on the other plugin.

#### Methods

- `function initialize(IDAO _dao, MultisigSettings _multisigSettings)`
- ~~`function addAddresses(address[])`~~
  - This method remains for compliance with the base interface
- ~~`function removeAddresses(address[])`~~
  - This method remains for compliance with the base interface
- `function updateMultisigSettings(MultisigSettings _multisigSettings)`
- `function proposeNewMember(bytes _metadata,address _proposedMember)`
- `function proposeRemoveMember(bytes _metadata,address _proposedMember)`
- `function approve(uint256 _proposalId, bool)`
  - The second parameter remains for compliance with the base interface. However, early execution will always be made
- `function reject(uint256 _proposalId)`
- `function execute(uint256 _proposalId)`
  - This method is redundant since early execution will always trigger first

Inherited:

- `function upgradeTo(address newImplementation)`
- `function upgradeToAndCall(address newImplementation, bytes data)`

#### Getters

- `function supportsInterface(bytes4 _interfaceId) returns (bool)`
- `function canApprove(uint256 _proposalId, address _account) returns (bool)`
- `function canExecute(uint256 _proposalId) returns (bool)`
- `function getProposal(uint256 _proposalId) returns (bool executed, uint16 approvals, ProposalParameters parameters, IDAO.Action[] actions, uint256 failsafeActionMap)`
- `function hasApproved(uint256 _proposalId, address _account) returns (bool)`
- `function isMember(address _account) returns (bool)`
- `function isEditor(address _account) returns (bool)`

Inherited:

- `function proposalCount() external view returns (uint256)`
- `function implementation() returns (address)`

#### Events

- `event Approved(uint256 indexed proposalId, address indexed editor);`
- `event Rejected(uint256 indexed proposalId, address indexed editor);`
- `event MultisigSettingsUpdated(uint64 proposalDuration, address mainVotingPlugin);`

Inherited:

- `event ProposalCreated(uint256 indexed proposalId, address indexed creator, uint64 startDate, uint64 endDate, bytes metadata, IDAO.Action[] actions, uint256 allowFailureMap)`
- `event ProposalExecuted(uint256 indexed proposalId)`

#### Permissions

- Anyone can create proposals
- Editors can approve and reject proposals
- The plugin can execute on the DAO
- The DAO can update the plugin settings
- The DAO can upgrade the plugin
- Optionally, a given pluginUpgrader can upgrade the plugin

### Main Voting plugin

It's the main governance plugin for standard spaces, where all proposals are voted by editors. Only members (or editors) can create proposals and they can only be executed after a qualified majority has voted for it.

The governance settings need to be defined when the plugin is deployed but the DAO can change them at any time.

#### Methods

- `function initialize(IDAO _dao, VotingSettings calldata _votingSettings, address[] calldata _initialEditors)`
- `function addAddresses(address[])`
- `function removeAddresses(address[])`
- `function createProposal(bytes calldata metadata,IDAO.Action[] calldata actions,uint256 allowFailureMap,uint64,uint64,VoteOption voteOption,bool tryEarlyExecution)`

Inherited:

- `function vote(uint256 _proposalId, VoteOption _voteOption, bool _tryEarlyExecution)`
- `function execute(uint256 _proposalId)`
- `function updateVotingSettings(VotingSettings calldata _votingSettings)`
- `function upgradeTo(address newImplementation)`
- `function upgradeToAndCall(address newImplementation, bytes data)`

#### Getters

- `function isMember(address _account) returns (bool)`
- `function isEditor(address _account) returns (bool)`
- `function supportsInterface(bytes4 _interfaceId) returns (bool)`

Inherited:

- `function canVote(uint256 _proposalId, address _voter, VoteOption _voteOption)`
- `function getProposal(uint256 _proposalId) returns (bool open, bool executed, ProposalParameters parameters, Tally tally, IDAO.Action[] actions, uint256 allowFailureMap)`
- `function getVoteOption(uint256 _proposalId, address _voter)`
- `function isSupportThresholdReached(uint256 _proposalId) returns (bool)`
- `function isSupportThresholdReachedEarly(uint256 _proposalId)`
- `function isMinParticipationReached(uint256 _proposalId) returns (bool)`
- `function canExecute(uint256 _proposalId) returns (bool)`
- `function supportThreshold() returns (uint32)`
- `function minParticipation() returns (uint32)`
- `function minDuration() returns (uint64)`
- `function minProposerVotingPower() returns (uint256)`
- `function votingMode() returns (VotingMode)`
- `function totalVotingPower(uint256 _blockNumber) returns (uint256)`
- `function implementation() returns (address)`

#### Events

- `event Approved(uint256 indexed proposalId, address indexed editor);`
- `event Rejected(uint256 indexed proposalId, address indexed editor);`
- `event MultisigSettingsUpdated(uint64 proposalDuration, address mainVotingPlugin);`

Inherited:

- `event ProposalCreated(uint256 indexed proposalId, address indexed creator, uint64 startDate, uint64 endDate, bytes metadata, IDAO.Action[] actions, uint256 allowFailureMap)`
- `event ProposalExecuted(uint256 indexed proposalId)`

#### Permissions

- Members can create proposals
- Editors can vote on proposals
- The plugin can execute on the DAO
- The DAO can update the plugin settings
- The DAO can manage the list of addresses
- The DAO can upgrade the plugin
- Optionally, a given pluginUpgrader can upgrade the plugin

### PersonalSpaceAdminPlugin

Governance plugin providing the default implementation for personal spaces, where addresses with editor permissioin can apply proposals right away.

- PersonalSpaceAdminPlugin
- PersonalSpaceAdminPlugin

## DO's and DONT's

- Always grant `EDITOR_PERMISSION_ID` without any condition attached to it

## General

### plugin setup's

### Plugin upgradeability

Best practices

## Getting started

```
yarn
cd packages/contracts
yarn build
yarn test
```
