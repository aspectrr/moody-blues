import { z } from 'zod';

/**
 * Enum for issue status
 */
export enum IssueStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  ANALYZING = 'analyzing',
  TESTING = 'testing',
  RESOLVED = 'resolved',
  FAILED = 'failed',
  NEEDS_MAINTAINER = 'needs_maintainer',
}

/**
 * Zod schema for analysis results
 */
export const AnalysisResultSchema = z.object({
  problemCategory: z.enum(['bug', 'feature_request', 'implementation_question', 'installation', 'other']),
  projectComponent: z.string(),
  estimatedComplexity: z.enum(['low', 'medium', 'high']),
  requiredTools: z.array(z.string()),
  potentialSolutions: z.array(z.string()),
  reproducibilitySteps: z.array(z.string()).optional(),
  additionalContext: z.record(z.string(), z.any()).optional(),
});

/**
 * Analysis result type extracted from Zod schema
 */
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/**
 * Schema for a new issue
 */
export const NewIssueSchema = z.object({
  userId: z.string(),
  username: z.string(),
  originalQuery: z.string(),
  analysisResult: AnalysisResultSchema,
  status: z.nativeEnum(IssueStatus),
  originMessageId: z.string(),
  originChannelId: z.string(),
  originTimestamp: z.number(),
  repositoryUrl: z.string().optional(),
  testCasePath: z.string().optional(),
  recreationSteps: z.array(z.string()).optional(),
  assignedMaintainerId: z.string().optional(),
});

/**
 * Type for a new issue
 */
export type NewIssue = z.infer<typeof NewIssueSchema>;

/**
 * Schema for an existing issue with ID
 */
export const IssueSchema = NewIssueSchema.extend({
  id: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  archiveUrl: z.string().optional(),
  resultSummary: z.string().optional(),
});

/**
 * Type for an existing issue
 */
export type Issue = z.infer<typeof IssueSchema>;

/**
 * Schema for issue updates
 */
export const IssueUpdateSchema = NewIssueSchema.partial().omit({
  userId: true,
  username: true,
  originalQuery: true,
  originMessageId: true,
  originChannelId: true,
  originTimestamp: true,
});

/**
 * Type for issue updates
 */
export type IssueUpdate = z.infer<typeof IssueUpdateSchema>;

/**
 * Schema for investigation status updates
 */
export const InvestigationUpdateSchema = z.object({
  issueId: z.number(),
  status: z.nativeEnum(IssueStatus),
  message: z.string(),
  details: z.record(z.string(), z.any()).optional(),
  timestamp: z.date(),
});

/**
 * Type for investigation status updates
 */
export type InvestigationUpdate = z.infer<typeof InvestigationUpdateSchema>;

/**
 * Schema for an investigation result
 */
export const InvestigationResultSchema = z.object({
  issueId: z.number(),
  success: z.boolean(),
  reproduced: z.boolean(),
  testCasePath: z.string().optional(),
  repositoryUrl: z.string().optional(),
  archiveUrl: z.string().optional(),
  resultSummary: z.string(),
  executionTime: z.number(),
  maintainerNotes: z.string().optional(),
});

/**
 * Type for an investigation result
 */
export type InvestigationResult = z.infer<typeof InvestigationResultSchema>;