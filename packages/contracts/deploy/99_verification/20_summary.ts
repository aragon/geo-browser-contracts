import {GovernancePluginsSetupParams} from '../../plugin-setup-params';
import {isLocalChain} from '../../utils/hardhat';
import {getPluginRepoInfo} from '../../utils/plugin-repo-info';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const pluginRepoInfo = getPluginRepoInfo(
    GovernancePluginsSetupParams.PLUGIN_REPO_ENS_NAME,
    hre.network.name
  );
  if (!pluginRepoInfo)
    throw new Error('Could not read the address of the deployed contract');

  console.log(`
If you wish to configure the Managing DAO:

1) Update the .env file with this value:

GOVERNANCE_PLUGIN_REPO_ADDRESS="${pluginRepoInfo.address}"

2) Define the following values:
MGMT_DAO_PROPOSAL_DURATION="604800"   # 60 * 60 * 24 * 7 (seconds)
MGMT_DAO_MIN_PROPOSAL_PARTICIPATION="500000"   # 50%
MGMT_DAO_PROPOSAL_SUPPORT_THRESHOLD="500000"   # 50%
MGMT_DAO_INITIAL_EDITORS="0x1234,0x2345,0x3456,0x4567..." # Comma separated addresses

3) Run the following command:
$ yarn managing-dao-setup
`);
};

export default func;

func.tags = ['Verification'];
func.runAtTheEnd = true;
func.skip = (hre: HardhatRuntimeEnvironment) =>
  Promise.resolve(isLocalChain(hre.network.name));
