import {
  pgTable,
  serial,
  text,
  json,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { IssueStatus } from "../types/issues";

/**
 * Issues table - stores the main issue information
 */
export const issues = pgTable("issues", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  originalQuery: text("original_query").notNull(),
  analysisResult: json("analysis_result").notNull(),
  status: text("status", {
    enum: Object.values(IssueStatus) as [string, ...string[]],
  })
    .notNull()
    .default(IssueStatus.PENDING),
  originMessageId: text("origin_message_id").notNull(),
  originChannelId: text("origin_channel_id").notNull(),
  originTimestamp: integer("origin_timestamp").notNull(),
  repositoryUrl: text("repository_url"),
  testCasePath: text("test_case_path"),
  recreationSteps: json("recreation_steps").$type<string[]>(),
  archiveUrl: text("archive_url"),
  resultSummary: text("result_summary"),
  assignedMaintainerId: text("assigned_maintainer_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Investigation updates - tracks the progress of an investigation
 */
export const investigationUpdates = pgTable("investigation_updates", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: Object.values(IssueStatus) as [string, ...string[]],
  }).notNull(),
  message: text("message").notNull(),
  details: json("details"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

/**
 * Investigation results - stores the final investigation results
 */
export const investigationResults = pgTable("investigation_results", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  success: boolean("success").notNull(),
  reproduced: boolean("reproduced").notNull(),
  testCasePath: text("test_case_path"),
  repositoryUrl: text("repository_url"),
  archiveUrl: text("archive_url"),
  resultSummary: text("result_summary").notNull(),
  executionTime: integer("execution_time").notNull(),
  maintainerNotes: text("maintainer_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Conversations - stores the conversation history with the user
 */
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(),
  sender: text("sender").notNull(), // 'user' | 'bot' | 'system'
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

/**
 * Type definitions for database models
 */
export type Issue = InferSelectModel<typeof issues>;
export type NewIssue = InferInsertModel<typeof issues>;

export type InvestigationUpdate = InferSelectModel<typeof investigationUpdates>;
export type NewInvestigationUpdate = InferInsertModel<
  typeof investigationUpdates
>;

export type InvestigationResult = InferSelectModel<typeof investigationResults>;
export type NewInvestigationResult = InferInsertModel<
  typeof investigationResults
>;

export type Conversation = InferSelectModel<typeof conversations>;
export type NewConversation = InferInsertModel<typeof conversations>;
