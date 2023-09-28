import { MyPluginContext } from "../context";
import { ClientCore } from "@aragon/sdk-client-common";
import {
  IMyPluginClientDecoding,
  IMyPluginClientEncoding,
  IMyPluginClientEstimation,
  IMyPluginClientMethods,
} from "./interfaces";
import {
  MyPluginClientDecoding,
  MyPluginClientEncoding,
  MyPluginClientEstimation,
  MyPluginClientMethods,
} from "./modules";

export class StandardSpaceClientCore extends ClientCore {
  public methods: IMyPluginClientMethods;
  public encoding: IMyPluginClientEncoding;
  public decoding: IMyPluginClientDecoding;
  public estimation: IMyPluginClientEstimation;

  constructor(pluginContext: MyPluginContext) {
    super(pluginContext);

    this.methods = new MyPluginClientMethods(pluginContext);
    this.encoding = new MyPluginClientEncoding(pluginContext);
    this.decoding = new MyPluginClientDecoding(pluginContext);
    this.estimation = new MyPluginClientEstimation(pluginContext);
  }
}
