CREATE TABLE `dashboard_share_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`dashboard_id` integer NOT NULL,
	`label` text,
	`created_by` integer,
	`expires_at` integer,
	`revoked_at` integer,
	`last_used_at` integer,
	`organisation_id` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`dashboard_id`) REFERENCES `analytics_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_dst_dashboard` ON `dashboard_share_tokens` (`dashboard_id`);
--> statement-breakpoint
CREATE INDEX `idx_dst_org` ON `dashboard_share_tokens` (`organisation_id`);
