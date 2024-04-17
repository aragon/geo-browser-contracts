# Geo Browser - Aragon OSx

## Deployment

### On a blockchain supported by Aragon

If the current contracts are meant to be deployed on a blockchain like Mainnet, Sepolia, Polygon, Base, etc, the only step needed is to define the relevant env vars on `.env` and run the following command:

```sh
cd packages/contracts
npx hardhat deploy --network <the-network-name>
```

### On a custom blockchain

In the case of specific blockchains where OSx support is not officially available, you will need to deploy it first. The high level process looks like:

0. Prepare a wallet for the whole deployment process
1. Deploy OSx
   1. This will create a Managing DAO, where the deployer wallet can `execute()` actions
2. Deploy the plugins of this project
3. Install the plugin that will control the Managing DAO and revoke the `ROOT_PERMISSION` from the deployment wallet

#### 1) Deploy OSx

Clone [the OSx repo](https://github.com/aragon/osx) into a separate folder.

```sh
git checkout deployments/simpler-deployment
yarn
cd packages/contracts
cp .env.example .env
nano .env    # Update the values
yarn build
# yarn test  (optional)
```

- Open the [DEPLOYMENT_CHECKLIST.md](https://github.com/aragon/osx/blob/deployments/simpler-deployment/DEPLOYMENT_CHECKLIST.md) file and follow the instructions

Before the contract verification, you should see an output like this:

```
Printing deployed contracts.
Managing DAO: 0x8F78E43a1eF0916d048fD391ecfd71B44fF4DD0C
DAOFactory: 0x362D9e4DE500F6faA71E765394e2Df60a06C21E0
DAORegistry: 0xB928B54B7a419666192d8a76534B28e15e3f4498
DAORegistry_Implementation: 0xfDDfB1b64B90cDB784699fccc65e085EFcB774b6
DAO_ENSSubdomainRegistrar: 0x3b91b927148C66f8572275f809748eF93e0d4016
DAO_ENSSubdomainRegistrar_Implementation: 0xFee26363AfBb684652e895F507cA1F4489E14de8
Managing DAO Implementation: 0x2D941aBAFd05b1DA425E4d04293A0C49d4df9425
ENSRegistry: 0x3099238BC70914F6F4CE007E2F3a86200b924150
PluginRepoFactory: 0x5aBd4d84C00661310ddEa7a8b88C309c420F1c47
PluginRepoRegistry: 0x46614c13b7dFbEE8B5D810546E4385A423f65ef6
PluginRepoRegistry_Implementation: 0xf7A702D8f197e6D510eaF740998c2029744078B5
PluginSetupProcessor: 0x01aeE1a16C8807DF52f2DA9191Cec8058e747F4A
Plugin_ENSSubdomainRegistrar: 0xb63C2A08246df16f8534282F807683dCcA34c7A3
Plugin_ENSSubdomainRegistrar_Implementation: 0x98ee670Fa61cB6504eC1E372384A4A73Ca5F713a
PublicResolver: 0x2B7222146A805bBa0DBb61869C4b3a03209DffBa
...
```

These values can also be found in the `packages/contracts/deployed_contracts.json` file on your OSx folder.

```sh
cat deployed_contracts.json | egrep "managingDAO|PluginRepoFactory|PluginSetupProcessor" | grep -v "Implementation"

  "managingDAO": "0x8F78E43a1eF0916d048fD391ecfd71B44fF4DD0C",
  "PluginRepoFactory": "0x5aBd4d84C00661310ddEa7a8b88C309c420F1c47",
  "PluginSetupProcessor": "0x01aeE1a16C8807DF52f2DA9191Cec8058e747F4A",

```

Copy the resulting `PluginRepoFactory`, the `PluginSetupProcessor` and the `managingDAO` addresses for the next step.

#### 2) Run the plugin deployment script

Back to this repository:

- Update the `.env` file with the values that correspond to your target blockchain
  - `NETWORK_NAME` and `DEPLOYMENT_RPC_ENDPOINT`
    - Check the `packages/contracts/hardhat.config.ts` to manually customize the HardHat client
    - `DEPLOYMENT_RPC_ENDPOINT` is initially used for a newtork called `custom`
    - Rename it to your convenience
  - Define the deployment wallet's `PRIVATE_KEY`
  - Define the protocol addresses [you copied before](#1-deploy-osx):
    - `PLUGIN_REPO_FACTORY_ADDRESS`, `PLUGIN_SETUP_PROCESSOR_ADDRESS` and `MANAGING_DAO_ADDRESS`
- Edit the `packages/contracts/plugin-setup-params.ts` to define the details of the plugins to depoy
  - If you try to deploy the same plugin repo twice, you will encounter an ENS collision
  - In such case, either define a new unique ENS subdomain or consider rerunning the step 1 and trying again
- Review the Management DAO's plugin settings under `.env`

```sh
cd packages/contracts
yarn build
yarn deploy --network <the-network-name>
```

#### 3) Install a governance plugin to the Managing DAO

The Managing DAO is the contract that has the role of managing certain protocol modules, like the Plugin Registry, the DAO registry, etc. In case a new OSx version is available, only that DAO is be able to push upgrades and perform certain management tasks, which makes it a key component.

The Managing DAO will be created with the following permissions:

- The Managing DAO holds `ROOT_PERMISSION` on itself
- The deployer address also holds `ROOT_PERMISSION` on the Managing DAO

Among the plugins deployed [in the step above](#2-deploy-your-plugins), one of them should be installed to the Managing DAO.

When the script from step 2 finishes, you should see a message like this:

```
If you wish to configure the Managing DAO:

1) Update the .env file with this value:

GOVERNANCE_PLUGIN_REPO_ADDRESS="0xeC91F7Fa3BcFB208c679d2d7de18E7bd9d7cC40B"

2) Define the following values:
MGMT_DAO_PROPOSAL_DURATION="604800"   # 60 * 60 * 24 * 7 (seconds)
MGMT_DAO_MIN_PROPOSAL_PARTICIPATION="500000"   # 50%
MGMT_DAO_PROPOSAL_SUPPORT_THRESHOLD="500000"   # 50%
MGMT_DAO_INITIAL_EDITORS="0x1234,0x2345,0x3456,0x4567..." # Comma separated addresses

3) Run the following command:
$ yarn managing-dao-setup
```

By running `yarn managing-dao-setup`, the `managing-dao-setup.ts` script will be:

1. Asking the [PSP from OSx](#1-deploy-osx) to run `prepareInstallation()` and deploy a new Governance plugin instance
2. Ask the Managing DAO to call `applyInstallation()` on the PSP for the deployed plugin
3. Make the Managing DAO revoke the remaining deployment wallet permissions
4. Checking that the Managing DAO's permissions are correctly configured

## Other

### Rerunning the deployment script

If you need to restart the redeployment process and want HardHat to not reuse the existing contracts:

```sh
rm -R deployments/<network-name>   # replace with the actual name
```

Also, make sure to select a different ENS subdomain for the new plugin's, as they will collide with the previously deployed ones.
