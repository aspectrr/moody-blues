import fs from "fs/promises";
import path from "path";
import { EventEmitter } from "events";
import { Issue, IssueStatus } from "../types/issues.js";
import { analyzeUserQuery } from "../llm/analyzer.js";
import { startIssueInvestigation } from "./investigator.js";
import { formatError } from "../utils/error.js";

// Mock Discord message object structure
export interface MockMessage {
  id: string;
  author: {
    id: string;
    username: string;
    bot: boolean;
  };
  content: string;
  channelId: string;
  createdTimestamp: number;
  reply: (options: any) => Promise<MockMessage>;
  edit: (options: any) => Promise<MockMessage>;
}

/**
 * An event emitter that simulates Discord events
 */
export const simulatorEvents = new EventEmitter();

/**
 * Class for simulating issue handling
 */
export class IssueSimulator {
  private examplesDir: string;
  private results: Array<{
    example: string;
    success: boolean;
    results: any;
    error?: string;
  }> = [];

  constructor(examplesDir: string = "./examples") {
    // Default to examples directory relative to current file
    this.examplesDir = path.resolve(
      process.env.TEST_EXAMPLES_DIR ||
        path.join(path.dirname(new URL(import.meta.url).pathname), examplesDir),
    );
  }

  /**
   * Load all example issues from the examples directory
   */
  async loadExamples(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.examplesDir);
      return files
        .filter((file) => file.endsWith(".json") || file.endsWith(".md"))
        .map((file) => path.join(this.examplesDir, file));
    } catch (error) {
      console.error(`Error loading examples: ${formatError(error)}`);
      return [];
    }
  }

  /**
   * Load a single example from file
   */
  async loadExample(filePath: string): Promise<any> {
    try {
      const content = await fs.readFile(filePath, "utf8");

      if (filePath.endsWith(".json")) {
        return JSON.parse(content);
      } else if (filePath.endsWith(".md")) {
        // For markdown files, just use the content as the issue description
        return {
          description: content,
          userId: "test-user",
          username: "TestUser",
          channelId: "test-channel",
        };
      }

      throw new Error(`Unsupported file format: ${path.extname(filePath)}`);
    } catch (error) {
      console.error(
        `Error loading example from ${filePath}: ${formatError(error)}`,
      );
      throw error;
    }
  }

  /**
   * Create a mock Discord message from an example
   */
  createMockMessage(
    example: any,
    messageId: string = "msg-" + Date.now(),
  ): MockMessage {
    const mockMessage: MockMessage = {
      id: messageId,
      author: {
        id: example.userId || "test-user",
        username: example.username || "TestUser",
        bot: false,
      },
      content: example.description,
      channelId: example.channelId || "test-channel",
      createdTimestamp: Date.now(),
      reply: async (options) => {
        // Create a mock bot response message
        const botMessage: MockMessage = {
          id: "reply-" + Date.now(),
          author: {
            id: "bot-id",
            username: "MoodyBlues",
            bot: true,
          },
          content:
            typeof options === "string" ? options : options.content || "",
          channelId: mockMessage.channelId,
          createdTimestamp: Date.now(),
          reply: async () => {
            throw new Error("Not implemented");
          },
          edit: async (editOptions) => {
            botMessage.content =
              typeof editOptions === "string"
                ? editOptions
                : editOptions.content || "";
            simulatorEvents.emit("messageEdit", botMessage);
            return botMessage;
          },
        };

        simulatorEvents.emit("messageReply", botMessage);
        return botMessage;
      },
      edit: async () => {
        throw new Error("Not implemented");
      },
    };

    return mockMessage;
  }

  /**
   * Simulate processing an issue
   */
  async simulateIssue(examplePath: string): Promise<any> {
    try {
      console.log(`Simulating issue from: ${examplePath}`);
      const example = await this.loadExample(examplePath);
      const mockMessage = this.createMockMessage(example);

      // Analyze the query
      const analysis = await analyzeUserQuery(mockMessage.content);

      // Create a mock issue
      const mockIssue: Issue = {
        id: Date.now(),
        userId: mockMessage.author.id,
        username: mockMessage.author.username,
        originalQuery: mockMessage.content,
        analysisResult: analysis,
        status: IssueStatus.IN_PROGRESS,
        originMessageId: mockMessage.id,
        originChannelId: mockMessage.channelId,
        originTimestamp: mockMessage.createdTimestamp,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Set up listeners for events during the investigation
      const events: any[] = [];

      const messageReplyListener = (message: MockMessage) => {
        events.push({
          type: "reply",
          message: message.content,
          timestamp: new Date(),
        });
      };

      const messageEditListener = (message: MockMessage) => {
        events.push({
          type: "edit",
          message: message.content,
          timestamp: new Date(),
        });
      };

      simulatorEvents.on("messageReply", messageReplyListener);
      simulatorEvents.on("messageEdit", messageEditListener);

      // Now reply to the message to get a bot message
      const botMessage = await mockMessage.reply({
        content: "Beginning issue investigation...",
      });

      // Start the issue investigation
      console.log(`Starting investigation for simulated issue`);
      const startTime = Date.now();

      await startIssueInvestigation(mockIssue, mockMessage, botMessage);

      const executionTime = Date.now() - startTime;

      // Remove event listeners
      simulatorEvents.removeListener("messageReply", messageReplyListener);
      simulatorEvents.removeListener("messageEdit", messageEditListener);

      const results = {
        issueId: mockIssue.id,
        executionTime,
        events,
        finalStatus: mockIssue.status,
        analysis,
      };

      this.results.push({
        example: path.basename(examplePath),
        success: true,
        results,
      });

      return results;
    } catch (error) {
      console.error(
        `Error simulating issue from ${examplePath}: ${formatError(error)}`,
      );

      this.results.push({
        example: path.basename(examplePath),
        success: false,
        results: null,
        error: formatError(error),
      });

      throw error;
    }
  }

  /**
   * Run simulation on all examples
   */
  async runAll(): Promise<any[]> {
    const examples = await this.loadExamples();
    const results = [];

    for (const example of examples) {
      try {
        const result = await this.simulateIssue(example);
        results.push({
          example: path.basename(example),
          success: true,
          result,
        });
      } catch (error) {
        results.push({
          example: path.basename(example),
          success: false,
          error: formatError(error),
        });
      }
    }

    return results;
  }

  /**
   * Get the accumulated test results
   */
  getResults() {
    return this.results;
  }

  /**
   * Generate a summary report of all simulated issues
   */
  generateReport(): string {
    const totalTests = this.results.length;
    const successful = this.results.filter((r) => r.success).length;
    const failed = totalTests - successful;

    let report = `# Issue Simulation Report\n\n`;
    report += `**Date:** ${new Date().toISOString()}\n`;
    report += `**Total Tests:** ${totalTests}\n`;
    report += `**Successful:** ${successful}\n`;
    report += `**Failed:** ${failed}\n\n`;

    report += `## Test Results\n\n`;

    this.results.forEach((result, index) => {
      report += `### ${index + 1}. ${result.example}\n\n`;
      report += `Status: ${result.success ? "✅ Success" : "❌ Failed"}\n\n`;

      if (result.success) {
        report += `Execution Time: ${result.results.executionTime}ms\n\n`;
        report += `Analysis:\n\`\`\`json\n${JSON.stringify(result.results.analysis, null, 2)}\n\`\`\`\n\n`;
      } else {
        report += `Error: ${result.error}\n\n`;
      }
    });

    return report;
  }
}

/**
 * Create and run simulator from command line
 */
export async function runSimulator(examplesDir?: string): Promise<void> {
  const simulator = new IssueSimulator(examplesDir);

  try {
    console.log("Starting issue simulation...");
    const results = await simulator.runAll();

    // Generate report
    const report = simulator.generateReport();

    // Save report to file
    const reportPath = path.join(process.cwd(), "simulation-report.md");
    await fs.writeFile(reportPath, report, "utf8");

    console.log(`Simulation completed. Report saved to: ${reportPath}`);
    console.log(`Total tests: ${results.length}`);
    console.log(`Successful tests: ${results.filter((r) => r.success).length}`);
    console.log(`Failed tests: ${results.filter((r) => !r.success).length}`);
  } catch (error) {
    console.error(`Simulation failed: ${formatError(error)}`);
  }
}

import { fileURLToPath } from "url";

// Allow running from command line
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const examplesDir = process.argv[2];
  runSimulator(examplesDir).catch(console.error);
}
