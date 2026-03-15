CREATE TABLE `magic_link_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`user_id` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
