import { MyPluginContext } from './context';
import {
  IMyPluginClient,
  IMyPluginClientDecoding,
  IMyPluginClientEncoding,
  IMyPluginClientEstimation,
  IMyPluginClientMethods,
  MyPluginClientEstimation,
  MyPluginClientDecoding,
  MyPluginClientEncoding,
  MyPluginClientMethods,
} from './internal';
import { StandardSpaceClientCore } from './internal/core';

export class MyPluginClient
  extends StandardSpaceClientCore
  implements IMyPluginClient
{
  public methods: IMyPluginClientMethods;
  public estimation: IMyPluginClientEstimation;
  public encoding: IMyPluginClientEncoding;
  public decoding: IMyPluginClientDecoding;

  constructor(pluginContext: MyPluginContext) {
    super(pluginContext);
    this.methods = new MyPluginClientMethods(pluginContext);
    this.estimation = new MyPluginClientEstimation(pluginContext);
    this.encoding = new MyPluginClientEncoding(pluginContext);
    this.decoding = new MyPluginClientDecoding(pluginContext);
  }
}
