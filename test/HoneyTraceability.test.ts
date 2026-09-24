import { expect } from "chai";
import { ethers } from "hardhat";

describe("HoneyTraceability", function () {
  async function deployFixture() {
    const [owner, farmer, lab, retailer] = await ethers.getSigners();
    const HoneyTraceability = await ethers.getContractFactory("HoneyTraceability");
    const honeyTraceability = await HoneyTraceability.deploy();
    await honeyTraceability.waitForDeployment();

    return { honeyTraceability, owner, farmer, lab, retailer };
  }

  describe("Batch Registration", function () {
    it("Should allow a farmer to register a new honey batch", async function () {
      const { honeyTraceability, farmer } = await deployFixture();

      const batchId = "BATCH-2026-0814";
      const floralOrigin = "Acacia & Wild Mustard";
      const apiaryLocation = "Baramulla, Kashmir Valley";
      const harvestTimestamp = Math.floor(Date.now() / 1000);
      const initialTelemetryHash = ethers.keccak256(ethers.toUtf8Bytes("telemetry_payload_001"));

      await expect(
        honeyTraceability
          .connect(farmer)
          .registerBatch(
            batchId,
            floralOrigin,
            apiaryLocation,
            harvestTimestamp,
            initialTelemetryHash
          )
      )
        .to.emit(honeyTraceability, "BatchRegistered")
        .withArgs(batchId, floralOrigin, apiaryLocation, farmer.address);

      const batch = await honeyTraceability.getBatch(batchId);
      expect(batch.batchId).to.equal(batchId);
      expect(batch.floralOrigin).to.equal(floralOrigin);
      expect(batch.apiaryLocation).to.equal(apiaryLocation);
      expect(batch.exists).to.be.true;
    });

    it("Should reject duplicate batch IDs", async function () {
      const { honeyTraceability, farmer } = await deployFixture();

      const batchId = "BATCH-DUPLICATE";
      const telemetryHash = ethers.keccak256(ethers.toUtf8Bytes("telemetry_duplicate"));

      await honeyTraceability
        .connect(farmer)
        .registerBatch(batchId, "Origin", "Location", 123456, telemetryHash);

      await expect(
        honeyTraceability
          .connect(farmer)
          .registerBatch(batchId, "Origin 2", "Location 2", 123457, telemetryHash)
      ).to.be.revertedWith("Batch already registered");
    });
  });

  describe("Lab Evidence Anchoring", function () {
    it("Should record valid NABL lab evidence and set status to LAB_TESTED", async function () {
      const { honeyTraceability, farmer, lab } = await deployFixture();

      const batchId = "BATCH-LAB-01";
      const telemetryHash = ethers.keccak256(ethers.toUtf8Bytes("telemetry_001"));

      await honeyTraceability
        .connect(farmer)
        .registerBatch(batchId, "Multifloral", "Sundarbans", 123456, telemetryHash);

      const labReportHash = ethers.keccak256(ethers.toUtf8Bytes("NABL_CERT_99824"));
      const moistureBasisPoints = 1720; // 17.20% (Compliant with FSSAI <= 20.00%)
      const purityScore = 96;
      const grade = "A+";

      await honeyTraceability
        .connect(lab)
        .recordLabEvidence(batchId, labReportHash, moistureBasisPoints, purityScore, grade);

      const batch = await honeyTraceability.getBatch(batchId);
      expect(batch.labReportHash).to.equal(labReportHash);
      expect(batch.moistureBasisPoints).to.equal(moistureBasisPoints);
      expect(batch.purityScore).to.equal(purityScore);
      expect(batch.grade).to.equal(grade);
      expect(batch.status).to.equal(2); // BatchStatus.LAB_TESTED
    });

    it("Should flag batch if moisture exceeds FSSAI regulatory limit (> 20.00%)", async function () {
      const { honeyTraceability, farmer, lab } = await deployFixture();

      const batchId = "BATCH-ADULTERATED";
      const telemetryHash = ethers.keccak256(ethers.toUtf8Bytes("telemetry_002"));

      await honeyTraceability
        .connect(farmer)
        .registerBatch(batchId, "Kashmir", "Pampore", 123456, telemetryHash);

      const labReportHash = ethers.keccak256(ethers.toUtf8Bytes("NABL_FAIL_001"));
      const excessiveMoisture = 2150; // 21.50% (Exceeds 20.00% max limit)

      await expect(
        honeyTraceability
          .connect(lab)
          .recordLabEvidence(batchId, labReportHash, excessiveMoisture, 65, "REJECTED")
      )
        .to.emit(honeyTraceability, "BatchFlagged");

      const batch = await honeyTraceability.getBatch(batchId);
      expect(batch.status).to.equal(5); // BatchStatus.FLAGGED
    });
  });

  describe("Custody Event Transitions", function () {
    it("Should log custody history and retrieve full timeline", async function () {
      const { honeyTraceability, farmer, retailer } = await deployFixture();

      const batchId = "BATCH-TIMELINE-01";
      const telemetryHash = ethers.keccak256(ethers.toUtf8Bytes("harvest_telemetry"));

      await honeyTraceability
        .connect(farmer)
        .registerBatch(batchId, "Mustard Honey", "Punjab", 123456, telemetryHash);

      const dispatchSealHash = ethers.keccak256(ethers.toUtf8Bytes("seal_transporter_42"));
      await honeyTraceability
        .connect(retailer)
        .logCustodyTransition(
          batchId,
          "LOGISTICS_PARTNER",
          "Cold Chain Transit Initiated",
          "Delhi Central Hub",
          dispatchSealHash,
          3 // PACKAGED
        );

      const events = await honeyTraceability.getBatchEvents(batchId);
      expect(events.length).to.equal(2); // Harvest event + Transit event
      expect(events[1].actorRole).to.equal("LOGISTICS_PARTNER");
      expect(events[1].location).to.equal("Delhi Central Hub");
    });
  });
});
