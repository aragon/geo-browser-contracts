import {
  DAO__factory,
  IMembership__factory,
  IPlugin__factory,
  IProposal__factory,
} from "@aragon/osx-ethers";
import {
  DAO,
  IERC165Upgradeable__factory,
  PersonalSpaceVotingCloneFactory,
  PersonalSpaceVotingCloneFactory__factory,
  PersonalSpaceVotingPlugin,
  PersonalSpaceVotingPlugin__factory,
  SpacePlugin,
  SpacePlugin__factory,
} from "../../typechain";
import {
  deployWithProxy,
  findEvent,
  findEventTopicLog,
  toBytes32,
} from "../../utils/helpers";
import { deployTestDao } from "../helpers/test-dao";
import {
  CONTENT_PERMISSION_ID,
  EDITOR_PERMISSION_ID,
  EXECUTE_PERMISSION_ID,
  MEMBER_PERMISSION_ID,
  SUBSPACE_PERMISSION_ID,
} from "./common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { getInterfaceID } from "../../utils/interfaces";
import { ProposalCreatedEvent } from "../../typechain/src/PersonalSpaceVotingPlugin";
import { ExecutedEvent } from "../../typechain/@aragon/osx/core/dao/IDAO";

export type InitData = { contentUri: string };
export const defaultInitData: InitData = {
  contentUri: "ipfs://",
};
export const adminInterface = new ethers.utils.Interface([
  "function initialize(address)",
  "function executeProposal(bytes,tuple(address,uint256,bytes)[],uint256)",
]);

