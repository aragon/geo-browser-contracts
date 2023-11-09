import {
  NumberListItem,
  NumbersQueryParams,
  PrepareInstallationParams,
} from '../types';
import { ProposeMemberStepValue } from './types';
import {
  DaoAction,
  GasFeeEstimation,
  PluginInstallItem,
  PrepareInstallationStepValue,
} from '@aragon/sdk-client-common';
import { Networkish } from '@ethersproject/providers';

export interface IMyPluginClient {
  methods: IMyPluginClientMethods;
  estimation: IMyPluginClientEstimation;
  encoding: IMyPluginClientEncoding;
  decoding: IMyPluginClientDecoding;
}

export interface IMyPluginClientMethods {
  // fill with methods
  prepareInstallation(
    params: PrepareInstallationParams
  ): AsyncGenerator<PrepareInstallationStepValue>;
  doSomething(): Promise<void>;
  getNumber(daoAddressOrEns: string): Promise<bigint>;
  getNumbers(params: NumbersQueryParams): Promise<NumberListItem[]>;
  proposeMember(memberAddress: string): AsyncGenerator<ProposeMemberStepValue>;
}
export interface IMyPluginClientEstimation {
  prepareInstallation(
    params: PrepareInstallationParams
  ): Promise<GasFeeEstimation>;
}
export interface IMyPluginClientEncoding {
  getPluginInstallItem(
    params: PrepareInstallationParams,
    network: Networkish
  ): Promise<PluginInstallItem>;
  storeNumberAction(number: bigint): DaoAction;
}
export interface IMyPluginClientDecoding {
  storeNumberAction(data: Uint8Array): bigint;
}

export enum VotingMode {
  Standard,
  EarlyExecution,
  VoteReplacement,
}
