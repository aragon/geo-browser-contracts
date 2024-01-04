import {SpacePluginSetupParams} from '../../plugin-setup-params';
import {
  PluginRepo,
  SpacePlugin,
  SpacePlugin__factory,
  SpacePluginSetup,
  SpacePluginSetup__factory,
} from '../../typechain';
import {
  ExecutedEvent,
  UpgradedEvent,
} from '../../typechain/@aragon/osx/core/dao/DAO';
import {PluginSetupRefStruct} from '../../typechain/@aragon/osx/framework/dao/DAOFactory';
import {UpdatePreparedEvent} from '../../typechain/@aragon/osx/framework/plugin/setup/PluginSetupProcessor';
import {
  findEvent,
  findEventTopicLog,
  getPluginRepoFactoryAddress,
  hashHelpers,
  osxContracts,
} from '../../utils/helpers';
import {toHex} from '../../utils/ipfs';
import {getPluginRepoInfo} from '../../utils/plugin-repo-info';
import {installPlugin, uninstallPlugin} from '../helpers/setup';
import {deployTestDao} from '../helpers/test-dao';
import {
  ADDRESS_ONE,
  ADDRESS_ZERO,
  UPGRADE_PLUGIN_PERMISSION_ID,
  ZERO_BYTES32,
} from '../unit-testing/common';
// import { getNamedTypesFromMetadata } from "../helpers/types";
import {
  DAO,
  DAO__factory,
  PluginRepo__factory,
  PluginRepoFactory__factory,
  PluginRepoRegistry__factory,
  PluginSetupProcessor,
  PluginSetupProcessor__factory,
} from '@aragon/osx-ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {BigNumber} from 'ethers';
import {ethers, network} from 'hardhat';

const release = 1;
const hardhatForkNetwork = process.env.NETWORK_NAME ?? 'mainnet';
const daoInterface = DAO__factory.createInterface();
const pspInterface = PluginSetupProcessor__factory.createInterface();

describe('SpacePluginSetup processing', function () {
  let deployer: SignerWithAddress;

  let psp: PluginSetupProcessor;
  let dao: DAO;
  let pluginRepo: PluginRepo;

  before(async () => {
    [deployer] = await ethers.getSigners();

    const hardhatForkNetwork = process.env.NETWORK_NAME ?? 'mainnet';

    const pluginRepoInfo = getPluginRepoInfo(
      SpacePluginSetupParams.PLUGIN_REPO_ENS_NAME,
      'hardhat'
    );
    if (!pluginRepoInfo) {
      throw new Error('The plugin setup details are not available');
    }

    // PSP
    psp = PluginSetupProcessor__factory.connect(
      osxContracts[hardhatForkNetwork]['PluginSetupProcessor'],
      deployer
    );

    // Deploy DAO.
    dao = await deployTestDao(deployer);

    await dao.grant(
      dao.address,
      psp.address,
      ethers.utils.id('ROOT_PERMISSION')
    );
    await dao.grant(
      psp.address,
      deployer.address,
      ethers.utils.id('APPLY_INSTALLATION_PERMISSION')
    );
    await dao.grant(
      psp.address,
      deployer.address,
      ethers.utils.id('APPLY_UNINSTALLATION_PERMISSION')
    );
    await dao.grant(
      psp.address,
      deployer.address,
      ethers.utils.id('APPLY_UPDATE_PERMISSION')
    );

    pluginRepo = PluginRepo__factory.connect(pluginRepoInfo.address, deployer);
  });

  context('Build 1', async () => {
    let setup: SpacePluginSetup;
    let pluginSetupRef: PluginSetupRefStruct;
    let plugin: SpacePlugin;
    const pluginUpgrader = ADDRESS_ZERO;

    before(async () => {
      const release = 1;

      // Deploy setups.
      setup = SpacePluginSetup__factory.connect(
        (await pluginRepo['getLatestVersion(uint8)'](release)).pluginSetup,
        deployer
      );

      pluginSetupRef = {
        versionTag: {
          release: BigNumber.from(release),
          build: BigNumber.from(1),
        },
        pluginSetupRepo: pluginRepo.address,
      };
    });

    beforeEach(async () => {
      // Install build 1.
      const data = await setup.encodeInstallationParams(
        toHex('ipfs://1234'),
        ADDRESS_ZERO,
        pluginUpgrader
      );
      const results = await installPlugin(psp, dao, pluginSetupRef, data);

      plugin = SpacePlugin__factory.connect(
        results.preparedEvent.args.plugin,
        deployer
      );
    });

    it('installs & uninstalls', async () => {
      expect(await plugin.implementation()).to.be.eq(
        await setup.implementation()
      );
      expect(await plugin.dao()).to.be.eq(dao.address);

      // Uninstall build 1.
      const data = await setup.encodeUninstallationParams(pluginUpgrader);
      await uninstallPlugin(psp, dao, plugin, pluginSetupRef, data, []);
    });
  });
});

