-- AlterTable
ALTER TABLE `ai_conversations` ADD COLUMN `assessed_at` TIMESTAMP(0) NULL,
    ADD COLUMN `mode` ENUM('chat', 'teach') NOT NULL DEFAULT 'chat',
    ADD COLUMN `summarized_up_to` INTEGER NULL,
    ADD COLUMN `summary` TEXT NULL,
    ADD COLUMN `topic` VARCHAR(255) NULL;
