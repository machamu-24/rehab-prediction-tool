ALTER TABLE `literature_rules` MODIFY COLUMN `ruleType` enum('cutoff','decision_tree','regression','scoring_system','nomogram','composite_rule','custom_formula') NOT NULL;--> statement-breakpoint
ALTER TABLE `literature_rules` MODIFY COLUMN `applyConditions` json;--> statement-breakpoint
ALTER TABLE `prediction_results` MODIFY COLUMN `details` json;