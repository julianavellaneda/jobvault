CREATE TABLE `ai_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'minimax' NOT NULL,
	`api_key` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`base_url` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
