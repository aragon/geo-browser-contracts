import { ethers } from "hardhat";

export const abiCoder = ethers.utils.defaultAbiCoder;
export const EMPTY_DATA = "0x";
export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export const DEPLOYER_PERMISSION_ID = ethers.utils.id("DEPLOYER_PERMISSION");
export const EDITOR_PERMISSION_ID = ethers.utils.id("EDITOR_PERMISSION");
export const MEMBER_PERMISSION_ID = ethers.utils.id("MEMBER_PERMISSION");

export const CONTENT_PERMISSION_ID = ethers.utils.id("CONTENT_PERMISSION");
export const SUBSPACE_PERMISSION_ID = ethers.utils.id("SUBSPACE_PERMISSION");

export const EXECUTE_PERMISSION_ID = ethers.utils.id("EXECUTE_PERMISSION");
export const UPDATE_MULTISIG_SETTINGS_PERMISSION_ID = ethers.utils.id(
  "UPDATE_MULTISIG_SETTINGS_PERMISSION",
);
export const UPDATE_VOTING_SETTINGS_PERMISSION_ID = ethers.utils.id(
  "UPDATE_VOTING_SETTINGS_PERMISSION",
);
export const UPDATE_ADDRESSES_PERMISSION_ID = ethers.utils.id(
  "UPDATE_ADDRESSES_PERMISSION",
);
export const UPGRADE_PLUGIN_PERMISSION_ID = ethers.utils.id(
  "UPGRADE_PLUGIN_PERMISSION",
);
export const ROOT_PERMISSION_ID = ethers.utils.id("ROOT_PERMISSION");

export const ADDRESS_ZERO = ethers.constants.AddressZero;
export const ADDRESS_ONE = `0x${"0".repeat(39)}1`;
export const ADDRESS_TWO = `0x${"0".repeat(39)}2`;
export const NO_CONDITION = ADDRESS_ZERO;

// MAIN VOTING PLUGIN

const RATIO_BASE = 10 ** 6;
const EARLY_EXECUTION_MODE = 1;

export const defaultMainVotingSettings = {
  minDuration: 60 * 60, // 1 second
  minParticipation: 0.3 * RATIO_BASE, // 30%
  supportThreshold: 0.5 * RATIO_BASE, // 50% + 1
  minProposerVotingPower: 0,
  votingMode: EARLY_EXECUTION_MODE,
};

export enum VoteOption {
  None = 0,
  Abstain = 1,
  Yes = 2,
  No = 3,
}
