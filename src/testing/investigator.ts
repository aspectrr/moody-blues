import { spawn } from "child_process";
import { existsSync } from "fs";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { Issue, IssueStatus } from "../types/issues.js";
import {
  addInvestigationUpdate,
  updateIssue,
  createInvestigationResult,
} from "../db/queries.js";
import { sendMessage } from "../llm/index.js";
import { generateFollowUpQuestions } from "../llm/analyzer.js";
import { uploadToS3 } from "../storage/s3.js";
import { formatError } from "../utils/error.js";
import { Message } from "discord.js";
import type { MockMessage } from "./simulator.js";

// Define temporary directory for cloning repositories and testing
const TEMP_DIR = process.env.TEMP_DIR || "./temp";

/**
 * Start the investigation process for an issue
 * @param issue The issue to investigate
 * @param originalMessage The original message from the user
 * @param botMessage The bot's message to update with progress
 */
export async function startIssueInvestigation(
  issue: Issue,
  originalMessage: Message | MockMessage,
  botMessage: Message | MockMessage,
): Promise<void> {
  try {
    console.log(`Starting investigation for issue #${issue.id}`);

    // Ensure temp directory exists
    if (!existsSync(TEMP_DIR)) {
      await mkdir(TEMP_DIR, { recursive: true });
    }

    // Create working directory for this issue
    const workingDir = join(TEMP_DIR, `issue-${issue.id}`);
    await mkdir(workingDir, { recursive: true });

    // Update issue status
    await addInvestigationUpdate(
      issue.id,
      IssueStatus.ANALYZING,
      "Starting to analyze the issue",
      { workingDir },
    );

    // Update Discord message
    await botMessage.edit({
      content: `🔍 I'm analyzing your issue. I'll ask follow-up questions if needed.`,
    });

    // Generate follow-up questions
    const followUpQuestions = await generateFollowUpQuestions(
      issue.originalQuery,
      issue.analysisResult,
    );

    // Ask follow-up questions to gather more information
    if (followUpQuestions.length > 0) {
      const questionsText = followUpQuestions
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n");

      await botMessage.edit({
        content: `To better understand your issue, could you please answer these questions:\n\n${questionsText}\n\nI'll use your answers to help recreate and investigate the problem.`,
      });

      // Wait for user response
      // In a real system, you would set up an event listener for responses
      // For this example, we'll continue with the investigation process
    }

    // Plan the testing approach based on analysis
    const testPlan = await planTestingApproach(issue);

    await addInvestigationUpdate(
      issue.id,
      IssueStatus.TESTING,
      "Created test plan and starting test setup",
      { testPlan },
    );

    // Update Discord with testing status
    await botMessage.edit({
      content: `🧪 Setting up test environment to recreate your issue...`,
    });

    // Clone the open source project if available
    const projectUrl = process.env.OPEN_SOURCE_PROJECT_URL;
    if (projectUrl) {
      await cloneRepository(projectUrl, join(workingDir, "project"));
    }

    // Create test files based on the issue
    const testFiles = await createTestFiles(issue, workingDir);

    // Run the tests
    const testResults = await runTests(testFiles, workingDir);

    // Create test summary
    const testSummary = await createTestSummary(issue, testResults);

    // Create a GitHub repository or upload to S3
    let archiveUrl;
    try {
      archiveUrl = await uploadResultsToStorage(
        issue.id,
        workingDir,
        testSummary,
      );
    } catch (error) {
      console.error("Failed to upload test results:", formatError(error));
    }

    // Create investigation result
    await createInvestigationResult({
      issueId: issue.id,
      success: testResults.success,
      reproduced: testResults.reproduced,
      testCasePath: testFiles.mainTestFile,
      repositoryUrl: testResults.repositoryUrl,
      archiveUrl,
      resultSummary: testSummary,
      executionTime: testResults.executionTime,
    });

    // Update issue with final status
    const finalStatus = testResults.reproduced
      ? IssueStatus.NEEDS_MAINTAINER
      : IssueStatus.RESOLVED;

    await updateIssue(issue.id, {
      status: finalStatus,
      resultSummary: testSummary,
      archiveUrl,
      repositoryUrl: testResults.repositoryUrl,
    });

    // Notify maintainer if issue was reproduced
    if (testResults.reproduced && process.env.MAINTAINER_DISCORD_ID) {
      await originalMessage.reply({
        content: `<@${process.env.MAINTAINER_DISCORD_ID}> I've reproduced this issue and created a test case. Please check the details here: ${archiveUrl || "(test results in database)"}`,
      });
    }

    // Update Discord with final results
    const finalMessage = testResults.reproduced
      ? `✅ I've successfully recreated your issue! A test case has been created and a maintainer has been notified.`
      : `I've investigated your issue but wasn't able to reproduce it with the information provided. Here's what I found:\n\n${testSummary}`;

    await botMessage.edit({
      content: finalMessage,
    });
  } catch (error) {
    console.error(
      `Error investigating issue #${issue.id}:`,
      formatError(error),
    );

    // Update the issue status
    await addInvestigationUpdate(
      issue.id,
      IssueStatus.FAILED,
      `Investigation failed: ${formatError(error)}`,
      { error: formatError(error) },
    );

    // Update Discord message
    await botMessage.edit({
      content: `❌ I encountered an error while investigating your issue. A maintainer will be notified to help you.`,
    });

    // Notify maintainer
    if (process.env.MAINTAINER_DISCORD_ID) {
      await originalMessage.reply({
        content: `<@${process.env.MAINTAINER_DISCORD_ID}> There was an error investigating this issue. Please check the logs.`,
      });
    }
  }
}