describe('SpacePluginSetup with pluginUpgrader', () => {
  let deployer: SignerWithAddress;
  let pluginUpgrader: SignerWithAddress;
  let pSetupBuild1: SpacePluginSetup;

  let psp: PluginSetupProcessor;
  let dao: DAO;
  let pluginRepo: PluginRepo;
  let spFactory: SpacePluginSetup__factory;

  before(async () => {
    [deployer, pluginUpgrader] = await ethers.getSigners();

    // PSP
    psp = PluginSetupProcessor__factory.connect(
      osxContracts[hardhatForkNetwork]['PluginSetupProcessor'],
      deployer
    );

    // Deploy DAO.
    dao = await deployTestDao(deployer);

    // The DAO is root on itself
    await dao.grant(
      dao.address,
      dao.address,
      ethers.utils.id('ROOT_PERMISSION')
    );

    // Get the PluginRepoFactory address
    const pluginRepoFactoryAddr: string = getPluginRepoFactoryAddress(
      network.name
    );

    const pluginRepoFactory = PluginRepoFactory__factory.connect(
      pluginRepoFactoryAddr,
      deployer
    );

    // Create a new PluginRepo
    let tx = await pluginRepoFactory.createPluginRepo(
      'testing-space-plugin',
      deployer.address
    );
    const eventLog = await findEventTopicLog(
      tx,
      PluginRepoRegistry__factory.createInterface(),
      'PluginRepoRegistered'
    );
    if (!eventLog) {
      throw new Error('Failed to get PluginRepoRegistered event log');
    }

    pluginRepo = PluginRepo__factory.connect(
      eventLog.args.pluginRepo,
      deployer
    );

    // Deploy PluginSetup build 1
    spFactory = new SpacePluginSetup__factory().connect(deployer);
    pSetupBuild1 = await spFactory.deploy(psp.address);

    // Publish build 1
    tx = await pluginRepo.createVersion(
      1,
      pSetupBuild1.address,
      toHex('build'),
      toHex('release')
    );
  });

  it('Allows pluginUpgrader to execute psp.applyUpdate()', async () => {
    const pluginSetupRef1: PluginSetupRefStruct = {
      versionTag: {
        release,
        build: 1,
      },
      pluginSetupRepo: pluginRepo.address,
    };

    // Temporary permissions for installing
    await dao.grant(
      dao.address,
      psp.address,
      ethers.utils.id('ROOT_PERMISSION')
    );
    await dao.grant(
      psp.address,
      deployer.address,
      ethers.utils.id('APPLY_INSTALLATION_PERMISSION')
    );

    // Install build 1
    const data1 = await pSetupBuild1.encodeInstallationParams(
      toHex('ipfs://1234'),
      ADDRESS_ZERO,
      pluginUpgrader.address
    );
    const installation1 = await installPlugin(psp, dao, pluginSetupRef1, data1);

    // Drop temp permissions
    await dao.revoke(
      dao.address,
      psp.address,
      ethers.utils.id('ROOT_PERMISSION')
    );
    await dao.revoke(
      psp.address,
      deployer.address,
      ethers.utils.id('APPLY_INSTALLATION_PERMISSION')
    );

    // Deployed plugin
    const spacePlugin = SpacePlugin__factory.connect(
      installation1.preparedEvent.args.plugin,
      deployer
    );

    // Check implementations build 1
    expect(await spacePlugin.implementation()).to.be.eq(
      await pSetupBuild1.implementation()
    );

    // Deploy PluginSetup build 2 (new instance, disregarding the lack of changes)
    const pSetupBuild2 = await spFactory.deploy(psp.address);

    // Check
    expect(await pSetupBuild1.implementation()).to.not.be.eq(
      await pSetupBuild2.implementation(),
      'Builds 1-2 implementation should differ'
    );

    // Publish build 2
    let tx = await pluginRepo.createVersion(
      1,
      pSetupBuild2.address,
      toHex('build'),
      toHex('release')
    );
    await tx.wait();

    // Upgrade to build 2
    tx = await psp.prepareUpdate(dao.address, {
      currentVersionTag: {
        release: release,
        build: 1,
      },
      newVersionTag: {
        release: release,
        build: 2,
      },
      pluginSetupRepo: pluginRepo.address,
      setupPayload: {
        currentHelpers: [],
        data: '0x',
        plugin: spacePlugin.address,
      },
    });
    const preparedEvent = await findEvent<UpdatePreparedEvent>(
      tx,
      'UpdatePrepared'
    );
    if (!preparedEvent) {
      throw new Error('Failed to get UpdatePrepared event');
    }

    // Should not allow to execute other than the expected 3 actions
    {
      await expect(
        dao.execute(toHex('23412341234123412341234123412341'), [], 0)
      ).to.be.reverted;
      await expect(
        dao
          .connect(pluginUpgrader)
          .execute(toHex('23412341234123412341234123412341'), [], 0)
      ).to.be.reverted;
      await expect(
        dao
          .connect(pluginUpgrader)
          .execute(
            toHex('23412341234123412341234123412341'),
            [{to: dao.address, value: 0, data: '0x'}],
            0
          )
      ).to.be.reverted;
      await expect(
        dao.connect(pluginUpgrader).execute(
          toHex('23412341234123412341234123412341'),
          [
            {
              to: spacePlugin.address,
              value: 0,
              data: SpacePlugin__factory.createInterface().encodeFunctionData(
                'removeSubspace',
                [ADDRESS_ONE]
              ),
            },
          ],
          0
        )
      ).to.be.reverted;
    }

    // Params
    const applyUpdateParams: PluginSetupProcessor.ApplyUpdateParamsStruct = {
      plugin: spacePlugin.address,
      pluginSetupRef: {
        pluginSetupRepo: pluginRepo.address,
        versionTag: {
          release,
          build: 2,
        },
      },
      initData: preparedEvent.args.initData,
      permissions: preparedEvent.args.preparedSetupData.permissions,
      helpersHash: hashHelpers(preparedEvent.args.preparedSetupData.helpers),
    };

    // Execute grant + applyUpdate + revoke
    tx = await dao.connect(pluginUpgrader).execute(
      ZERO_BYTES32,
      [
        // Grant permission to the PSP
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('grant', [
            spacePlugin.address,
            psp.address,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
        // Execute psp.applyUpdate() from the DAO to the plugin
        {
          to: psp.address,
          value: 0,
          data: pspInterface.encodeFunctionData('applyUpdate', [
            dao.address,
            applyUpdateParams,
          ]),
        },
        // Revoke permission to the PSP
        {
          to: dao.address,
          value: 0,
          data: daoInterface.encodeFunctionData('revoke', [
            spacePlugin.address,
            psp.address,
            UPGRADE_PLUGIN_PERMISSION_ID,
          ]),
        },
      ],
      0
    );

    const receipt = await tx.wait();
    const executedEvent: ExecutedEvent | undefined = (
      receipt.events || []
    ).find(event => event.event === 'Executed') as any;
    if (!executedEvent) {
      throw new Error('Failed to get Executed event');
    }

    const upgradedEvent = await findEvent<UpgradedEvent>(tx, 'Upgraded');
    if (!upgradedEvent) {
      throw new Error('Failed to get Upgraded event');
    }

    // Check implementations build 2
    expect(await spacePlugin.implementation()).to.not.be.eq(
      await pSetupBuild1.implementation(),
      "Implementation shouldn't be build 1"
    );

    expect(await spacePlugin.implementation()).to.be.eq(
      await pSetupBuild2.implementation(),
      'Implementation should be build 2'
    );
  });
});
