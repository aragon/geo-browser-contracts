// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {PermissionLib} from "@aragon/osx/core/permission/PermissionLib.sol";
import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {PluginSetup, IPluginSetup} from "@aragon/osx/framework/plugin/setup/PluginSetup.sol";
import {PluginSetupProcessor} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {StdMemberAddHelper} from "./StdMemberAddHelper.sol";
import {StdGovernancePlugin} from "./StdGovernancePlugin.sol";
import {MemberAddCondition} from "../conditions/MemberAddCondition.sol";
import {OnlyPluginUpgraderCondition} from "../conditions/OnlyPluginUpgraderCondition.sol";
import {MajorityVotingBase} from "./base/MajorityVotingBase.sol";

/// @title StdGovernanceSetup
/// @dev Release 1, Build 1
contract StdGovernanceSetup is PluginSetup {
    address private immutable pluginImplementation;
    address public immutable helperImplementation;
    address private immutable pluginSetupProcessor;

    /// @notice Thrown when the array of helpers does not have the correct size
    error InvalidHelpers(uint256 actualLength);

    /// @notice Initializes the setup contract
    /// @param pluginSetupProcessorAddress The address of the PluginSetupProcessor contract deployed by Aragon on that chain
    constructor(PluginSetupProcessor pluginSetupProcessorAddress) {
        pluginSetupProcessor = address(pluginSetupProcessorAddress);
        pluginImplementation = address(new StdGovernancePlugin());
        helperImplementation = address(new StdMemberAddHelper());
    }

    /// @inheritdoc IPluginSetup
    /// @notice Prepares the installation of the two governance plugins in one go
    function prepareInstallation(
        address _dao,
        bytes memory _data
    ) external returns (address stdGovernancePlugin, PreparedSetupData memory preparedSetupData) {
        // Decode the custom installation parameters
        (
            MajorityVotingBase.VotingSettings memory _votingSettings,
            address[] memory _initialEditors,
            uint64 _memberAddProposalDuration,
            address _pluginUpgrader
        ) = decodeInstallationParams(_data);

        // Deploy the member add plugin
        address _stdMemberAddHelper = createERC1967Proxy(
            helperImplementation,
            abi.encodeCall(
                StdMemberAddHelper.initialize,
                (
                    IDAO(_dao),
                    StdMemberAddHelper.MultisigSettings({
                        proposalDuration: _memberAddProposalDuration
                    })
                )
            )
        );

        // Deploy the standard governance plugin
        stdGovernancePlugin = createERC1967Proxy(
            pluginImplementation,
            abi.encodeCall(
                StdGovernancePlugin.initialize,
                (
                    IDAO(_dao),
                    _votingSettings,
                    _initialEditors,
                    StdMemberAddHelper(_stdMemberAddHelper)
                )
            )
        );

        // Condition contract (member add plugin execute)
        address _memberAddCondition = address(new MemberAddCondition(stdGovernancePlugin));

        // List the requested permissions
        PermissionLib.MultiTargetPermission[]
            memory permissions = new PermissionLib.MultiTargetPermission[](
                _pluginUpgrader == address(0x0) ? 6 : 7
            );

        // The standard governance plugin can execute on the DAO
        permissions[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: _dao,
            who: stdGovernancePlugin,
            condition: PermissionLib.NO_CONDITION,
            permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        });
        // The DAO can update the standard governance plugin settings
        permissions[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: stdGovernancePlugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: StdGovernancePlugin(pluginImplementation)
                .UPDATE_VOTING_SETTINGS_PERMISSION_ID()
        });
        // The DAO can manage the list of addresses
        permissions[2] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: stdGovernancePlugin,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: StdGovernancePlugin(pluginImplementation).UPDATE_ADDRESSES_PERMISSION_ID()
        });

        // The StdGovernancePlugin can create membership proposals on the StdMemberAddHelper
        permissions[3] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: _stdMemberAddHelper,
            who: stdGovernancePlugin,
            condition: PermissionLib.NO_CONDITION,
            permissionId: StdMemberAddHelper(_stdMemberAddHelper).PROPOSER_PERMISSION_ID()
        });

        // The member add plugin needs to execute on the DAO
        permissions[4] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.GrantWithCondition,
            where: _dao,
            who: _stdMemberAddHelper,
            // Conditional execution
            condition: _memberAddCondition,
            permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        });
        // The DAO needs to be able to update the member add plugin settings
        permissions[5] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Grant,
            where: _stdMemberAddHelper,
            who: _dao,
            condition: PermissionLib.NO_CONDITION,
            permissionId: StdMemberAddHelper(helperImplementation)
                .UPDATE_MULTISIG_SETTINGS_PERMISSION_ID()
        });

        // The DAO doesn't need APPLY_UPDATE_PERMISSION_ID on the PSP

        // pluginUpgrader permissions
        if (_pluginUpgrader != address(0x0)) {
            // pluginUpgrader can make the DAO execute applyUpdate
            // pluginUpgrader can make the DAO execute grant/revoke
            address[] memory _targetPluginAddresses = new address[](2);
            _targetPluginAddresses[0] = stdGovernancePlugin;
            _targetPluginAddresses[1] = _stdMemberAddHelper;
            OnlyPluginUpgraderCondition _onlyPluginUpgraderCondition = new OnlyPluginUpgraderCondition(
                    DAO(payable(_dao)),
                    PluginSetupProcessor(pluginSetupProcessor),
                    _targetPluginAddresses
                );
            permissions[6] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.GrantWithCondition,
                where: _dao,
                who: _pluginUpgrader,
                condition: address(_onlyPluginUpgraderCondition),
                permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
            });
        }

        preparedSetupData.permissions = permissions;
        preparedSetupData.helpers = new address[](1);
        preparedSetupData.helpers[0] = _stdMemberAddHelper;
    }

    /// @inheritdoc IPluginSetup
    function prepareUninstallation(
        address _dao,
        SetupPayload calldata _payload
    ) external view returns (PermissionLib.MultiTargetPermission[] memory permissionChanges) {
        if (_payload.currentHelpers.length != 1) {
            revert InvalidHelpers(_payload.currentHelpers.length);
        }

        // Decode incoming params
        address _pluginUpgrader = decodeUninstallationParams(_payload.data);
        address _stdMemberAddHelper = _payload.currentHelpers[0];

        permissionChanges = new PermissionLib.MultiTargetPermission[](
            _pluginUpgrader == address(0x0) ? 6 : 7
        );

        // Standard governance plugin permissions

        // The plugin can no longer execute on the DAO
        permissionChanges[0] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _dao,
            who: _payload.plugin,
            condition: address(0),
            permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        });
        // The DAO can no longer update the plugin settings
        permissionChanges[1] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: address(0),
            permissionId: StdGovernancePlugin(pluginImplementation)
                .UPDATE_VOTING_SETTINGS_PERMISSION_ID()
        });
        // The DAO can no longer manage the list of addresses
        permissionChanges[2] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _payload.plugin,
            who: _dao,
            condition: address(0),
            permissionId: StdGovernancePlugin(pluginImplementation).UPDATE_ADDRESSES_PERMISSION_ID()
        });

        // Plugin permissions

        // The StdGovernancePlugin can no longer propose on the StdMemberAddHelper
        permissionChanges[3] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _stdMemberAddHelper,
            who: _payload.plugin,
            condition: address(0),
            permissionId: StdMemberAddHelper(helperImplementation).PROPOSER_PERMISSION_ID()
        });

        // The plugin can no longer execute on the DAO
        permissionChanges[4] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _dao,
            who: _stdMemberAddHelper,
            condition: address(0),
            permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
        });
        // The DAO can no longer update the plugin settings
        permissionChanges[5] = PermissionLib.MultiTargetPermission({
            operation: PermissionLib.Operation.Revoke,
            where: _stdMemberAddHelper,
            who: _dao,
            condition: address(0),
            permissionId: StdMemberAddHelper(helperImplementation)
                .UPDATE_MULTISIG_SETTINGS_PERMISSION_ID()
        });

        if (_pluginUpgrader != address(0x0)) {
            // pluginUpgrader can no longer make the DAO execute applyUpdate
            // pluginUpgrader can no longer make the DAO execute grant/revoke
            permissionChanges[6] = PermissionLib.MultiTargetPermission({
                operation: PermissionLib.Operation.Revoke,
                where: _dao,
                who: _pluginUpgrader,
                condition: address(0),
                permissionId: DAO(payable(_dao)).EXECUTE_PERMISSION_ID()
            });
        }
    }

    /// @inheritdoc IPluginSetup
    function implementation() external view returns (address) {
        return pluginImplementation;
    }

    /// @notice Encodes the given installation parameters into a byte array
    function encodeInstallationParams(
        MajorityVotingBase.VotingSettings calldata _votingSettings,
        address[] calldata _initialEditors,
        uint64 _memberAddProposalDuration,
        address _pluginUpgrader
    ) public pure returns (bytes memory) {
        return
            abi.encode(
                _votingSettings,
                _initialEditors,
                _memberAddProposalDuration,
                _pluginUpgrader
            );
    }

    /// @notice Decodes the given byte array into the original installation parameters
    function decodeInstallationParams(
        bytes memory _data
    )
        public
        pure
        returns (
            MajorityVotingBase.VotingSettings memory votingSettings,
            address[] memory initialEditors,
            uint64 memberAddProposalDuration,
            address pluginUpgrader
        )
    {
        (votingSettings, initialEditors, memberAddProposalDuration, pluginUpgrader) = abi.decode(
            _data,
            (MajorityVotingBase.VotingSettings, address[], uint64, address)
        );
    }

    /// @notice Encodes the given uninstallation parameters into a byte array
    function encodeUninstallationParams(
        address _pluginUpgrader
    ) public pure returns (bytes memory) {
        return abi.encode(_pluginUpgrader);
    }

    /// @notice Decodes the given byte array into the original uninstallation parameters
    function decodeUninstallationParams(
        bytes memory _data
    ) public pure returns (address pluginUpgrader) {
        (pluginUpgrader) = abi.decode(_data, (address));
    }
}
