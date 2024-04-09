import {DAO__factory} from '@aragon/osx-ethers';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [deployer] = await hre.ethers.getSigners();

  console.log('\nChecking the permissions of the deployment wallet');

  if (!hre.managingDao.address) {
    throw new Error('The Managing DAO is not ready');
  }
  const mgmtDAO = DAO__factory.connect(hre.managingDao.address, deployer);

  const perm = await mgmtDAO.hasPermission(
    mgmtDAO.address,
    deployer.address,
    await mgmtDAO.EXECUTE_PERMISSION_ID(),
    '0x'
  );
  if (perm) {
    throw new Error(
      'The governance plugin of the Managing DAO cannot execute proposals on it'
    );
  }
};

export default func;

func.tags = ['Verification'];
func.runAtTheEnd = true;
