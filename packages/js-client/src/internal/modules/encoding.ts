import { IMyPluginClientEncoding } from "../interfaces";
import { ClientCore, DaoAction } from "@aragon/sdk-client-common";
import { hexToBytes } from "@aragon/sdk-common";
import { SpacePlugin__factory } from "../../../../contracts/typechain";
import { MyPluginContext } from "../../context";

export class MyPluginClientEncoding extends ClientCore
  implements IMyPluginClientEncoding {
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
    const data = iface.encodeFunctionData("processGeoProposal", [
      1,
      4,
      "ipfs://....",
    ]);

    return {
      to: this.spacePluginAddress,
      value: BigInt(0),
      data: hexToBytes(data),
    };
  }
}
