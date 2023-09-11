import {
  MainVotingPluginDetails,
  MemberAccessPluginDetails,
  PersonalSpaceVotingPluginDetails,
  PluginDetails,
  SpacePluginDetails,
} from "../../plugin-details";
import { addCreatedVersion, getPluginInfo } from "../../utils/helpers";
import { toHex } from "../../utils/ipfs";
import { uploadToIPFS } from "../../utils/ipfs";
import { PluginRepo__factory, PluginSetup__factory } from "@aragon/osx-ethers";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = function (hre: HardhatRuntimeEnvironment) {
  return publishPlugin(hre, SpacePluginDetails)
    .then(() => publishPlugin(hre, PersonalSpaceVotingPluginDetails))
    .then(() => publishPlugin(hre, MemberAccessPluginDetails))
    .then(() => publishPlugin(hre, MainVotingPluginDetails));
};

async function publishPlugin(
  hre: HardhatRuntimeEnvironment,
  pluginDetails: PluginDetails,
) {
  console.log(
    `Publishing ${pluginDetails.PLUGIN_SETUP_CONTRACT_NAME} as v${pluginDetails.VERSION.release}.${pluginDetails.VERSION.build} in the "${pluginDetails.PLUGIN_REPO_ENS_NAME}" plugin repo`,
  );

  const { deployments, network } = hre;
  const [deployer] = await hre.ethers.getSigners();

  // Upload the metadata to IPFS
  const releaseMetadataURI = `ipfs://${await uploadToIPFS(
    JSON.stringify(pluginDetails.METADATA.release),
    false,
  )}`;
  const buildMetadataURI = `ipfs://${await uploadToIPFS(
    JSON.stringify(pluginDetails.METADATA.build),
    false,
  )}`;

  console.log(`Uploaded release metadata: ${releaseMetadataURI}`);
  console.log(`Uploaded build metadata: ${buildMetadataURI}`);

  // Get PluginSetup
  const setup = await deployments.get(pluginDetails.PLUGIN_SETUP_CONTRACT_NAME);

  // Get PluginRepo
  const pluginRepo = PluginRepo__factory.connect(
    getPluginInfo(network.name)[network.name]["address"],
    deployer,
  );

  // Check release number
  const latestRelease = await pluginRepo.latestRelease();
  if (pluginDetails.VERSION.release > latestRelease + 1) {
    throw Error(
      `Publishing with release number ${pluginDetails.VERSION.release} is not possible. 
      The latest release is ${latestRelease} and the next release you can publish is release number ${
        latestRelease + 1
      }.`,
    );
  }

  // Check build number
  const latestBuild =
    (await pluginRepo.buildCount(pluginDetails.VERSION.release)).toNumber();
  if (pluginDetails.VERSION.build <= latestBuild) {
    throw Error(
      `Publishing with build number ${pluginDetails.VERSION.build} is not possible. 
      The latest build is ${latestBuild} and build ${pluginDetails.VERSION.build} has been deployed already.`,
    );
  }
  if (pluginDetails.VERSION.build > latestBuild + 1) {
    throw Error(
      `Publishing with build number ${pluginDetails.VERSION.build} is not possible. 
      The latest build is ${latestBuild} and the next release you can publish is release number ${
        latestBuild + 1
      }.`,
    );
  }

  // Create Version
  const tx = await pluginRepo.createVersion(
    pluginDetails.VERSION.release,
    setup.address,
    toHex(buildMetadataURI),
    toHex(releaseMetadataURI),
  );

  const blockNumberOfPublication = (await tx.wait()).blockNumber;

  if (setup == undefined || setup?.receipt == undefined) {
    throw Error("setup deployment unavailable");
  }

  const version = await pluginRepo["getLatestVersion(uint8)"](
    pluginDetails.VERSION.release,
  );
  if (pluginDetails.VERSION.release !== version.tag.release) {
    throw Error("something went wrong");
  }

  const implementationAddress = await PluginSetup__factory.connect(
    setup.address,
    deployer,
  ).implementation();

  console.log(
    `Published ${pluginDetails.PLUGIN_SETUP_CONTRACT_NAME} at ${setup.address} in PluginRepo ${pluginDetails.PLUGIN_REPO_ENS_NAME} at ${pluginRepo.address} at block ${blockNumberOfPublication}.`,
  );

  addCreatedVersion(
    network.name,
    { release: pluginDetails.VERSION.release, build: version.tag.build },
    { release: releaseMetadataURI, build: buildMetadataURI },
    blockNumberOfPublication,
    {
      name: pluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
      address: setup.address,
      args: [],
      blockNumberOfDeployment: setup.receipt.blockNumber,
    },
    {
      name: pluginDetails.PLUGIN_CONTRACT_NAME,
      address: implementationAddress,
      args: [],
      blockNumberOfDeployment: setup.receipt.blockNumber,
    },
    [],
  );
}

export default func;
func.tags = [
  SpacePluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  PersonalSpaceVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  MemberAccessPluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  MainVotingPluginDetails.PLUGIN_SETUP_CONTRACT_NAME,
  "Publication",
];