/**
 * Plan the testing approach for an issue
 * @param issue The issue to plan for
 * @returns The testing plan
 */
async function planTestingApproach(issue: Issue): Promise<any> {
  const prompt = `
I need to create a test plan to recreate and verify the following issue:

Issue Description:
${issue.originalQuery}

Analysis:
${JSON.stringify(issue.analysisResult, null, 2)}

Based on this information, please create a detailed test plan that includes:
1. What test files need to be created
2. Required environment setup
3. Steps to reproduce the issue
4. How to verify if the issue is reproduced successfully
5. Any additional tools or libraries needed

Return the test plan in JSON format with the following structure:
{
  "testFiles": [{"name": "filename", "description": "what this file tests"}],
  "environmentSetup": ["step 1", "step 2"],
  "reproductionSteps": ["step 1", "step 2"],
  "verificationCriteria": ["criterion 1", "criterion 2"],
  "requiredTools": ["tool1", "tool2"],
  "testApproach": "description of overall approach"
}
`;

  const response = await sendMessage(
    prompt,
    "You are an expert software tester who specializes in creating test plans for software issues. You respond only in valid JSON format.",
    // { temperature: 0.2 },
  );

  try {
    return JSON.parse(response);
  } catch (error) {
    console.error("Failed to parse test plan response:", formatError(error));

    // Attempt to extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall back to a default plan
        return createDefaultTestPlan(issue);
      }
    }

    return createDefaultTestPlan(issue);
  }
}

/**
 * Create a default test plan when LLM fails
 * @param issue The issue to plan for
 * @returns A default test plan
 */
function createDefaultTestPlan(issue: Issue): any {
  console.log(issue);
  return {
    testFiles: [
      {
        name: "issueTest.ts",
        description: "Main test file to reproduce the issue",
      },
      { name: "setup.ts", description: "Setup code and utilities" },
    ],
    environmentSetup: [
      "Clone the repository",
      "Install dependencies",
      "Configure test environment",
    ],
    reproductionSteps: [
      "Set up the test context",
      "Perform the operations described in the issue",
      "Check for the expected error or behavior",
    ],
    verificationCriteria: [
      "The error mentioned in the issue occurs",
      "The behavior matches the user's description",
    ],
    requiredTools: ["TypeScript", "Jest", "Node.js"],
    testApproach: "Create a minimal reproduction that isolates the core issue",
  };
}

/**
 * Clone a Git repository
 * @param repoUrl The repository URL to clone
 * @param targetDir The directory to clone into
 * @returns Promise that resolves when cloning is complete
 */
