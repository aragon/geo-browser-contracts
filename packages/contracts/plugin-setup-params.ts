export const SpacePluginSetupParams: PluginSetupParams = {
  PLUGIN_REPO_ENS_NAME: 'geo-browser-space',
  PLUGIN_CONTRACT_NAME: 'SpacePlugin',
  PLUGIN_SETUP_CONTRACT_NAME: 'SpacePluginSetup',
  VERSION: {
    release: 1, // Increment this number ONLY if breaking/incompatible changes were made. Updates between releases are NOT possible.
    build: 1, // Increment this number if non-breaking/compatible changes were made. Updates to newer builds are possible.
  },
};

export const PersonalSpaceAdminPluginSetupParams: PluginSetupParams = {
  PLUGIN_REPO_ENS_NAME: 'geo-browser-personal-voting',
  PLUGIN_CONTRACT_NAME: 'PersonalSpaceAdminPlugin',
  PLUGIN_SETUP_CONTRACT_NAME: 'PersonalSpaceAdminPluginSetup',
  VERSION: {
    release: 1, // Increment this number ONLY if breaking/incompatible changes were made. Updates between releases are NOT possible.
    build: 1, // Increment this number if non-breaking/compatible changes were made. Updates to newer builds are possible.
  },
};

export const GovernancePluginsSetupParams: PluginSetupParams = {
  PLUGIN_REPO_ENS_NAME: 'geo-browser-governance',
  PLUGIN_CONTRACT_NAME: 'MainVotingPlugin and MainMemberAddHelper',
  PLUGIN_SETUP_CONTRACT_NAME: 'GovernancePluginsSetup',
  VERSION: {
    release: 1, // Increment this number ONLY if breaking/incompatible changes were made. Updates between releases are NOT possible.
    build: 1, // Increment this number if non-breaking/compatible changes were made. Updates to newer builds are possible.
  },
};

// Types

export type PluginSetupParams = {
  PLUGIN_REPO_ENS_NAME: string;
  PLUGIN_CONTRACT_NAME: string;
  PLUGIN_SETUP_CONTRACT_NAME: string;
  VERSION: {
    release: number;
    build: number;
  };
};
