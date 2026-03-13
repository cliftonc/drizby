CREATE TABLE `content_group_visibility` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_type` text NOT NULL,
	`content_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cgv_unique` ON `content_group_visibility` (`content_type`,`content_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `idx_cgv_content` ON `content_group_visibility` (`content_type`,`content_id`);--> statement-breakpoint
CREATE INDEX `idx_cgv_group` ON `content_group_visibility` (`group_id`);--> statement-breakpoint
CREATE TABLE `group_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`organisation_id` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_group_types_name_org` ON `group_types` (`name`,`organisation_id`);--> statement-breakpoint
CREATE INDEX `idx_group_types_org` ON `group_types` (`organisation_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`group_type_id` integer NOT NULL,
	`parent_id` integer,
	`organisation_id` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`group_type_id`) REFERENCES `group_types`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_groups_name_type` ON `groups` (`name`,`group_type_id`);--> statement-breakpoint
CREATE INDEX `idx_groups_org` ON `groups` (`organisation_id`);--> statement-breakpoint
CREATE INDEX `idx_groups_type` ON `groups` (`group_type_id`);--> statement-breakpoint
CREATE TABLE `user_groups` (
	`user_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_groups_user` ON `user_groups` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_groups_group` ON `user_groups` (`group_id`);