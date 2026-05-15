CREATE TABLE `allowlist` (
	`email` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`salary` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`work_arrangement` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`deadline` integer,
	`follow_up_date` integer,
	`applied_at` integer,
	`created_at` integer NOT NULL,
	`added_by` text DEFAULT '' NOT NULL,
	`added_by_name` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending_urls` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`hostname` text DEFAULT '' NOT NULL,
	`extraction` text DEFAULT 'idle' NOT NULL,
	`extracted` text NOT NULL,
	`extract_error` text DEFAULT '' NOT NULL,
	`added_by` text DEFAULT '' NOT NULL,
	`added_by_name` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
