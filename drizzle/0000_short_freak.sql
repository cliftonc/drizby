CREATE TABLE `analytics_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`connection_id` integer,
	`organisation_id` integer NOT NULL,
	`config` text NOT NULL,
	`order` integer DEFAULT 0,
	`is_active` integer DEFAULT true,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_analytics_pages_org` ON `analytics_pages` (`organisation_id`);--> statement-breakpoint
CREATE INDEX `idx_analytics_pages_org_active` ON `analytics_pages` (`organisation_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`engine_type` text NOT NULL,
	`connection_string` text NOT NULL,
	`is_active` integer DEFAULT true,
	`organisation_id` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_connections_org` ON `connections` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `cube_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`description` text,
	`source_code` text,
	`schema_file_id` integer,
	`connection_id` integer NOT NULL,
	`definition` text,
	`compiled_at` integer,
	`compilation_errors` text,
	`is_active` integer DEFAULT true,
	`organisation_id` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_cube_definitions_org` ON `cube_definitions` (`organisation_id`);--> statement-breakpoint
CREATE INDEX `idx_cube_definitions_connection` ON `cube_definitions` (`connection_id`);--> statement-breakpoint
CREATE TABLE `notebooks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`connection_id` integer,
	`organisation_id` integer NOT NULL,
	`config` text,
	`order` integer DEFAULT 0,
	`is_active` integer DEFAULT true,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `oauth_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_oauth_provider_user` ON `oauth_accounts` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE TABLE `schema_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`source_code` text NOT NULL,
	`connection_id` integer NOT NULL,
	`organisation_id` integer NOT NULL,
	`compiled_at` integer,
	`compilation_errors` text,
	`version` integer DEFAULT 1,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_schema_files_org` ON `schema_files` (`organisation_id`);--> statement-breakpoint
CREATE INDEX `idx_schema_files_connection` ON `schema_files` (`connection_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`organisation_id` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_settings_org` ON `settings` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text,
	`role` text DEFAULT 'member' NOT NULL,
	`is_blocked` integer DEFAULT false NOT NULL,
	`avatar_url` text,
	`organisation_id` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_users_org` ON `users` (`organisation_id`);