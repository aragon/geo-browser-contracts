import {
  SpacePlugin__factory,
  GovernancePluginsSetup__factory,
} from '../../../../contracts/typechain';
import { MyPluginContext } from '../../context';
import { PrepareInstallationParams } from '../../types';
import { PLUGIN_1_REPO_ADDRESS } from '../constants';
import { IMyPluginClientEncoding, VotingMode } from '../interfaces';
import { PluginRepo__factory } from '@aragon/osx-ethers';
import {
  ClientCore,
  DaoAction,
  PluginInstallItem,
  SupportedNetwork,
  SupportedNetworksArray,
} from '@aragon/sdk-client-common';
import { hexToBytes } from '@aragon/sdk-common';
import { AddressZero } from '@ethersproject/constants';
import { Networkish, getNetwork } from '@ethersproject/providers';

export class MyPluginClientEncoding
  extends ClientCore
  implements IMyPluginClientEncoding
{
  private spacePluginAddress: string;
  private memberAccessPluginAddress: string;
  private mainVotingPluginAddress: string;

  constructor(pluginContext: MyPluginContext) {
    super(pluginContext);

    this.spacePluginAddress = pluginContext.spacePluginAddress;
    this.memberAccessPluginAddress = pluginContext.memberAccessPluginAddress;
    this.mainVotingPluginAddress = pluginContext.mainVotingPluginAddress;
  }

  // implementation of the methods in the interface
  public storeNumberAction(): DaoAction {
    const iface = SpacePlugin__factory.createInterface();
    const data = iface.encodeFunctionData('processGeoProposal', [
      1,
      4,
      'ipfs://....',
    ]);

    return {
      to: this.spacePluginAddress,
      value: BigInt(0),
      data: hexToBytes(data),
    };
  }

  public async getPluginInstallItem(
    params: PrepareInstallationParams,
    network: Networkish
  ): Promise<PluginInstallItem> {
    const networkName = getNetwork(network).name as SupportedNetwork;
    if (!SupportedNetworksArray.includes(networkName)) {
      throw new Error('Unsupported network: ' + networkName);
    }
    const pluginRepo = PluginRepo__factory.connect(
      PLUGIN_1_REPO_ADDRESS,
      this.web3.getProvider()
    );

    const { pluginSetup: pluginSetupAddress } = await pluginRepo[
      'getLatestVersion(uint8)'
    ](1);

    const pluginSetup = GovernancePluginsSetup__factory.connect(
      pluginSetupAddress,
      this.web3.getProvider()
    );
    const hexBytes = await pluginSetup.encodeInstallationParams(
      {
        minDuration: 60 * 60 * 24 * 5,
        minParticipation: 0.25,
        minProposerVotingPower: 0,
        supportThreshold: 0.55,
        votingMode: VotingMode.EarlyExecution,
      },
      [params.settings.initialEditorAddress],
      60 * 60 * 24 * 2, // min duration for member add
      AddressZero // No plugin upgrader
    );

    return {
      id: PLUGIN_1_REPO_ADDRESS,
      data: hexToBytes(hexBytes),
    };
  }
}
