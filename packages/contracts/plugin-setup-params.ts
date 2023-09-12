import spaceBuildMetadata from "./src/space-build-metadata.json";
import spaceReleaseMetadata from "./src/space-release-metadata.json";
import personalSpaceBuildMetadata from "./src/personal-space-voting-build-metadata.json";
import personalSpaceReleaseMetadata from "./src/personal-space-voting-release-metadata.json";
import memberAccessVotingBuildMetadata from "./src/member-access-voting-build-metadata.json";
import memberAccessVotingReleaseMetadata from "./src/member-access-voting-release-metadata.json";
import mainVotingBuildMetadata from "./src/main-voting-build-metadata.json";
import mainVotingReleaseMetadata from "./src/main-voting-release-metadata.json";

export const SpacePluginSetupParams: PluginSetupParams = {
  PLUGIN_REPO_ENS_NAME: "geo-browser-space",
  PLUGIN_CONTRACT_NAME: "SpacePlugin",
  PLUGIN_SETUP_CONTRACT_NAME: "SpacePluginSetup",
  VERSION: {
    release: 1, // Increment this number ONLY if breaking/incompatible changes were made. Updates between releases are NOT possible.
    build: 1, // Increment this number if non-breaking/compatible changes were made. Updates to newer builds are possible.
  },
  METADATA: {
    build: spaceBuildMetadata,
    release: spaceReleaseMetadata,
  },
};

export const PersonalSpaceVotingPluginSetupParams: PluginSetupParams = {
  PLUGIN_REPO_ENS_NAME: "geo-browser-personal-voting",
  PLUGIN_CONTRACT_NAME: "PersonalSpaceVotingPlugin",
  PLUGIN_SETUP_CONTRACT_NAME: "PersonalSpaceVotingPluginSetup",
  VERSION: {
    release: 1, // Increment this number ONLY if breaking/incompatible changes were made. Updates between releases are NOT possible.
    build: 1, // Increment this number if non-breaking/compatible changes were made. Updates to newer builds are possible.
  },
  METADATA: {
    build: personalSpaceBuildMetadata,
    release: personalSpaceReleaseMetadata,
  },
};

export const MemberAccessPluginSetupParams: PluginSetupParams = {
  PLUGIN_REPO_ENS_NAME: "geo-browser-member-access-voting",
  PLUGIN_CONTRACT_NAME: "MemberAccessPlugin",
  PLUGIN_SETUP_CONTRACT_NAME: "MemberAccessPluginSetup",
  VERSION: {
    release: 1, // Increment this number ONLY if breaking/incompatible changes were made. Updates between releases are NOT possible.
    build: 1, // Increment this number if non-breaking/compatible changes were made. Updates to newer builds are possible.
  },
  METADATA: {
    build: memberAccessVotingBuildMetadata,
    release: memberAccessVotingReleaseMetadata,
  },
};

export const MainVotingPluginSetupParams: PluginSetupParams = {
  PLUGIN_REPO_ENS_NAME: "geo-browser-main-voting",
  PLUGIN_CONTRACT_NAME: "MainVotingPlugin",
  PLUGIN_SETUP_CONTRACT_NAME: "MainVotingPluginSetup",
  VERSION: {
    release: 1, // Increment this number ONLY if breaking/incompatible changes were made. Updates between releases are NOT possible.
    build: 1, // Increment this number if non-breaking/compatible changes were made. Updates to newer builds are possible.
  },
  METADATA: {
    build: mainVotingBuildMetadata,
    release: mainVotingReleaseMetadata,
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
  METADATA: {
    build: { [k: string]: any };
    release: { [k: string]: any };
  };
};
