CREATE TABLE `github_app_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` text NOT NULL,
	`app_name` text,
	`private_key` text NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text NOT NULL,
	`webhook_secret` text,
	`organisation_id` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_github_app_config_org` ON `github_app_config` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `github_installations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`installation_id` integer NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text NOT NULL,
	`github_app_config_id` integer NOT NULL,
	`organisation_id` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`github_app_config_id`) REFERENCES `github_app_config`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_github_installations_unique` ON `github_installations` (`installation_id`);--> statement-breakpoint
CREATE INDEX `idx_github_installations_org` ON `github_installations` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `github_sync_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`installation_id` integer NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`branch` text DEFAULT 'main' NOT NULL,
	`last_sync_at` integer,
	`last_sync_status` text,
	`last_sync_error` text,
	`last_sync_commit_sha` text,
	`organisation_id` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_github_sync_config_org` ON `github_sync_config` (`organisation_id`);