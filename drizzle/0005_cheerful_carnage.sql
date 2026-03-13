CREATE TABLE `oauth_auth_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`redirect_uri` text,
	`code_challenge` text,
	`code_challenge_method` text DEFAULT 'S256',
	`client_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` integer NOT NULL,
	`is_revoked` integer DEFAULT false NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`secret` text,
	`redirect_uris` text NOT NULL,
	`allowed_grants` text NOT NULL,
	`scopes` text NOT NULL,
	`organisation_id` integer DEFAULT 1 NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`access_token` text PRIMARY KEY NOT NULL,
	`access_token_expires_at` integer NOT NULL,
	`refresh_token` text,
	`refresh_token_expires_at` integer,
	`client_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`scopes` text NOT NULL,
	`is_revoked` integer DEFAULT false NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_tokens_refresh` ON `oauth_tokens` (`refresh_token`);--> statement-breakpoint
CREATE INDEX `idx_oauth_tokens_user` ON `oauth_tokens` (`user_id`);