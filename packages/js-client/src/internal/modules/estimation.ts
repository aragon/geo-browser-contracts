import * as BUILD_METADATA from '../../../../contracts/src/build-metadata.json';
import { MyPluginContext } from '../../context';
import { PrepareInstallationParams } from '../../types';
import { IMyPluginClientEstimation } from '../interfaces';
import { PluginRepo__factory } from '@aragon/osx-ethers';
import {
  ClientCore,
  GasFeeEstimation,
  prepareGenericInstallationEstimation,
} from '@aragon/sdk-client-common';

export class MyPluginClientEstimation
  extends ClientCore
  implements IMyPluginClientEstimation
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

  public async prepareInstallation(
    params: PrepareInstallationParams
  ): Promise<GasFeeEstimation> {
    let version = params.version;
    // if not specified use the lates version
    if (!version) {
      // get signer
      const signer = this.web3.getConnectedSigner();
      // connect to the plugin repo
      const pluginRepo = PluginRepo__factory.connect(
        this.myPluginRepoAddress,
        signer
      );
      // get latest release
      const currentRelease = await pluginRepo.latestRelease();
      // get latest version
      const latestVersion = await pluginRepo['getLatestVersion(uint8)'](
        currentRelease
      );
      version = latestVersion.tag;
    }

    return prepareGenericInstallationEstimation(this.web3, {
      daoAddressOrEns: params.daoAddressOrEns,
      pluginRepo: this.myPluginRepoAddress,
      version,
      installationAbi: BUILD_METADATA.pluginSetup.prepareInstallation.inputs,
      installationParams: [params.settings.number],
    });
  }

  // public async storeNumber(number: bigint): Promise<GasFeeEstimation> {
  //   const signer = this.web3.getConnectedSigner();
  //   const myPlugin = MyPlugin__factory.connect(
  //     this.myPluginPluginAddress,
  //     signer,
  //   );
  //   const estimation = await myPlugin.estimateGas.storeNumber(number);
  //   return this.web3.getApproximateGasFee(estimation.toBigInt());
  // }
}
