import {
  MyPluginContextState,
  MyPluginOverriddenState,
} from "./internal/types";
import { MyPluginContextParams } from "./types";
import { Context, ContextCore } from "@aragon/sdk-client-common";

const DEFAULT_SPACE_PLUGIN_REPO_ADDRESS = "...";
const DEFAULT_MEMBER_ACCESS_PLUGIN_REPO_ADDRESS = "...";
const DEFAULT_MAIN_VOTING_PLUGIN_REPO_ADDRESS = "...";

export class MyPluginContext extends ContextCore {
  // super is called before the properties are initialized
  // so we initialize them to the value of the parent class
  protected state: MyPluginContextState = this.state;

  // Keeps track of what values are not the default
  protected overriden: MyPluginOverriddenState = this.overriden;

  constructor(
    contextParams?: Partial<MyPluginContextParams>,
    aragonContext?: Context,
  ) {
    // call the parent constructor
    // so it does not complain and we
    // can use this
    super();

    // set the context params inherited from the context
    if (aragonContext) {
      // copy the context properties to this
      Object.assign(this, aragonContext);
    }

    // contextParams have priority over the aragonContext
    if (contextParams) {
      // overide the context params with the ones passed to the constructor
      this.set(contextParams);
    }
  }

  public set(contextParams: MyPluginContextParams) {
    // the super function will call this set
    // so we need to call the parent set first
    super.set(contextParams);

    // set the default values for the new params
    this.setDefaults();

    // override default params if specified in the context
    if (contextParams.spacePluginAddress) {
      // override the spacePluginAddress value
      this.state.spacePluginAddress = contextParams.spacePluginAddress;
      // set the overriden flag to true in case set is called again
      this.overriden.spacePluginAddress = true;
    }
    if (contextParams.memberAccessPluginAddress) {
      this.state.memberAccessPluginAddress =
        contextParams.memberAccessPluginAddress;
      this.overriden.memberAccessPluginAddress = true;
    }
    if (contextParams.mainVotingPluginAddress) {
      this.state.mainVotingPluginAddress =
        contextParams.mainVotingPluginAddress;
      this.overriden.mainVotingPluginAddress = true;
    }
  }

  private setDefaults() {
    // Optional: Set any settings that may have a default value here

    if (!this.overriden.spacePluginRepoAddress) {
      this.state.spacePluginRepoAddress = DEFAULT_SPACE_PLUGIN_REPO_ADDRESS;
    }
    if (!this.overriden.memberAccessPluginRepoAddress) {
      this.state.memberAccessPluginRepoAddress =
        DEFAULT_MEMBER_ACCESS_PLUGIN_REPO_ADDRESS;
    }
    if (!this.overriden.mainVotingPluginRepoAddress) {
      this.state.mainVotingPluginRepoAddress =
        DEFAULT_MAIN_VOTING_PLUGIN_REPO_ADDRESS;
    }
  }

  get spacePluginAddress(): string {
    return this.state.spacePluginAddress;
  }

  get memberAccessPluginAddress(): string {
    return this.state.memberAccessPluginAddress;
  }

  get mainVotingPluginAddress(): string {
    return this.state.mainVotingPluginAddress;
  }

  get spacePluginRepoAddress(): string {
    return this.state.spacePluginRepoAddress;
  }

  get memberAccessPluginRepoAddress(): string {
    return this.state.memberAccessPluginRepoAddress;
  }

  get mainVotingPluginRepoAddress(): string {
    return this.state.mainVotingPluginRepoAddress;
  }
}
