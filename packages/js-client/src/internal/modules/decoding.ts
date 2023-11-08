// import { MyPluginContext } from "../../context";
import { IMyPluginClientDecoding } from '../interfaces';
import { ClientCore } from '@aragon/sdk-client-common';
import { MyPlugin__factory } from '@aragon/simple-storage-ethers';

export class MyPluginClientDecoding
  extends ClientCore
  implements IMyPluginClientDecoding
{
  public storeNumberAction(data: Uint8Array): bigint {
    const iface = MyPlugin__factory.createInterface();
    const res = iface.decodeFunctionData('storeNumber', data);
    return BigInt(res[0]);
  }
}
