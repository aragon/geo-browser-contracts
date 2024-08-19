import * as PLUGIN_ABI from '../../artifacts/src/personal/PersonalAdminPlugin.sol/PersonalAdminPlugin.json';
import {
  PersonalAdminPlugin__factory,
  PersonalAdminSetup,
  PersonalAdminSetup__factory,
} from '../../typechain';
import {getInterfaceID} from '../../utils/interfaces';
import {deployTestDao} from '../helpers/test-dao';
import {Operation} from '../helpers/types';
import {
  ADD_MEMBER_PERMISSION_ID,
  PROPOSER_PERMISSION_ID,
  UPDATE_SETTINGS_PERMISSION_ID,
} from './common';
import {expect} from 'chai';
import {ethers} from 'hardhat';

export const papInterface = new ethers.utils.Interface([
  PLUGIN_ABI.abi.find(item => item.name === 'initialize')!,
  PLUGIN_ABI.abi.find(item => item.name === 'executeProposal')!,
  PLUGIN_ABI.abi.find(item => item.name === 'submitEdits')!,
  PLUGIN_ABI.abi.find(item => item.name === 'submitAcceptSubspace')!,
  PLUGIN_ABI.abi.find(item => item.name === 'submitRemoveSubspace')!,
  PLUGIN_ABI.abi.find(item => item.name === 'proposeAddMember')!,
  PLUGIN_ABI.abi.find(item => item.name === 'addMember')!,
  PLUGIN_ABI.abi.find(item => item.name === 'submitRemoveMember')!,
  PLUGIN_ABI.abi.find(item => item.name === 'submitNewEditor')!,
  PLUGIN_ABI.abi.find(item => item.name === 'submitRemoveEditor')!,
  PLUGIN_ABI.abi.find(item => item.name === 'leaveSpace')!,
]);
const AddressZero = ethers.constants.AddressZero;
const EMPTY_DATA = '0x';

// Permissions
const EDITOR_PERMISSION_ID = ethers.utils.id('EDITOR_PERMISSION');
const EXECUTE_PERMISSION_ID = ethers.utils.id('EXECUTE_PERMISSION');

describe('Personal Admin Plugin Setup', function () {
  let ownerAddress: string;
  let signers: any;
  let adminSetup: PersonalAdminSetup;
  let implementationAddress: string;
  let targetDao: any;
  let prepareInstallationData: string;

  before(async () => {
    signers = await ethers.getSigners();
    ownerAddress = await signers[0].getAddress();
    targetDao = await deployTestDao(signers[0]);

    const PersonalAdminSetup = new PersonalAdminSetup__factory(signers[0]);
    adminSetup = await PersonalAdminSetup.deploy();

    implementationAddress = await adminSetup.implementation();

    prepareInstallationData = await adminSetup.encodeInstallationParams(
      ownerAddress,
      60 * 60 * 24
    );
  });

  it('does not support the empty interface', async () => {
    expect(await adminSetup.supportsInterface('0xffffffff')).to.be.false;
  });

  it('creates plugin base address with the correct interface', async () => {
    const factory = new PersonalAdminPlugin__factory(signers[0]);
    const personalAddressPlugin = factory.attach(implementationAddress);

    expect(
      await personalAddressPlugin.supportsInterface(
        getInterfaceID(papInterface)
      )
    ).to.be.eq(true);
  });

  describe('prepareInstallation', async () => {
    it('fails if data is empty, or not of minimum length', async () => {
      await expect(
        adminSetup.prepareInstallation(targetDao.address, EMPTY_DATA)
      ).to.be.reverted;

      await expect(
        adminSetup.prepareInstallation(
          targetDao.address,
          prepareInstallationData.substring(
            0,
            prepareInstallationData.length - 2
          )
        )
      ).to.be.reverted;

      await expect(
        adminSetup.prepareInstallation(
          targetDao.address,
          prepareInstallationData
        )
      ).not.to.be.reverted;
    });

    it('reverts if encoded address in `_data` is zero', async () => {
      const dataWithAddressZero = await adminSetup.encodeInstallationParams(
        AddressZero,
        60 * 60 * 24
      );

      await expect(
        adminSetup.prepareInstallation(targetDao.address, dataWithAddressZero)
      )
        .to.be.revertedWithCustomError(adminSetup, 'EditorAddressInvalid')
        .withArgs(AddressZero);
    });

    it('correctly returns plugin, helpers and permissions', async () => {
      const nonce = await ethers.provider.getTransactionCount(
        adminSetup.address
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: adminSetup.address,
        nonce,
      });
      const anticipatedHelperAddress = ethers.utils.getContractAddress({
        from: adminSetup.address,
        nonce: nonce + 1,
      });
      const anticipatedConditionAddress = ethers.utils.getContractAddress({
        from: adminSetup.address,
        nonce: nonce + 2,
      });

      const {
        plugin,
        preparedSetupData: {helpers, permissions},
      } = await adminSetup.callStatic.prepareInstallation(
        targetDao.address,
        prepareInstallationData
      );

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(1);
      expect(helpers[0]).to.be.equal(anticipatedHelperAddress);
      expect(permissions.length).to.be.equal(6);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          targetDao.address,
          plugin,
          AddressZero,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          ownerAddress,
          AddressZero,
          EDITOR_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          helpers[0],
          plugin,
          AddressZero,
          PROPOSER_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          targetDao.address,
          helpers[0],
          anticipatedConditionAddress,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          targetDao.address,
          AddressZero,
          ADD_MEMBER_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          helpers[0],
          targetDao.address,
          AddressZero,
          UPDATE_SETTINGS_PERMISSION_ID,
        ],
      ]);
    });

    it('correctly sets up the plugin', async () => {
      const daoAddress = targetDao.address;

      const nonce = await ethers.provider.getTransactionCount(
        adminSetup.address
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: adminSetup.address,
        nonce,
      });

      await adminSetup.prepareInstallation(daoAddress, prepareInstallationData);

      const factory = new PersonalAdminPlugin__factory(signers[0]);
      const adminAddressContract = factory.attach(anticipatedPluginAddress);

      expect(await adminAddressContract.dao()).to.be.equal(daoAddress);
    });
  });

  describe('prepareUninstallation', async () => {
    it('correctly returns permissions', async () => {
      const plugin = ethers.Wallet.createRandom().address;

      const permissions = await adminSetup.callStatic.prepareUninstallation(
        targetDao.address,
        {
          plugin,
          currentHelpers: ['0x1234567890123456789012345678901234567890'],
          data: EMPTY_DATA,
        }
      );

      expect(permissions.length).to.be.equal(5);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          targetDao.address,
          plugin,
          AddressZero,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          '0x1234567890123456789012345678901234567890',
          plugin,
          AddressZero,
          PROPOSER_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          targetDao.address,
          '0x1234567890123456789012345678901234567890',
          AddressZero,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin,
          targetDao.address,
          AddressZero,
          ADD_MEMBER_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          '0x1234567890123456789012345678901234567890',
          targetDao.address,
          AddressZero,
          UPDATE_SETTINGS_PERMISSION_ID,
        ],
      ]);
    });
  });
});
