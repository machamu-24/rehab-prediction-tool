CREATE TABLE `literature_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`outcomeId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`ruleType` enum('cutoff','decision_tree','regression') NOT NULL,
	`source` varchar(512) NOT NULL,
	`sourceUrl` varchar(1024),
	`evidenceLevel` enum('Systematic Review','RCT','Cohort Study','Case-Control','Expert Classification','Other') NOT NULL DEFAULT 'Cohort Study',
	`applyConditions` json DEFAULT ('[]'),
	`ruleDefinition` json NOT NULL,
	`accuracy` float,
	`sensitivity` float,
	`specificity` float,
	`auc` float,
	`consensusEligible` boolean NOT NULL DEFAULT true,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `literature_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `outcomes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`unit` varchar(64),
	`positiveLabel` varchar(128) NOT NULL DEFAULT '自立',
	`negativeLabel` varchar(128) NOT NULL DEFAULT '非自立',
	`isDefault` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outcomes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prediction_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`predictionId` int NOT NULL,
	`ruleId` int NOT NULL,
	`ruleName` varchar(256) NOT NULL,
	`isApplicable` boolean NOT NULL,
	`unavailableReason` text,
	`isPositive` boolean,
	`prediction` text,
	`probability` float,
	`details` json DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prediction_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientInputs` json NOT NULL,
	`outcomeId` int NOT NULL,
	`consensusScore` float,
	`consensusLabel` varchar(64),
	`actualOutcome` json,
	`outcomeRecordedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `predictions_id` PRIMARY KEY(`id`)
);
