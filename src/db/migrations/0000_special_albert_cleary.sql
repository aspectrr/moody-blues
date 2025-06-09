CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"message_id" text NOT NULL,
	"sender" text NOT NULL,
	"content" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigation_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"success" boolean NOT NULL,
	"reproduced" boolean NOT NULL,
	"test_case_path" text,
	"repository_url" text,
	"archive_url" text,
	"result_summary" text NOT NULL,
	"execution_time" integer NOT NULL,
	"maintainer_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigation_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"status" text NOT NULL,
	"message" text NOT NULL,
	"details" json,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"original_query" text NOT NULL,
	"analysis_result" json NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"origin_message_id" text NOT NULL,
	"origin_channel_id" text NOT NULL,
	"origin_timestamp" integer NOT NULL,
	"repository_url" text,
	"test_case_path" text,
	"recreation_steps" json,
	"archive_url" text,
	"result_summary" text,
	"assigned_maintainer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_results" ADD CONSTRAINT "investigation_results_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_updates" ADD CONSTRAINT "investigation_updates_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;