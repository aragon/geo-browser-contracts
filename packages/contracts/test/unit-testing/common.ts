import { ethers } from "hardhat";

export const abiCoder = ethers.utils.defaultAbiCoder;
export const EMPTY_DATA = "0x";

export const DEPLOYER_PERMISSION_ID = ethers.utils.id("DEPLOYER_PERMISSION");
export const EDITOR_PERMISSION_ID = ethers.utils.id("EDITOR_PERMISSION");
export const MEMBER_PERMISSION_ID = ethers.utils.id("MEMBER_PERMISSION");

export const CONTENT_PERMISSION_ID = ethers.utils.id("CONTENT_PERMISSION");
export const SUBSPACE_PERMISSION_ID = ethers.utils.id("SUBSPACE_PERMISSION");

export const ADDRESS_ZERO = ethers.constants.AddressZero;
export const ADDRESS_ONE = `0x${"0".repeat(39)}1`;
export const ADDRESS_TWO = `0x${"0".repeat(39)}2`;
export const NO_CONDITION = ADDRESS_ZERO;
