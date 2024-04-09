# Geo Browser - Aragon OSx

## Deployment

### On a blockchain supported by Aragon

If the current contracts are meant to be deployed on a blockchain like Mainnet, Sepolia, Polygon, Base, etc, the only step needed is to define the relevant env vars on `.env` and run the following command:

```sh
cd packages/contracts
npx hardhat deploy --network <replace-the-name>
```

### On a custom blockchain

In the case of specific blockchains where OSx support is not officially available, you will need to deploy it first. The high level process looks like:

0. Prepare a wallet for the whole deployment process
1. Deploy OSx
   1. This will create a Managing DAO, where the deployer wallet can `execute()` actions
2. Deploy the plugins of this project
3. Install the plugin that will control the Managing DAO
4. Revoke the `ROOT_PERMISSION` from the deployment wallet on the DAO

#### 1) Deploy OSx

Clone [https://github.com/aragon/osx](the OSx repo) into a separate folder.

```sh
yarn
git checkout simpler-deployment
cd packages/contracts
cp .env.example .env
nano .env    # Update the values
yarn build
# yarn test  (optional)
```

- Edit the `packages/contracts/hardhat.config.ts` to include the details of your target network.
- Edit the `.env` file to make use of the deployment wallet's private key.
- Open the `DEPLOYMENT_CHECKLIST.md` file and follow the instructions

Write down the address of the deployed contracts. The result should look similar to this:

```json
{
  "managingDAOImplementation": "0x731b7F3d74C9dc25A90af73B960ad51f42481d6c",
  "managingDAO": "0x1C57A251B1902656693f689aA69389f2a6f2a432",
  "ENSRegistry": "0xE847017f1e18F7bF35b180fD45b4dAC18E81d568",
  "PublicResolver": "0xE3B1288048f898A28a78FCf9942E14Cc853fFEF2",
  "DAO_ENSSubdomainRegistrar_Implementation": "0xd92C33f309D6e795DCe1980aBc42D3431b0af0e7",
  "DAO_ENSSubdomainRegistrar": "0xcf9D94Ddd248694B66D1D445b85ccbE385634Cc8",
  "Plugin_ENSSubdomainRegistrar_Implementation": "0x7BC82fCba3521B15792423ac4E6076582235263B",
  "Plugin_ENSSubdomainRegistrar": "0xd14C706586c6177d54D201df009b75FB14E8AB5E",
  "DAORegistry_Implementation": "0x66a19CC345dAB31dfb6295017819d54dB594DE56",
  "DAORegistry": "0x11d3B1B24C19B5672b92CD535d2F1F35C53AC543",
  "PluginRepoRegistry_Implementation": "0x38b112318cfd563Fa5de538E7c219bf72F1CcA6a",
  "PluginRepoRegistry": "0x9b51505f7bf3A45BC92F6bE269324096abEC0A73",
  "PluginRepoFactory": "0xA69347F49dD615cb4577670D0728684AfAa01197",
  "PluginSetupProcessor": "0xAc7e4fB4a2158b7EA5516f47b6f804956Faf0134",
  "DAOFactory": "0x2d11E9413264e3814C2a21160cBCcb9Dc3C96890"
}
```

Copy the `PluginRepoFactory`, the `PluginSetupProcessor` and the `managingDAO` addresses for the next step.

#### 2) Run the plugin deployment script

Back to this repository:

- Update the `.env` file with the values that correspond to your target blockchain
  - `NETWORK_NAME` and `DEPLOYMENT_RPC_ENDPOINT`
    - Alternatively, edit the `packages/contracts/hardhat.config.ts` to manually customize the HardHat client
  - Define the deployment wallet's `PRIVATE_KEY`
  - Define the protocol addresses [you copied before](#1-deploy-osx):
    - `PLUGIN_REPO_FACTORY_ADDRESS`, `PLUGIN_SETUP_PROCESSOR_ADDRESS` and `MANAGING_DAO_ADDRESS`
- Edit the `packages/contracts/plugin-setup-params.ts` to define the details of the plugins to depoy
  - If you try to deploy the same plugin repo twice, you will encounter an ENS collision
  - In such case, either define a new unique ENS subdomain or consider rerunning the step 1 and trying again

```sh
cd packages/contracts
yarn build
npx hardhat deploy --network <replace-the-name>
```

In addition to deploying the plugins, the script will internally perform two more things:

#### 3) Install a governance plugin to the Managing DAO

The Managing DAO is the contract that has the role of managing certain protocol modules, like the Plugin Registry, the DAO registry, etc. In case a new OSx version is available, only that DAO is be able to push upgrades and perform certain management tasks, which makes it a key component.

The Managing DAO will be created with the following permissions:

- The Managing DAO holds `ROOT_PERMISSION` on itself
- The deployer address holds `EXECUTE_PERMISSION` on the Managing DAO

Among the plugins deployed [in the step above](#2-deploy-your-plugins), one of them should be installed to the Managing DAO.

The script takes care of:

1. Use the same deployment wallet as before
2. Call `prepareInstallation()` on the Plugin Setup Processor deployed during the [Deploy OSX](#1-deploy-osx) step
3. Ask the Managing DAO to `execute()` an action that calls `applyInstallation()` of the new plugin

#### 4) Revoke the EXECUTE permission granted to the deployer wallet

The script calls `execute()` on the Managing DAO, with an action that calls `revoke(dao, deploymentWalletAddr, ROOT_PERMISSION_ID)` on the DAO itself
