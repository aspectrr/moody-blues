import { eq } from "drizzle-orm";
import { getDb } from "./index.js";
import * as schema from "./schema.js";
import { Issue, IssueStatus, NewIssue } from "../types/issues.js";

/**
 * Create a new issue in the database
 * @param issue The issue data to create
 * @returns The created issue with ID and timestamps
 */
export async function createIssue(
  issue: Omit<NewIssue, "id" | "createdAt" | "updatedAt">,
): Promise<Issue> {
  const db = getDb();

  // Insert the issue into the database
  const [inserted] = await db
    .insert(schema.issues)
    .values({
      userId: issue.userId,
      username: issue.username,
      originalQuery: issue.originalQuery,
      analysisResult: issue.analysisResult,
      status: issue.status,
      originMessageId: issue.originMessageId,
      originChannelId: issue.originChannelId,
      originTimestamp: issue.originTimestamp,
      repositoryUrl: issue.repositoryUrl,
      testCasePath: issue.testCasePath,
      recreationSteps: issue.recreationSteps,
      assignedMaintainerId: issue.assignedMaintainerId,
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to create issue in database");
  }

  // Convert the DB issue to our application type
  return {
    ...issue,
    id: inserted.id,
    createdAt: inserted.createdAt,
    updatedAt: inserted.updatedAt,
    archiveUrl: inserted.archiveUrl ?? undefined,
    resultSummary: inserted.resultSummary ?? undefined,
  };
}

/**
 * Get an issue by ID
 * @param id The issue ID to find
 * @returns The issue if found, null otherwise
 */
export async function getIssueById(id: number): Promise<Issue | null> {
  const db = getDb();

  const [dbIssue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, id))
    .limit(1);

  if (!dbIssue) {
    return null;
  }

  // Convert the DB issue to our application type
  return {
    id: dbIssue.id,
    userId: dbIssue.userId,
    username: dbIssue.username,
    originalQuery: dbIssue.originalQuery,
    analysisResult: dbIssue.analysisResult as any, // Type cast
    status: dbIssue.status as IssueStatus,
    originMessageId: dbIssue.originMessageId,
    originChannelId: dbIssue.originChannelId,
    originTimestamp: dbIssue.originTimestamp,
    repositoryUrl: dbIssue.repositoryUrl ?? undefined,
    testCasePath: dbIssue.testCasePath ?? undefined,
    recreationSteps: dbIssue.recreationSteps as string[] | undefined,
    archiveUrl: dbIssue.archiveUrl ?? undefined,
    resultSummary: dbIssue.resultSummary ?? undefined,
    assignedMaintainerId: dbIssue.assignedMaintainerId ?? undefined,
    createdAt: dbIssue.createdAt,
    updatedAt: dbIssue.updatedAt,
  };
}

/**
 * Update an issue's status
 * @param id The issue ID to update
 * @param status The new status
 * @returns The updated issue
 */
export async function updateIssueStatus(
  id: number,
  status: IssueStatus,
): Promise<Issue> {
  const db = getDb();

  const [dbIssue] = await db
    .update(schema.issues)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(schema.issues.id, id))
    .returning();

  if (!dbIssue) {
    throw new Error(`Failed to update status for issue ${id}`);
  }

  // Convert the DB issue to our application type
  return {
    id: dbIssue.id,
    userId: dbIssue.userId,
    username: dbIssue.username,
    originalQuery: dbIssue.originalQuery,
    analysisResult: dbIssue.analysisResult as any, // Type cast
    status: dbIssue.status as IssueStatus,
    originMessageId: dbIssue.originMessageId,
    originChannelId: dbIssue.originChannelId,
    originTimestamp: dbIssue.originTimestamp,
    repositoryUrl: dbIssue.repositoryUrl ?? undefined,
    testCasePath: dbIssue.testCasePath ?? undefined,
    recreationSteps: dbIssue.recreationSteps as string[] | undefined,
    archiveUrl: dbIssue.archiveUrl ?? undefined,
    resultSummary: dbIssue.resultSummary ?? undefined,
    assignedMaintainerId: dbIssue.assignedMaintainerId ?? undefined,
    createdAt: dbIssue.createdAt,
    updatedAt: dbIssue.updatedAt,
  };
}

/**
 * Update an issue with partial data
 * @param id The issue ID to update
 * @param issueData The issue data to update
 * @returns The updated issue
 */
