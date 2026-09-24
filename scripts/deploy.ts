import { ethers } from "hardhat";

async function main() {
  console.log("Deploying HoneyTraceability smart contract...");

  const HoneyTraceability = await ethers.getContractFactory("HoneyTraceability");
  const honeyTraceability = await HoneyTraceability.deploy();

  await honeyTraceability.waitForDeployment();

  const contractAddress = await honeyTraceability.getAddress();
  console.log(`HoneyTraceability deployed successfully to: ${contractAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
