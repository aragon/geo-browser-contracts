import * as BUILD_METADATA from '../../../../contracts/src/build-metadata.json';
import {
  MainVotingPlugin__factory,
  MemberAccessPlugin__factory, // PersonalSpaceAdminPlugin__factory,
  SpacePlugin__factory,
} from '../../../../contracts/typechain';
import { MyPluginContext } from '../../context';
import {
  NumberListItem,
  NumbersQueryParams,
  NumbersSortBy,
  PrepareInstallationParams,
} from '../../types';
import { QueryNumber, QueryNumbers } from '../graphql-queries';
import { IMyPluginClientMethods } from '../interfaces';
import {
  ProposeMemberStep,
  ProposeMemberStepValue,
  SubgraphNumber,
  SubgraphNumberListItem,
} from '../types';
import { toNumber, toNumberListItem } from '../utils';
import {
  ClientCore,
  prepareGenericInstallation,
  PrepareInstallationStepValue,
  SortDirection,
} from '@aragon/sdk-client-common';

export class MyPluginClientMethods
  extends ClientCore
  implements IMyPluginClientMethods
{
  private spacePluginAddress: string;
  private memberAccessPluginAddress: string;
  private mainVotingPluginAddress: string;

  private spacePluginRepoAddress: string;
  private memberAccessPluginRepoAddress: string;
  private mainVotingPluginRepoAddress: string;

  constructor(pluginContext: MyPluginContext) {
    super(pluginContext);

    this.spacePluginAddress = pluginContext.spacePluginAddress;
    this.memberAccessPluginAddress = pluginContext.memberAccessPluginAddress;
    this.mainVotingPluginAddress = pluginContext.mainVotingPluginAddress;
    // repos
    this.spacePluginRepoAddress = pluginContext.spacePluginRepoAddress;
    this.memberAccessPluginRepoAddress =
      pluginContext.memberAccessPluginRepoAddress;
    this.mainVotingPluginRepoAddress =
      pluginContext.mainVotingPluginRepoAddress;
  }

  // implementation of the methods in the interface
  public async *prepareInstallation(
    params: PrepareInstallationParams
  ): AsyncGenerator<PrepareInstallationStepValue> {
    // do any additionall custom operations here before you prepare your plugin

    // ...

    yield* prepareGenericInstallation(this.web3, {
      daoAddressOrEns: params.daoAddressOrEns,
      pluginRepo: this.spacePluginRepoAddress,
      version: params.version,
      installationAbi: BUILD_METADATA.pluginSetup.prepareInstallation.inputs,
      installationParams: [params.settings.number],
    });
  }

  async doSomething() {
    const spaceClient = new SpacePlugin__factory().attach(
      this.spacePluginAddress
    );
    const memberAccessClient = new MemberAccessPlugin__factory().attach(
      this.memberAccessPluginAddress
    );
    const mainVotingClient = new MainVotingPlugin__factory().attach(
      this.mainVotingPluginAddress
    );

    // complex operation
    const tx1 = await memberAccessClient.proposeNewMember(
      'ipfs://...',
      '0x0.....'
    );
    await tx1.wait();

    const tx2 = await mainVotingClient.createProposal(
      '',
      [],
      0,
      0,
      0,
      1,
      false
    );
    await tx2.wait();
  }

  public async getNumber(daoAddressOrEns: string): Promise<bigint> {
    const query = QueryNumber;
    const name = 'Numbers';
    type T = { dao: SubgraphNumber };
    const { dao } = await this.graphql.request<T>({
      query,
      params: { id: daoAddressOrEns },
      name,
    });
    return toNumber(dao);
  }

  public async getNumbers({
    limit = 10,
    skip = 0,
    direction = SortDirection.ASC,
    sortBy = NumbersSortBy.CREATED_AT,
  }: NumbersQueryParams): Promise<NumberListItem[]> {
    const query = QueryNumbers;
    const params = {
      limit,
      skip,
      direction,
      sortBy,
    };
    const name = 'Numbers';
    type T = { daos: SubgraphNumberListItem[] };
    const { daos } = await this.graphql.request<T>({
      query,
      params,
      name,
    });
    return Promise.all(
      daos.map(async (number) => {
        return toNumberListItem(number);
      })
    );
  }

  // implementation of the methods in the interface
  public async *proposeMember(
    memberAddress: string
  ): AsyncGenerator<ProposeMemberStepValue> {
    const signer = this.web3.getSigner();
    const storageClient = MemberAccessPlugin__factory.connect(
      this.spacePluginAddress,
      signer
    );

    // TODO: PIN metadata
    const metadataUri = 'ipfs://...';

    const tx = await storageClient.proposeNewMember(metadataUri, memberAddress);

    yield {
      status: ProposeMemberStep.WAITING,
      txHash: tx.hash,
    };

    await tx.wait();

    yield {
      status: ProposeMemberStep.DONE,
    };
  }
}
