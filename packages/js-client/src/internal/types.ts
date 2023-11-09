import { ContextState, OverriddenState } from '@aragon/sdk-client-common';

export type SubgraphNumberListItem = {
  id: string;
  subdomain: string;
  number: {
    value: string;
  };
};

export type SubgraphNumber = {
  number: {
    value: string;
  };
};

export type MyPluginContextState = ContextState & {
  // extend the Context state with a new state for storing
  // the new parameters
  spacePluginAddress: string;
  memberAccessPluginAddress: string;
  mainVotingPluginAddress: string;

  spacePluginRepoAddress: string;
  memberAccessPluginRepoAddress: string;
  mainVotingPluginRepoAddress: string;
};

export type MyPluginOverriddenState = OverriddenState & {
  [key in keyof MyPluginContextState]: boolean;
};

export enum ProposeMemberStep {
  WAITING = 'waiting',
  DONE = 'done',
}
export type ProposeMemberStepValue =
  | {
      status: ProposeMemberStep.WAITING;
      txHash: string;
    }
  | {
      status: ProposeMemberStep.DONE;
    };