describe("Personal Geo Browser Space", function () {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dao: DAO;
  let personalSpaceVotingPlugin: PersonalSpaceVotingPlugin;
  let personalSpaceVotingCloneFactory: PersonalSpaceVotingCloneFactory;
  let spacePlugin: SpacePlugin;
  let defaultInput: InitData;
  let dummyActions: any;
  let dummyMetadata: string;

  before(async () => {
    [alice, bob, charlie] = await ethers.getSigners();
    dao = await deployTestDao(alice);

    defaultInput = { contentUri: "ipfs://" };
    dummyActions = [
      {
        to: alice.address,
        data: "0x0000",
        value: 0,
      },
    ];
    dummyMetadata = ethers.utils.hexlify(
      ethers.utils.toUtf8Bytes("0x123456789"),
    );

    const PersonalSpaceVotingCloneFactory =
      new PersonalSpaceVotingCloneFactory__factory(alice);
    personalSpaceVotingCloneFactory = await PersonalSpaceVotingCloneFactory
      .deploy();
  });

  beforeEach(async () => {
    // Space
    spacePlugin = await deployWithProxy<SpacePlugin>(
      new SpacePlugin__factory(alice),
    );
    await spacePlugin.initialize(dao.address, defaultInput.contentUri);

    // Personal Space Voting
    const PersonalSpaceVotingFactory = new PersonalSpaceVotingPlugin__factory(
      alice,
    );
    const nonce = await ethers.provider.getTransactionCount(
      personalSpaceVotingCloneFactory.address,
    );
    const anticipatedPluginAddress = ethers.utils.getContractAddress({
      from: personalSpaceVotingCloneFactory.address,
      nonce,
    });
    await personalSpaceVotingCloneFactory.deployClone();
    personalSpaceVotingPlugin = PersonalSpaceVotingFactory.attach(
      anticipatedPluginAddress,
    );
    await initializePSVPlugin();

    // Alice is editor
    await dao.grant(
      personalSpaceVotingPlugin.address,
      alice.address,
      EDITOR_PERMISSION_ID,
    );
    // Bob is a member
    await dao.grant(
      personalSpaceVotingPlugin.address,
      bob.address,
      MEMBER_PERMISSION_ID,
    );
    // The plugin can execute on the DAO
    await dao.grant(
      dao.address,
      personalSpaceVotingPlugin.address,
      EXECUTE_PERMISSION_ID,
    );
    // The DAO can use the Space
    await dao.grant(
      spacePlugin.address,
      dao.address,
      CONTENT_PERMISSION_ID,
    );
    await dao.grant(
      spacePlugin.address,
      dao.address,
      SUBSPACE_PERMISSION_ID,
    );
  });

  function initializePSVPlugin() {
    return personalSpaceVotingPlugin.initialize(dao.address);
  }

  describe("initialize: ", async () => {
    it("reverts if trying to re-initialize", async () => {
      // recreate
      const PersonalSpaceVotingFactory = new PersonalSpaceVotingPlugin__factory(
        alice,
      );
      const nonce = await ethers.provider.getTransactionCount(
        personalSpaceVotingCloneFactory.address,
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: personalSpaceVotingCloneFactory.address,
        nonce,
      });
      await personalSpaceVotingCloneFactory.deployClone();
      personalSpaceVotingPlugin = PersonalSpaceVotingFactory.attach(
        anticipatedPluginAddress,
      );
      // Should work
      await initializePSVPlugin();

      await expect(initializePSVPlugin()).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });

    it("emits the `MembershipContractAnnounced` event and returns the admin as a member afterwards", async () => {
      // recreate
      const PersonalSpaceVotingFactory = new PersonalSpaceVotingPlugin__factory(
        alice,
      );
      const nonce = await ethers.provider.getTransactionCount(
        personalSpaceVotingCloneFactory.address,
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: personalSpaceVotingCloneFactory.address,
        nonce,
      });
      await personalSpaceVotingCloneFactory.deployClone();
      personalSpaceVotingPlugin = PersonalSpaceVotingFactory.attach(
        anticipatedPluginAddress,
      );

      await expect(personalSpaceVotingPlugin.initialize(dao.address))
        .to.emit(
          personalSpaceVotingPlugin,
          "MembershipContractAnnounced",
        )
        .withArgs(dao.address);

      await dao.grant(
        personalSpaceVotingPlugin.address,
        alice.address,
        EDITOR_PERMISSION_ID,
      );

      expect(await personalSpaceVotingPlugin.isMember(alice.address)).to.be
        .true; // signer[0] has `EDITOR_PERMISSION_ID`
      expect(await personalSpaceVotingPlugin.isMember(bob.address)).to.be
        .false; // signer[1] does not
    });
  });

  describe("plugin interface: ", async () => {
    it("does not support the empty interface", async () => {
      expect(await personalSpaceVotingPlugin.supportsInterface("0xffffffff")).to
        .be.false;
    });

    it("supports the `IERC165Upgradeable` interface", async () => {
      const iface = IERC165Upgradeable__factory.createInterface();
      expect(
        await personalSpaceVotingPlugin.supportsInterface(
          getInterfaceID(iface),
        ),
      ).to.be.true;
    });

    it("supports the `IPlugin` interface", async () => {
      const iface = IPlugin__factory.createInterface();
      expect(
        await personalSpaceVotingPlugin.supportsInterface(
          getInterfaceID(iface),
        ),
      ).to.be.true;
    });

    it("supports the `IProposal` interface", async () => {
      const iface = IProposal__factory.createInterface();
      expect(
        await personalSpaceVotingPlugin.supportsInterface(
          getInterfaceID(iface),
        ),
      ).to.be.true;
    });

    it("supports the `IMembership` interface", async () => {
      const iface = IMembership__factory.createInterface();
      expect(
        await personalSpaceVotingPlugin.supportsInterface(
          getInterfaceID(iface),
        ),
      ).to.be.true;
    });

    it("supports the `Admin` interface", async () => {
      expect(
        await personalSpaceVotingPlugin.supportsInterface(
          getInterfaceID(adminInterface),
        ),
      ).to
        .be.true;
    });
  });

  describe("execute proposal: ", async () => {
    it("fails to call DAO's `execute()` if `EXECUTE_PERMISSION` is not granted to the plugin address", async () => {
      await dao.revoke(
        dao.address,
        personalSpaceVotingPlugin.address,
        EXECUTE_PERMISSION_ID,
      );

      await expect(
        personalSpaceVotingPlugin.executeProposal(
          dummyMetadata,
          dummyActions,
          0,
        ),
      )
        .to.be.revertedWithCustomError(dao, "Unauthorized")
        .withArgs(
          dao.address,
          personalSpaceVotingPlugin.address,
          EXECUTE_PERMISSION_ID,
        );
    });

    it("fails to call `executeProposal()` if `EDITOR_PERMISSION_ID` is not granted for the admin address", async () => {
      await dao.revoke(
        personalSpaceVotingPlugin.address,
        alice.address,
        EDITOR_PERMISSION_ID,
      );

      await expect(
        personalSpaceVotingPlugin.executeProposal(
          dummyMetadata,
          dummyActions,
          0,
        ),
      )
        .to.be.revertedWithCustomError(
          personalSpaceVotingPlugin,
          "DaoUnauthorized",
        )
        .withArgs(
          dao.address,
          personalSpaceVotingPlugin.address,
          alice.address,
          EDITOR_PERMISSION_ID,
        );
    });

    it("correctly emits the ProposalCreated event", async () => {
      const currentExpectedProposalId = 0;

      const allowFailureMap = 1;

      const tx = await personalSpaceVotingPlugin.executeProposal(
        dummyMetadata,
        dummyActions,
        allowFailureMap,
      );

      await expect(tx).to.emit(
        personalSpaceVotingPlugin,
        "ProposalCreated",
      );

      const event = await findEvent<ProposalCreatedEvent>(
        tx,
        "ProposalCreated",
      );

      expect(!!event).to.eq(true);
      expect(event!.args.proposalId).to.equal(currentExpectedProposalId);
      expect(event!.args.creator).to.equal(alice.address);
      expect(event!.args.metadata).to.equal(dummyMetadata);
      expect(event!.args.actions.length).to.equal(1);
      expect(event!.args.actions[0].to).to.equal(dummyActions[0].to);
      expect(event!.args.actions[0].value).to.equal(dummyActions[0].value);
      expect(event!.args.actions[0].data).to.equal(dummyActions[0].data);
      expect(event!.args.allowFailureMap).to.equal(allowFailureMap);
    });

    it("correctly emits the `ProposalExecuted` event", async () => {
      const currentExpectedProposalId = 0;

      await expect(
        personalSpaceVotingPlugin.executeProposal(
          dummyMetadata,
          dummyActions,
          0,
        ),
      )
        .to.emit(personalSpaceVotingPlugin, "ProposalExecuted")
        .withArgs(currentExpectedProposalId);
    });

    it("correctly increments the proposal ID", async () => {
      const currentExpectedProposalId = 0;

      await personalSpaceVotingPlugin.executeProposal(
        dummyMetadata,
        dummyActions,
        0,
      );

      const nextExpectedProposalId = currentExpectedProposalId + 1;

      const tx = await personalSpaceVotingPlugin.executeProposal(
        dummyMetadata,
        dummyActions,
        0,
      );

      await expect(tx).to.emit(personalSpaceVotingPlugin, "ProposalCreated");

      const event = await findEvent<ProposalCreatedEvent>(
        tx,
        "ProposalCreated",
      );

      expect(!!event).to.eq(true);
      expect(event!.args.proposalId).to.equal(nextExpectedProposalId);
    });

    it("calls the DAO's execute function correctly with proposalId", async () => {
      {
        const proposalId = 0;
        const allowFailureMap = 1;

        const tx = await personalSpaceVotingPlugin.executeProposal(
          dummyMetadata,
          dummyActions,
          allowFailureMap,
        );

        const event = await findEventTopicLog<ExecutedEvent>(
          tx,
          DAO__factory.createInterface(),
          "Executed",
        );

        expect(event.args.actor).to.equal(personalSpaceVotingPlugin.address);
        expect(event.args.callId).to.equal(toBytes32(proposalId));
        expect(event.args.actions.length).to.equal(1);
        expect(event.args.actions[0].to).to.equal(dummyActions[0].to);
        expect(event.args.actions[0].value).to.equal(dummyActions[0].value);
        expect(event.args.actions[0].data).to.equal(dummyActions[0].data);
        // note that failureMap is different than allowFailureMap. See DAO.sol for details
        expect(event.args.failureMap).to.equal(0);
      }

      {
        const proposalId = 1;

        const tx = await personalSpaceVotingPlugin.executeProposal(
          dummyMetadata,
          dummyActions,
          0,
        );

        const event = await findEventTopicLog<ExecutedEvent>(
          tx,
          DAO__factory.createInterface(),
          "Executed",
        );
        expect(event.args.callId).to.equal(toBytes32(proposalId));
      }
    });
  });

  it("Members cannot create proposals", async () => {
    await expect(
      personalSpaceVotingPlugin.connect(bob).executeProposal(
        "0x",
        dummyActions,
        0,
      ),
    )
      .to.be.revertedWithCustomError(
        personalSpaceVotingPlugin,
        "DaoUnauthorized",
      )
      .withArgs(
        dao.address,
        personalSpaceVotingPlugin.address,
        bob.address,
        EDITOR_PERMISSION_ID,
      );
    await expect(
      personalSpaceVotingPlugin.connect(charlie).executeProposal(
        "0x",
        dummyActions,
        0,
      ),
    )
      .to.be.revertedWithCustomError(
        personalSpaceVotingPlugin,
        "DaoUnauthorized",
      )
      .withArgs(
        dao.address,
        personalSpaceVotingPlugin.address,
        charlie.address,
        EDITOR_PERMISSION_ID,
      );
  });

  it("Only editors can create and execute proposals", async () => {
    expect(
      await personalSpaceVotingPlugin.connect(alice).executeProposal(
        "0x",
        dummyActions,
        0,
      ),
    ).to.emit(personalSpaceVotingPlugin, "Executed")
      .withArgs(0);
  });
  it("Proposal execution is immediate");
  it("Only the DAO can call functions on the space plugin");
  it("Approved content proposals emit an event");
  it("Approved subspaces emit an event");
});
