# Geo Browser - Aragon OSx

The following project contains the plugin smart contracts providing the foundation of the Geo Browser project. See `packages/contracts` and `packages/contracts-ethers`.

A template for a future JS client and a Subgraph indexer is also provided but not populated.

## Getting started

```
cp .env.template .env
```

Add your Infura API key and then, run:

```
yarn
cd packages/contracts
yarn build
yarn test
```

## Overview

A Space is composed by a DAO and several plugins installed on it. The [DAO](https://github.com/aragon/osx/blob/develop/packages/contracts/src/core/dao/DAO.sol) contract holds all the assets and rights, while plugins are custom, opt-in pieces of logic that can perform certain actions governed by the DAO's permission database.

The DAO contract can be deployed by using Aragon's DAOFactory contract. This will deploy a new DAO with the desired plugins and settings.

The current repository provides the plugins necessary to cover two use cases:

1. A standard space where members propose changes and editors vote on them
   - Space plugin
   - Member Access plugin
   - Main Voting plugin
2. A personal space, where editors apply changes immediately
   - Space plugin
   - Personal Space Admin plugin

## Global lifecycle

### Space genesis

1. When the `MainVotingPlugin` is installed, an initial editor is defined

### Joining a space

1. An address calls `proposeNewMember()` on the `MemberAccessPlugin`
   - If the wallet is the only editor, the proposal succeeds immediately
2. One of the editors calls `approve()` or `reject()`
   - Calling `approve()` makes the proposal succeed
   - Calling `reject()` cancels the proposal
3. A succeeded proposal is executed automatically
   - This makes the DAO call `grant()` on itself to grant the `MEMBERSHIP_PERMISSION` to the intended address

### Creating proposals for a space

1. An editor or a wallet with the `MEMBERSHIP_PERMISSION` granted, creates a proposal
2. Editors can vote on it for a predefined amount of time
3. If the proposal exceeds the required quorum and support, the proposal succeeds
4. Succeeded proposals can be executed by anyone

### Emitting content and managing subspaces

1. When a proposal regarding the space is passed, the `MainVotingPlugin` will call `execute()` on the DAO
2. The actions from the proposal will target the `processGeoProposal()`, `acceptSubspace()` or `removeSubspace()` functions on the `SpacePlugin`.
3. The `SpacePlugin` will be called by the DAO and emit the corresponding events
4. An external indexer will fetch all these events and update the current state of this specific space

## General notice

The implementation of the four plugins is built on top of existing and thoroughly autited plugins from Aragon OSx. The base contracts used highly align with the requirements of Geo. However, there is some cases in which certain parameters may not be relevant or may need to be kept for compatibility.

The alternative would be to fork these base contracts and include them as part of this repository. Given the pro's of getting OSx updates from Aragon for free vs the con's of keeping a few redundant parameters, we have decided to avoid forking any base contract.

[Learn more about Aragon OSx](https://devs.aragon.org/docs/osx/how-it-works/framework/)

### Quirks

- The `minProposerVotingPower` setting is ignored. The requirement is just being a member.
  - Leave it to just `0`
- The second parameter of `approve()` is ignored on [MemberAccessPlugin](#member-access-plugin). It is assumed that an approval will trigger an early execution whenever possible.
  - Leave it to just `false`
- The 4th and 5th parameters on `createProposal()` (startDate and endDate) are ignored
  - Leave them to just `0`
- `minDuration` in `MainVotingSettings` defines the proposal duration, not the minimum duration.
- The methods `addAddresses()` and `removeAddresses()` on the [MemberAccessPlugin](#member-access-plugin) are disabled

## How permissions work

For each Space, an Aragon DAO is going to be created to act as the entry point. It will hold any assets and most importantly, manage the permission database which will govern all plugin interactions.

A permission looks like:

- An address `who` holds `MY_PERMISSION_ID` on a target contract `where`

New DAO's are deployed with a `ROOT_PERMISSION` assigned to its creator, but the DAO will typically deployed by the DAO factory, which will install all the requested plugins and drop the ROOT permission after the set up is done.

Managing permissions is made via two functions that are called on the DAO:

```solidity
function grant(address _where, address _who, bytes32 _permissionId);

function revoke(address _where, address _who, bytes32 _permissionId);
```

### Permission Conditions

For the cases where an unrestricted permission is not derisable, a [Permission Condition](https://devs.aragon.org/docs/osx/how-it-works/core/permissions/conditions) can be used.

Conditional permissions look like this:

- An address `who` holds `MY_PERMISSION_ID` on a target contract `where`, only `when` the condition contract approves it

Conditional permissions are granted like this:

```solidity
function grantWithCondition(
  address _where,
  address _who,
  bytes32 _permissionId,
  IPermissionCondition _condition
);
```

See the `MemberAccessExecuteCondition` contract. It restricts what the [MemberAccessPlugin](#member-access-plugin) can execute on the DAO.

[Learn more about OSx permissions](https://devs.aragon.org/docs/osx/how-it-works/core/permissions/)

### Permissions being used

Below are all the permissions that a [PluginSetup](#plugin-setup-contracts) contract may want to request:

- `MEMBER_PERMISSION` is required to create proposals on the [MainVotingPlugin](#main-voting-plugin)
- `EDITOR_PERMISSION` is required to execute proposals on the [PersonalSpaceAdminPlugin](#personal-space-admin-plugin)
- `EXECUTE_PERMISSION` is required to make the DAO `execute` a set of actions
  - Only plugins should have this permission
  - Some plugins should restrict it with a condition
- `ROOT_PERMISSION` is required to make the DAO `grant` or `revoke` permissions
  - The DAO needs to be ROOT on itself (it is by default)
  - Nobody else should be ROOT on the DAO
- `UPGRADE_PLUGIN_PERMISSION` is required for an address to be able to upgrade a plugin to a newer version published by the developer
  - Typically called by the DAO via proposal
  - Optionally granted to an additional address for convenience
- `CONTENT_PERMISSION_ID` is required to call the function that emits new content events on the [SpacePlugin](#space-plugin)
  - Typically called by the DAO via proposal
- `SUBSPACE_PERMISSION_ID` is required to call the functions that emit new subspace accept/reject events on the [SpacePlugin](#space-plugin)
  - Typically called by the DAO via proposal
- `UPDATE_MULTISIG_SETTINGS_PERMISSION_ID` is required to change the settings of the [MemberAccessPlugin](#member-access-plugin)
  - Typically called by the DAO via proposal
- `UPDATE_ADDRESSES_PERMISSION_ID` is required to add or remove editors on the [MainVotingPlugin](#main-voting-plugin)
  - Typically called by the DAO via proposal

Other DAO permissions:

- `EXECUTE_PERMISSION`
- `UPGRADE_DAO_PERMISSION`
- `SET_METADATA_PERMISSION`
- `SET_TRUSTED_FORWARDER_PERMISSION`
- `SET_SIGNATURE_VALIDATOR_PERMISSION`
- `REGISTER_STANDARD_CALLBACK_PERMISSION`

## Interacting with the contracts from JS

Run `yarn build && yarn typechain` on the `packages/contracts` folder.

See `packages/contracts/typechain` for all the generated JS/TS wrappers to interact with the contracts.

[Learn more](https://github.com/dethcrypto/TypeChain)

## Encoding and decoding actions

Making calls to the DAO is straightforward, however making execute arbitrary actions requires them to be encoded, stored on chain and be approved before they can be executed.

To this end, the DAO has a struct called `Action { to, value, data }`, which will make the DAO call the `to` address, with `value` ether and call the given calldata (if any). To encode these functions, you can make use of the provided [JS client template](packages/js-client/src).

It uses the generated typechain artifacts, which contain the interfaces for the available contract methods and allow to easily encode function calls into hex strings.

See [packages/js-client/src/internal/modules/encoding.ts](packages/js-client/src/internal/modules/encoding.ts) and [decoding.ts](packages/js-client/src/internal/modules/decoding.ts) for a JS boilerplate.

## Adding members and editors

On Spaces with the standard governance, a [MemberAccessPlugin](#member-access-plugin) and a [MainVotingPlugin](#main-voting-plugin) will be installed.

### Members

- Send a transaction to call `proposeNewMember()`
- Have an editor (different to the proposer) calling `approve()` for this proposal
- This will grant `MEMBER_PERMISSION` to the requested address on the main voting contract

### Editors

- A member or editor creates a proposal
- The proposal should have an action to make the DAO `execute()` a call to `addAddresses()` on the plugin
- A majority of editors call `vote()` and approve it
- Someone calls `plugin.execute()` so that the DAO executes the requested action on the plugin
- The new editor will be able to vote on proposals created from then on

The same procedure applies to removing members and editors.

## Adding editors (personal spaces)

- Execute a proposal with an action to call `grant(address(mainVotingPlugin), targetAddress, EDITOR_PERMISSION_ID)`
- With the permission granted, `targetAddress` can immediately start executing proposals

The same applies for removing a member.

## The DAO's plugins

### Space plugin

Acts as the source of truth regarding the Space associated to the DAO. It is in charge of emitting the events that notify new content being approved and it also emits events accepting a certain DAO as a Subpspace.

The same plugin is used for both governance cases. The difference lies on the governance model.

This plugin is upgradeable.

#### Methods

- `function initialize(IDAO _dao, string _firstBlockContentUri, address predecessorSpace)`
- `function processGeoProposal(uint32 _blockIndex, uint32 _itemIndex, string _contentUri)`
- `function acceptSubspace(address _dao)`
- `function removeSubspace(address _dao)`

Inherited:

- `function upgradeTo(address newImplementation)`
- `function upgradeToAndCall(address newImplementation, bytes data)`

#### Getters

Inherited:

- `function implementation() returns (address)`

#### Events

- `event GeoProposalProcessed(uint32 blockIndex, uint32 itemIndex, string contentUri)`
- `event SuccessorSpaceCreated(address predecessorSpace)`
- `event SubspaceAccepted(address dao)`
- `event SubspaceRemoved(address dao)`

#### Permissions

- The DAO can call `processGeoProposal()` on the plugin
- The DAO can accept/remove a subspace on the plugin
- The DAO can upgrade the plugin
- Optionally, a given pluginUpgrader can upgrade the plugin

### Member Access plugin

Provides a simple way for any address to request membership on a space. It is a adapted version of Aragon's [Multisig plugin](https://github.com/aragon/osx/blob/develop/packages/contracts/src/plugins/governance/multisig/Multisig.sol). It creates a proposal to grant `MEMBERSHIP_PERMISSION` to an address on the main voting plugin and Editors can approve or reject it. Once approved, the permission allows to create proposals on the other plugin.

#### Methods

- `function initialize(IDAO _dao, MultisigSettings _multisigSettings)`
- ~~`function addAddresses(address[])`~~
  - This method remains for compatibility with the base interface
- ~~`function removeAddresses(address[])`~~
  - This method remains for compatibility with the base interface
- `function updateMultisigSettings(MultisigSettings _multisigSettings)`
- `function proposeNewMember(bytes _metadata,address _proposedMember)`
- `function proposeRemoveMember(bytes _metadata,address _proposedMember)`
- `function approve(uint256 _proposalId, bool)`
  - The second parameter remains for compatibility with the base interface. However, early execution will always be made
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

- `event Approved(uint256 indexed proposalId, address indexed editor)`
- `event Rejected(uint256 indexed proposalId, address indexed editor)`
- `event MultisigSettingsUpdated(uint64 proposalDuration, address mainVotingPlugin)`

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

It's the main governance plugin for standard spaces, where all proposals are voted by editors. It is a adapted version of Aragon's [AddresslistVoting plugin](https://github.com/aragon/osx/blob/develop/packages/contracts/src/plugins/governance/majority-voting/addresslist/AddresslistVoting.sol). Only members (or editors) can create proposals and they can only be executed after a qualified majority has voted for it.

It acts as the source of truth about who is an editor, on Spaces with standard governance.

The governance settings need to be defined when the plugin is deployed but the DAO can change them at any time. Proposal creators can cancel their own proposals before they end.

#### Methods

- `function initialize(IDAO _dao, VotingSettings calldata _votingSettings, address[] calldata _initialEditors)`
- `function addAddresses(address[])`
- `function removeAddresses(address[])`
- `function createProposal(bytes calldata metadata, IDAO.Action[] calldata actions, uint256 allowFailureMap, uint64, uint64, VoteOption voteOption, bool tryEarlyExecution)`
- `function cancelProposal(uint256 _proposalId)`

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

- `event ProposalCanceled(uint256 proposalId)`

Inherited:

- `event ProposalCreated(uint256 indexed proposalId, address indexed creator, uint64 startDate, uint64 endDate, bytes metadata, IDAO.Action[] actions, uint256 allowFailureMap)`
- `event VoteCast(uint256 indexed proposalId, address indexed voter, VoteOption voteOption, uint256 votingPower)`
- `event ProposalExecuted(uint256 indexed proposalId)`
- `event VotingSettingsUpdated(VotingMode votingMode, uint32 supportThreshold, uint32 minParticipation, uint64 minDuration, uint256 minProposerVotingPower)`

#### Permissions

- Members (and editors) can create proposals
- Editors can vote on proposals
- The plugin can execute on the DAO
- The DAO can update the plugin settings
- The DAO can manage the list of addresses
- The DAO can upgrade the plugin
- Optionally, a given pluginUpgrader can upgrade the plugin

### Personal Space Admin Plugin

Governance plugin providing the default implementation for personal spaces, where addresses with editor permissioin can apply proposals right away. It is a adapted version of Aragon's [Admin plugin](https://github.com/aragon/osx/blob/develop/packages/contracts/src/plugins/governance/admin/Admin.sol).

Since this plugin has the power to unilaterally perform actions, it is not upgradeable. Adding many editors is possible via proposals with a grant/revoke action.

#### Methods

- `function initialize(IDAO _dao)`
- `function executeProposal(bytes calldata _metadata, IDAO.Action[] calldata _actions, uint256 _allowFailureMap)`

#### Getters

- `function isEditor(address _account) returns (bool)`
- `function supportsInterface(bytes4 _interfaceId) returns (bool)`

Inherited:

- `function proposalCount() external view returns (uint256)`
- `function implementation() returns (address)`

#### Events

Inherited:

- `event ProposalCreated(uint256 indexed proposalId, address indexed creator, uint64 startDate, uint64 endDate, bytes metadata, IDAO.Action[] actions, uint256 allowFailureMap)`
- `event ProposalExecuted(uint256 indexed proposalId)`

#### Permissions

- Editors can execute proposals right away
- The plugin can execute on the DAO

## Plugin Setup contracts

So far, we have been talking about the plugin contracts. However, they need to be prepared and installed on a DAO and for this, a DAO needs to approve for it. To this end, PluginSetup contracts act as an install script in charge of preparing installations, updates and uninstallations. They always have two steps:

1. An unprivileged step to prepare the plugin and request any privileged changes
2. An approval step after which, editors execute an action that applies the requested installation, upgrade or uninstallation

[Learn more](https://devs.aragon.org/docs/osx/how-to-guides/plugin-development/upgradeable-plugin/setup)

### Installing plugins when deploying the DAO

This is taken care by the `DAOFactory`. The DAO creator calls `daoFactory.createDao()`:

- The call contains:
  - The DAO settings
  - An array with the details and the settings of the desired plugins
- The method will deploy a new DAO and grant `ROOT_PERMISSION` to the `DaoFactory`, temporarily
  - Given the settings of the desired plugins, it will call the `PluginSetupProcessor`
- The PSP will then call `prepareInstallation()` on the given plugin set up contract
- Immedially after, `applyInstallation()` will be called by the `DaoFactory`
- The DaoFactory drops `ROOT_PERMISSION` on itself

[See a JS example of installing plugins during a DAO's deployment](https://devs.aragon.org/docs/sdk/examples/client/create-dao#create-a-dao)

### Installing plugins afterwards

Plugin changes need a proposal to be passed when the DAO already exists.

1. Calling `pluginSetupProcessor.prepareInstallation()` which will call `prepareInstallation()` on the plugin's setup contract
   - A new plugin instance is deployed with the desired settings
   - The call returns a set of requested permissions to be applied by the DAO
2. Editors pass a proposal to make the DAO call `applyInstallation()` on the [PluginSetupProcessor](https://devs.aragon.org/docs/osx/how-it-works/framework/plugin-management/plugin-setup/)
   - This applies the requested permissions and the plugin becomes installed

See `SpacePluginSetup`, `PersonalSpaceAdminPluginSetup`, `MemberAccessPluginSetup` and `MainVotingPluginSetup`.

[Learn more about plugin setup's](https://devs.aragon.org/docs/osx/how-it-works/framework/plugin-management/plugin-setup/) and [preparing installations](https://devs.aragon.org/docs/sdk/examples/client/prepare-installation).

### Passing install parameters

In both of the cases described above, a call to `prepareInstallation()` will be made by the `PluginSetupProcessor` from OSx.

```solidity
function prepareInstallation(
  address _dao,
  bytes memory _data
) external returns (address plugin, PreparedSetupData memory preparedSetupData)
```

- The first parameter (dao address) will be provided by the PSP.
- The second parameter allows to pass an arbitrary array of bytes, encoding any set of custom settings that the plugin needs to receive.

The first step for `prepareInstallation()` is to decode them and use them on the deployment script as needed:

```solidity
// Decode incoming params
(
  string memory _firstBlockContentUri,
  address _predecessorAddress,
  address _pluginUpgrader
) = abi.decode(_data, (string, address, address));
```

The JSON encoded ABI definition can be found at the corresponding `<name>-build-metadata.json` file:

```json
{
  // ...
  "pluginSetup": {
    "prepareInstallation": {
      // ...
      "inputs": [
        {
          "name": "firstBlockContentUri",
          "type": "string",
          "internalType": "string",
          "description": "The inital contents of the first block item."
        },
        {
          "internalType": "address",
          "name": "predecessorAddress",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "pluginUpgrader",
          "type": "address"
        }
      ]
    },
```

The same also applies to `prepareUpdate` (if present) and to `prepareUninstallation`.

### Available setup contracts

#### GovernancePluginsSetup

This contracts implements the deployment script for:

- `MainVotingPlugin`
- `MemberAccessPlugin`

The second plugin needs to know the address of the first one, therefore the contract deploys them together.

##### Note

When preparing the installation, an `InstallationPrepared` event is emitted. Using Typechain with Ethers:

- `event.args.preparedSetupData.plugin` contains the address of the Main Voting plugin
- `event.args.preparedSetupData.helpers` contains an array with the address of the Member Access plugin

#### SpacePluginSetup

This contract implements the deployment script for the `SpacePlugin` contract.

#### PersonalSpaceAdminPluginSetup

This contract implements the deployment script for the `PersonalSpaceAdminPlugin` contract.

## Deploying a DAO

The recommended way to create a DAO is by using `@aragon/sdk-client`. It uses the `DAOFactory` under the hood and it reduces the amount of low level interactions with the protocol.

[See an example](https://devs.aragon.org/docs/sdk/examples/client/create-dao).

In the example, the code is making use of the existing JS client for [Aragon's Token Voting plugin](https://github.com/aragon/sdk/tree/develop/modules/client/src/tokenVoting). They encapsulate all the Typechain and Subgraph calls and provide a high level library.

It is **recommended** to use the provided boilerplate on `packages/js-client` and adapt the existing Aragon's TokenVoting plugin to make use of the `MainVotingPlugin__factory` class.

## Plugin deployment

- The HardHat deployment scripts are located on the `packages/contracts/deploy` folder.
- The settings about the naming, ID's and versions can be found on `packages/contracts/plugin-setup-params.ts`.
- The deployments made will populate data to the `packages/contracts/plugin-repo-info.json` and `packages/contracts/plugin-repo-info-dev.json`.
- You need to copy `.env.template` into `.env` and provide your Infura API key

### Plugin metadata

Plugins need some basic metadata in order for JS clients to be able to handle installations and updates. Beyond a simple title and description, every contract's build metadata contains the ABI of the parameters that need to be encoded in order to prepare the plugin installation.

Every plugin has an `initialize()` methos, which acts as the constructor for UUPS upgradeable contracts. This method will be passed its DAO's address, as well as a `bytes memory data` parameter, with all the settings encoded.

The format of these settings is defined in the `packages/contracts/src/*-build.metadata.json` file. See the `pluginSetup` > `prepareInstallation` section.

## DO's and DONT's

- Never grant `ROOT_PERMISSION` unless you are just trying things out
- Never uninstall all plugins, as this would brick your DAO
- Ensure that there is at least always one plugin with `EXECUTE_PERMISSION` on the DAO
- Ensure that the DAO is ROOT on itself
- Use the `_gap[]` variable for upgradeable plugins, as a way to reserve storage slots for future plugin implementations
  - Decrement the `_gap` number for every new variable you add in the future

## Plugin upgradeability

By default, only the DAO can upgrade plugins to newer versions. This requires passing a proposal. For the 3 upgradeable plugins, their plugin setup allows to pass an optional parameter to define a plugin upgrader address.

When a zero address is passed, only the DAO can call `upgradeTo()` and `upgradeToAndCall()`. When a non-zero address is passed, the desired address will be able to upgrade to whatever newer version the developer has published.

Every new version needs to be published to the plugin's repository.

[Learn more about plugin upgrades](https://devs.aragon.org/docs/osx/how-to-guides/plugin-development/upgradeable-plugin/updating-versions).
