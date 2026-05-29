CREATE TABLE `postAnalysis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`instagramPostId` varchar(64) NOT NULL,
	`description` text,
	`contentCategory` varchar(64),
	`script` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `postAnalysis_id` PRIMARY KEY(`id`)
);
