import {
  NumberListItem,
  NumbersQueryParams,
  PrepareInstallationParams,
} from "../types";
import { Networkish } from "@ethersproject/providers";
import {
  DaoAction,
  GasFeeEstimation,
  PluginInstallItem,
  PrepareInstallationStepValue,
} from "@aragon/sdk-client-common";
import { ProposeMemberStepValue } from "./types";

export interface IMyPluginClient {
  methods: IMyPluginClientMethods;
  estimation: IMyPluginClientEstimation;
  encoding: IMyPluginClientEncoding;
  decoding: IMyPluginClientDecoding;
}

export interface IMyPluginClientMethods {
  // fill with methods
  prepareInstallation(
    params: PrepareInstallationParams,
  ): AsyncGenerator<PrepareInstallationStepValue>;
  doSomething(): Promise<void>;
  getNumber(daoAddressOrEns: string): Promise<bigint>;
  getNumbers(params: NumbersQueryParams): Promise<NumberListItem[]>;
  proposeMember(
    memberAddress: string,
  ): AsyncGenerator<ProposeMemberStepValue>;
}
export interface IMyPluginClientEstimation {
  prepareInstallation(
    params: PrepareInstallationParams,
  ): Promise<GasFeeEstimation>;
}
export interface IMyPluginClientEncoding {
  getPluginInstallItem(
    params: PrepareInstallationParams,
    network: Networkish,
  ): PluginInstallItem;
  storeNumberAction(number: bigint): DaoAction;
}
export interface IMyPluginClientDecoding {
  storeNumberAction(data: Uint8Array): bigint;
}