export async function updateIssue(
  id: number,
  // issueData: Partial<Omit<NewIssue, "id" | "createdAt" | "updatedAt">>,
  issueData: any,
): Promise<Issue> {
  const db = getDb();

  // Include updatedAt in the update data
  const updateData = {
    ...issueData,
    updatedAt: new Date(),
  };

  const [dbIssue] = await db
    .update(schema.issues)
    .set(updateData)
    .where(eq(schema.issues.id, id))
    .returning();

  if (!dbIssue) {
    throw new Error(`Failed to update issue ${id}`);
  }

  // Convert the DB issue to our application type
  return {
    id: dbIssue.id,
    userId: dbIssue.userId,
    username: dbIssue.username,
    originalQuery: dbIssue.originalQuery,
    analysisResult: dbIssue.analysisResult as any, // Type cast
    status: dbIssue.status as IssueStatus,
    originMessageId: dbIssue.originMessageId,
    originChannelId: dbIssue.originChannelId,
    originTimestamp: dbIssue.originTimestamp,
    repositoryUrl: dbIssue.repositoryUrl ?? undefined,
    testCasePath: dbIssue.testCasePath ?? undefined,
    recreationSteps: dbIssue.recreationSteps as string[] | undefined,
    archiveUrl: dbIssue.archiveUrl ?? undefined,
    resultSummary: dbIssue.resultSummary ?? undefined,
    assignedMaintainerId: dbIssue.assignedMaintainerId ?? undefined,
    createdAt: dbIssue.createdAt,
    updatedAt: dbIssue.updatedAt,
  };
}

/**
 * Add an investigation update
 * @param issueId The issue ID
 * @param status The status update
 * @param message The update message
 * @param details Optional details object
 * @returns The created investigation update
 */
export async function addInvestigationUpdate(
  issueId: number,
  status: IssueStatus,
  message: string,
  details?: Record<string, any>,
) {
  const db = getDb();

  const inserted = await db
    .insert(schema.investigationUpdates)
    .values({
      issueId,
      status,
      message,
      details: details || null,
      timestamp: new Date(),
    })
    .returning();

  if (!inserted || inserted.length === 0) {
    throw new Error("Failed to create investigation update");
  }

  // Also update the issue status
  await updateIssueStatus(issueId, status);

  return inserted[0];
}

/**
 * Get all investigation updates for an issue
 * @param issueId The issue ID
 * @returns Array of investigation updates
 */
export async function getInvestigationUpdates(issueId: number) {
  const db = getDb();

  return db
    .select()
    .from(schema.investigationUpdates)
    .where(eq(schema.investigationUpdates.issueId, issueId))
    .orderBy(schema.investigationUpdates.timestamp);
}

/**
 * Create an investigation result
 * @param result The investigation result data
 * @returns The created investigation result
 */
export async function createInvestigationResult(
  result: Omit<schema.NewInvestigationResult, "id" | "createdAt">,
) {
  const db = getDb();

  const [dbIssue] = await db
    .insert(schema.investigationResults)
    .values(result)
    .returning();

  if (!dbIssue) {
    throw new Error("Failed to create investigation result");
  }

  // Update the issue with the result summary and archive URL if available
  const updateData: Partial<schema.NewIssue> = {
    status: result.success
      ? IssueStatus.RESOLVED
      : (IssueStatus.NEEDS_MAINTAINER as IssueStatus),
    resultSummary: result.resultSummary,
  };

  if (result.archiveUrl) {
    updateData.archiveUrl = result.archiveUrl;
  }

  if (result.repositoryUrl) {
    updateData.repositoryUrl = result.repositoryUrl;
  }

  if (result.testCasePath) {
    updateData.testCasePath = result.testCasePath;
  }

  await updateIssue(result.issueId, updateData);

  return dbIssue;
}

/**
 * Get all active issues (not resolved or failed)
 * @returns Array of active issues
 */
export async function getActiveIssues(): Promise<Issue[]> {
  const db = getDb();

  const dbIssues = await db
    .select()
    .from(schema.issues)
    .where(
      eq(schema.issues.status, IssueStatus.IN_PROGRESS),
      // Add other statuses as needed
    )
    .orderBy(schema.issues.createdAt);

  // Convert the DB issues to our application type
  return dbIssues.map((dbIssue) => ({
    id: dbIssue.id,
    userId: dbIssue.userId,
    username: dbIssue.username,
    originalQuery: dbIssue.originalQuery,
    analysisResult: dbIssue.analysisResult as any, // Type cast
    status: dbIssue.status as IssueStatus,
    originMessageId: dbIssue.originMessageId,
    originChannelId: dbIssue.originChannelId,
    originTimestamp: dbIssue.originTimestamp,
    repositoryUrl: dbIssue.repositoryUrl ?? undefined,
    testCasePath: dbIssue.testCasePath ?? undefined,
    recreationSteps: dbIssue.recreationSteps as string[] | undefined,
    archiveUrl: dbIssue.archiveUrl ?? undefined,
    resultSummary: dbIssue.resultSummary ?? undefined,
    assignedMaintainerId: dbIssue.assignedMaintainerId ?? undefined,
    createdAt: dbIssue.createdAt,
    updatedAt: dbIssue.updatedAt,
  }));
}
