CREATE TABLE `scim_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` integer,
	`organisation_id` integer DEFAULT 1 NOT NULL,
	`last_used_at` integer,
	`created_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_scim_tokens_org` ON `scim_tokens` (`organisation_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `scim_external_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `scim_provisioned` integer DEFAULT false NOT NULL;