import {isLocalChain} from '../../utils/hardhat';
import {DAO__factory, IDAO} from '@aragon/osx-ethers';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const MANAGING_DAO_ADDRESS = process.env.MANAGING_DAO_ADDRESS ?? '';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [deployer] = await hre.ethers.getSigners();

  console.log('Revoking the execute permission to the deployment wallet');

  // Revoke the permission to the deployer wallet
  const mgmtDAO = DAO__factory.connect(MANAGING_DAO_ADDRESS, deployer);

  const actions: IDAO.ActionStruct[] = [
    {
      to: MANAGING_DAO_ADDRESS,
      value: 0,
      data: DAO__factory.createInterface().encodeFunctionData('revoke', [
        MANAGING_DAO_ADDRESS,
        deployer.address,
        await mgmtDAO.EXECUTE_PERMISSION_ID(),
      ]),
    },
  ];

  const tx = await DAO__factory.connect(MANAGING_DAO_ADDRESS, deployer).execute(
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    actions,
    0
  );
  await tx.wait();

  console.log('Execute permission revoked');
};

export default func;
func.tags = ['ManagingDAO'];
func.skip = (hre: HardhatRuntimeEnvironment) =>
  Promise.resolve(isLocalChain(hre.network.name));
