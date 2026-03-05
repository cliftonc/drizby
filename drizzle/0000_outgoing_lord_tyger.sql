CREATE TABLE "analytics_pages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "analytics_pages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"organisation_id" integer NOT NULL,
	"config" jsonb NOT NULL,
	"order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "connections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"engine_type" text NOT NULL,
	"connection_string" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"organisation_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cube_definitions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cube_definitions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"title" text,
	"description" text,
	"connection_id" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"organisation_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "departments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"organisation_id" integer NOT NULL,
	"budget" real
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "employees_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"email" text,
	"active" boolean DEFAULT true,
	"department_id" integer,
	"organisation_id" integer NOT NULL,
	"salary" real,
	"city" text,
	"region" text,
	"country" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "productivity" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "productivity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"employee_id" integer NOT NULL,
	"department_id" integer,
	"date" timestamp NOT NULL,
	"lines_of_code" integer DEFAULT 0,
	"pull_requests" integer DEFAULT 0,
	"happiness_index" integer,
	"organisation_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"organisation_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_analytics_pages_org" ON "analytics_pages" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_pages_org_active" ON "analytics_pages" USING btree ("organisation_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_connections_org" ON "connections" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "idx_cube_definitions_org" ON "cube_definitions" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "idx_cube_definitions_connection" ON "cube_definitions" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_departments_org" ON "departments" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "idx_employees_org" ON "employees" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "idx_employees_org_created" ON "employees" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_productivity_org" ON "productivity" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "idx_productivity_org_date" ON "productivity" USING btree ("organisation_id","date");--> statement-breakpoint
CREATE INDEX "idx_settings_org" ON "settings" USING btree ("organisation_id");