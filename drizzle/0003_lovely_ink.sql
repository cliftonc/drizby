CREATE TABLE "schema_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "schema_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"source_code" text NOT NULL,
	"connection_id" integer NOT NULL,
	"organisation_id" integer NOT NULL,
	"compiled_at" timestamp,
	"compilation_errors" jsonb,
	"version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cube_definitions" ALTER COLUMN "definition" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_pages" ADD COLUMN "connection_id" integer;--> statement-breakpoint
ALTER TABLE "cube_definitions" ADD COLUMN "source_code" text;--> statement-breakpoint
ALTER TABLE "cube_definitions" ADD COLUMN "schema_file_id" integer;--> statement-breakpoint
ALTER TABLE "cube_definitions" ADD COLUMN "compiled_at" timestamp;--> statement-breakpoint
ALTER TABLE "cube_definitions" ADD COLUMN "compilation_errors" jsonb;--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "connection_id" integer;--> statement-breakpoint
CREATE INDEX "idx_schema_files_org" ON "schema_files" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "idx_schema_files_connection" ON "schema_files" USING btree ("connection_id");