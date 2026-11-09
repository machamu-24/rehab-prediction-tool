ALTER TABLE `literature_rules` MODIFY COLUMN `ruleType` enum('cutoff','decision_tree','regression','scoring_system','nomogram','composite_rule','custom_formula','logistic_regression') NOT NULL;