async function cloneRepository(
  repoUrl: string,
  targetDir: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const gitProcess = spawn("git", ["clone", repoUrl, targetDir]);

    gitProcess.stdout.on("data", (data) => {
      console.log(`Git output: ${data}`);
    });

    gitProcess.stderr.on("data", (data) => {
      console.error(`Git error: ${data}`);
    });

    gitProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Git clone failed with code ${code}`));
      }
    });
  });
}

/**
 * Create test files for the issue
 * @param issue The issue to create tests for
 * @param workingDir The working directory
 * @returns Information about created test files
 */
async function createTestFiles(
  issue: Issue,
  workingDir: string,
): Promise<{ mainTestFile: string; files: string[] }> {
  // Create test directory
  const testDir = join(workingDir, "tests");
  await mkdir(testDir, { recursive: true });

  // Generate test code based on the issue
  const testCode = await generateTestCode(issue);

  // Write test files
  const mainTestFile = join(testDir, "issue-test.ts");
  await writeFile(mainTestFile, testCode.mainTest);

  const setupFile = join(testDir, "setup.ts");
  await writeFile(setupFile, testCode.setup);

  // Create package.json for the test
  const packageJson = {
    name: `issue-${issue.id}-test`,
    version: "1.0.0",
    description: `Test case for issue #${issue.id}`,
    scripts: {
      test: "ts-node issue-test.ts",
    },
    dependencies: {
      typescript: "^5.0.0",
      "ts-node": "^10.9.1",
    },
  };

  await writeFile(
    join(testDir, "package.json"),
    JSON.stringify(packageJson, null, 2),
  );

  // Create README with instructions
  const readme = `# Test Case for Issue #${issue.id}

## Description
${issue.originalQuery}

## Setup Instructions
1. Install dependencies: \`npm install\`
2. Run the test: \`npm test\`

## Expected Results
The test will attempt to reproduce the issue described above.
`;

  await writeFile(join(testDir, "README.md"), readme);

  return {
    mainTestFile,
    files: [mainTestFile, setupFile],
  };
}

/**
 * Generate test code for an issue
 * @param issue The issue to generate test code for
 * @returns Generated test code files
 */
async function generateTestCode(
  issue: Issue,
): Promise<{ mainTest: string; setup: string }> {
  const prompt = `
Create typescript test files to reproduce this issue:

Issue Description:
${issue.originalQuery}

Analysis:
${JSON.stringify(issue.analysisResult, null, 2)}

I need two typescript files:
1. A main test file that reproduces the issue
2. A setup file with any necessary utilities or helper functions

The code should be complete, realistic, and focus on reproducing the specific issue.
Use typescript, react, tailwindcss, shadcn, postgres, vite, fastify, docker, drizzle, and zod as appropriate.

Format your response as JSON with this structure:
{
  "mainTest": "// Full typescript code for main test file here",
  "setup": "// Full typescript code for setup file here"
}
`;

  const response = await sendMessage(
    prompt,
    "You are an expert programmer who writes clean, effective test code to reproduce software issues. You respond only in valid JSON format.",
    // { temperature: 0.5 },
  );

  try {
    return JSON.parse(response);
  } catch (error) {
    console.error("Failed to parse test code response:", formatError(error));

    // Attempt to extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall back to default code
        return createDefaultTestCode(issue);
      }
    }

    return createDefaultTestCode(issue);
  }
}

/**
 * Create default test code when LLM fails
 * @param issue The issue to create tests for
 * @returns Default test code
 */
function createDefaultTestCode(issue: Issue): {
  mainTest: string;
  setup: string;
} {
  return {
    mainTest: `// Test file for issue #${issue.id}
import { setupTest } from './setup';

async function testIssue() {
  console.log('Beginning test for issue reproduction');

  try {
    const { result } = await setupTest();

    console.log('Test setup completed');
    console.log('Attempting to reproduce issue...');

    // Simple test logic that will be replaced with actual reproduction code
    console.log('Issue could not be automatically reproduced');
    console.log('Manual investigation required');

    return {
      reproduced: false,
      error: null,
      details: 'Automatic reproduction not possible with available information'
    };
  } catch (error) {
    console.error('Error during test:', error);
    return {
      reproduced: true,
      error,
      details: 'Error encountered which may indicate issue reproduction'
    };
  }
}

// Run the test
testIssue()
  .then(result => {
    console.log('Test completed with result:', result);
    process.exit(result.reproduced ? 0 : 1);
  })
  .catch(error => {
    console.error('Test failed with error:', error);
    process.exit(1);
  });
`,
    setup: `// Setup file for issue #${issue.id}
export async function setupTest() {
  console.log('Setting up test environment');

  // This would be replaced with actual setup code
  const testContext = {
    result: 'Test context created'
  };

  return testContext;
}

export function cleanup() {
  console.log('Cleaning up test resources');
}
`,
  };
}

