#!/usr/bin/env node

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import chalk from "chalk";
import { IssueSimulator } from "./simulator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run the example tests
 */
async function runExampleTests() {
  // Set test mode environment variables
  process.env.TEST_MODE = "true";

  // Get examples directory from command line or use default
  const examplesDir = process.argv[2] || path.join(__dirname, "examples");

  console.log(chalk.blue(`🧪 Running example tests from: ${examplesDir}`));

  try {
    // Check if directory exists
    await fs.access(examplesDir);
  } catch (error) {
    console.error(
      chalk.red(`❌ Error: Examples directory not found: ${examplesDir}`),
    );
    process.exit(1);
  }

  const startTime = Date.now();
  const simulator = new IssueSimulator(examplesDir);

  // Get list of examples
  const examples = await simulator.loadExamples();
  console.log(chalk.green(`📋 Found ${examples.length} examples to test`));

  if (examples.length === 0) {
    console.log(
      chalk.yellow(
        "⚠️ No example files found. Create .md or .json files in the examples directory.",
      ),
    );
    process.exit(0);
  }

  // Run all examples
  console.log(chalk.blue("🚀 Starting test simulation..."));

  // Track results
  let successCount = 0;
  let failCount = 0;

  // Run each example
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const exampleName = path.basename(example!);

    console.log(
      chalk.blue(`\n[${i + 1}/${examples.length}] Testing: ${exampleName}`),
    );

    try {
      const result = await simulator.simulateIssue(example!);
      console.log(chalk.green(`✅ Success: ${exampleName}`));
      console.log(
        chalk.gray(
          `   Analysis: ${JSON.stringify(result.analysis.problemCategory)}`,
        ),
      );
      console.log(chalk.gray(`   Execution time: ${result.executionTime}ms`));
      successCount++;
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed: ${exampleName}`));
      console.error(chalk.red(`   Error: ${error.message}`));
      failCount++;
    }
  }

  // Generate report
  const report = simulator.generateReport();

  // Save report
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const reportPath = path.join(process.cwd(), `test-report-${timestamp}.md`);
  await fs.writeFile(reportPath, report, "utf8");

  const totalTime = Date.now() - startTime;

  // Print summary
  console.log(chalk.blue(`\n📊 Test Summary:`));
  console.log(chalk.blue(`   Total tests: ${examples.length}`));
  console.log(chalk.green(`   Successful: ${successCount}`));
  console.log(chalk.red(`   Failed: ${failCount}`));
  console.log(chalk.blue(`   Total time: ${totalTime}ms`));
  console.log(chalk.blue(`   Report saved to: ${reportPath}`));
}

// Run the tests
runExampleTests()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red(`\n💥 Fatal error: ${error.message}`));
    process.exit(1);
  });