/**
 * Run tests for an issue
 * @param testFiles Information about test files
 * @param workingDir Working directory
 * @returns Test results
 */
async function runTests(
  testFiles: { mainTestFile: string; files: string[] },
  workingDir: string,
): Promise<any> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const testProcess = spawn("ts-node", [testFiles.mainTestFile], {
      cwd: join(workingDir, "tests"),
      env: { ...process.env, NODE_ENV: "test" },
    });

    let output = "";
    let errorOutput = "";

    testProcess.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      console.log(`Test output: ${text}`);
    });

    testProcess.stderr.on("data", (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error(`Test error: ${text}`);
    });

    testProcess.on("close", (code) => {
      const executionTime = Date.now() - startTime;

      // Assume we've reproduced the issue if the test exited with code 0
      // In a real implementation, you'd have more sophisticated detection
      const reproduced = code === 0;

      resolve({
        success: true,
        reproduced,
        output,
        errorOutput,
        exitCode: code,
        executionTime,
        repositoryUrl: undefined, // Would be a GitHub repo URL in a real implementation
      });
    });

    // Add a timeout to prevent hanging tests
    setTimeout(() => {
      testProcess.kill();
      const executionTime = Date.now() - startTime;

      resolve({
        success: false,
        reproduced: false,
        output,
        errorOutput: errorOutput + "\nTest timed out",
        exitCode: -1,
        executionTime,
        repositoryUrl: undefined,
      });
    }, 60000); // 1 minute timeout
  });
}

/**
 * Create a summary of the test results
 * @param issue The issue being tested
 * @param testResults Results from running the tests
 * @returns A summary of the results
 */
async function createTestSummary(
  issue: Issue,
  testResults: any,
): Promise<string> {
  const prompt = `
Create a clear summary of the test results for this issue:

Issue Description:
${issue.originalQuery}

Test Results:
- Reproduced: ${testResults.reproduced}
- Exit Code: ${testResults.exitCode}
- Execution Time: ${testResults.executionTime}ms
- Output: ${testResults.output}
- Errors: ${testResults.errorOutput}

Provide a concise, technical summary that explains:
1. Whether the issue was reproduced
2. What was observed during testing
3. Potential causes of the issue (if reproduced)
4. Recommendations for fixing the issue (if applicable)
5. Next steps for the maintainers
`;

  try {
    return await sendMessage(
      prompt,
      "You are a technical writer specializing in test reports. Be clear, concise, and technical.",
      // { temperature: 0.3 },
    );
  } catch (error) {
    console.error("Failed to generate test summary:", formatError(error));

    // Create a basic summary if LLM fails
    return `
## Test Summary for Issue

**Reproduction Status**: ${testResults.reproduced ? "Successfully reproduced" : "Could not reproduce"}

**Execution Time**: ${testResults.executionTime}ms

**Observations**:
${testResults.output || "No output recorded"}

${testResults.errorOutput ? `**Errors**:\n${testResults.errorOutput}` : ""}

**Next Steps**: ${
      testResults.reproduced
        ? "A maintainer should review the test case and investigate the root cause."
        : "Additional information may be needed to reproduce this issue."
    }
`;
  }
}

/**
 * Upload test results to storage
 * @param issueId The issue ID
 * @param workingDir The working directory with test files
 * @param summary The test summary
 * @returns URL to the uploaded archive
 */
async function uploadResultsToStorage(
  issueId: number,
  workingDir: string,
  summary: string,
): Promise<string> {
  try {
    // Create a summary file
    await writeFile(join(workingDir, "SUMMARY.md"), summary);

    // In a real implementation, you would:
    // 1. Create a ZIP archive of the working directory
    // 2. Upload to S3 or create a GitHub repository

    const key = `issues/issue-${issueId}/results.zip`;

    // This is a placeholder - you would implement actual S3 upload
    const url = await uploadToS3(
      key,
      Buffer.from("Placeholder for ZIP archive"), // In reality, this would be the ZIP file
      "application/zip",
    );

    return url;
  } catch (error) {
    console.error("Failed to upload test results:", formatError(error));
    throw error;
  }
}
