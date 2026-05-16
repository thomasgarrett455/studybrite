-- CreateTable
CREATE TABLE `ai_conversations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `classroom_id` INTEGER NULL,
    `quiz_context_id` INTEGER NULL,
    `note_context_id` INTEGER NULL,
    `flashcard_context_id` INTEGER NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `flashcard_context_id`(`flashcard_context_id`),
    INDEX `idx_conversations_classroom`(`classroom_id`),
    INDEX `idx_conversations_user`(`user_id`, `updated_at`),
    INDEX `note_context_id`(`note_context_id`),
    INDEX `quiz_context_id`(`quiz_context_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` INTEGER NOT NULL,
    `sender` ENUM('user', 'ai') NOT NULL,
    `message_text` LONGTEXT NOT NULL,
    `model_used` VARCHAR(100) NULL,
    `input_tokens` INTEGER NULL,
    `output_tokens` INTEGER NULL,
    `timestamp` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_chat_conversation_time`(`conversation_id`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classroom_members` (
    `classroom_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `role` ENUM('teacher', 'assistant', 'student') NOT NULL DEFAULT 'student',
    `joined_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_members_role`(`classroom_id`, `role`),
    INDEX `idx_members_user`(`user_id`),
    PRIMARY KEY (`classroom_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classrooms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `invite_code` VARCHAR(20) NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `archived_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `invite_code`(`invite_code`),
    INDEX `idx_classrooms_archived_at`(`archived_at`),
    INDEX `idx_classrooms_owner`(`owner_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `flashcard_headers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `creator_id` INTEGER NOT NULL,
    `classroom_id` INTEGER NULL,
    `current_version_id` INTEGER NULL,
    `parent_header_id` INTEGER NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `archived_at` TIMESTAMP(0) NULL,

    INDEX `fk_current_flashcard_version`(`current_version_id`),
    INDEX `idx_flashcard_headers_classroom`(`classroom_id`, `archived_at`),
    INDEX `idx_flashcard_headers_creator`(`creator_id`, `archived_at`),
    INDEX `idx_flashcard_headers_parent`(`parent_header_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `flashcard_study_progress` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `flashcard_id` INTEGER NOT NULL,
    `ease_factor` DECIMAL(4, 2) NOT NULL DEFAULT 2.50,
    `interval_days` INTEGER NOT NULL DEFAULT 0,
    `repetitions` INTEGER NOT NULL DEFAULT 0,
    `last_reviewed_at` TIMESTAMP(0) NULL,
    `next_review_at` TIMESTAMP(0) NULL,

    INDEX `flashcard_id`(`flashcard_id`),
    INDEX `idx_progress_due`(`user_id`, `next_review_at`),
    UNIQUE INDEX `uk_progress_user_card`(`user_id`, `flashcard_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `flashcard_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `header_id` INTEGER NOT NULL,
    `version_number` INTEGER NOT NULL DEFAULT 1,
    `topic` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_flashcard_version`(`header_id`, `version_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `flashcards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `version_id` INTEGER NOT NULL,
    `term` TEXT NOT NULL,
    `definition` TEXT NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `idx_flashcards_version`(`version_id`, `display_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `note_headers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `classroom_id` INTEGER NULL,
    `current_version_id` INTEGER NULL,
    `is_ai_generated` BOOLEAN NOT NULL DEFAULT false,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `archived_at` TIMESTAMP(0) NULL,

    INDEX `fk_current_note_version`(`current_version_id`),
    INDEX `idx_notes_classroom`(`classroom_id`, `archived_at`),
    INDEX `idx_notes_user_classroom`(`user_id`, `classroom_id`, `archived_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `note_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `version_id` INTEGER NOT NULL,
    `image_url` VARCHAR(500) NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `ocr_text` LONGTEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_note_images_version`(`version_id`, `display_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `note_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `header_id` INTEGER NOT NULL,
    `version_number` INTEGER NOT NULL DEFAULT 1,
    `title` VARCHAR(255) NULL,
    `content` LONGTEXT NULL,
    `transcribed_text` LONGTEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_note_version`(`header_id`, `version_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quiz_attempts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `version_id` INTEGER NOT NULL,
    `started_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `submitted_at` TIMESTAMP(0) NULL,
    `score_correct` INTEGER NULL,
    `score_total` INTEGER NULL,

    INDEX `idx_attempts_user`(`user_id`, `submitted_at`),
    INDEX `idx_attempts_version`(`version_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quiz_headers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `creator_id` INTEGER NOT NULL,
    `classroom_id` INTEGER NULL,
    `current_version_id` INTEGER NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `archived_at` TIMESTAMP(0) NULL,

    INDEX `fk_current_quiz_version`(`current_version_id`),
    INDEX `idx_quiz_headers_classroom`(`classroom_id`, `archived_at`),
    INDEX `idx_quiz_headers_creator`(`creator_id`, `archived_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quiz_questions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `version_id` INTEGER NOT NULL,
    `question_text` TEXT NOT NULL,
    `answer_data` JSON NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `idx_quiz_questions_version`(`version_id`, `display_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quiz_responses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `attempt_id` INTEGER NOT NULL,
    `question_id` INTEGER NOT NULL,
    `response_data` JSON NOT NULL,
    `is_correct` BOOLEAN NULL,
    `answered_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `question_id`(`question_id`),
    UNIQUE INDEX `uk_response_per_question`(`attempt_id`, `question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quiz_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `header_id` INTEGER NOT NULL,
    `version_number` INTEGER NOT NULL DEFAULT 1,
    `title` VARCHAR(255) NOT NULL,
    `topic` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_quiz_version`(`header_id`, `version_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('student', 'teacher', 'admin') NOT NULL DEFAULT 'student',
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `deleted_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `email`(`email`),
    INDEX `idx_users_deleted_at`(`deleted_at`),
    INDEX `idx_users_email_active`(`email`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_conversations` ADD CONSTRAINT `ai_conversations_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ai_conversations` ADD CONSTRAINT `ai_conversations_ibfk_2` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ai_conversations` ADD CONSTRAINT `ai_conversations_ibfk_3` FOREIGN KEY (`quiz_context_id`) REFERENCES `quiz_headers`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ai_conversations` ADD CONSTRAINT `ai_conversations_ibfk_4` FOREIGN KEY (`note_context_id`) REFERENCES `note_headers`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ai_conversations` ADD CONSTRAINT `ai_conversations_ibfk_5` FOREIGN KEY (`flashcard_context_id`) REFERENCES `flashcard_headers`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_ibfk_1` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `classroom_members` ADD CONSTRAINT `classroom_members_ibfk_1` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `classroom_members` ADD CONSTRAINT `classroom_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `classrooms` ADD CONSTRAINT `classrooms_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `flashcard_headers` ADD CONSTRAINT `fk_current_flashcard_version` FOREIGN KEY (`current_version_id`) REFERENCES `flashcard_versions`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `flashcard_headers` ADD CONSTRAINT `flashcard_headers_ibfk_1` FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `flashcard_headers` ADD CONSTRAINT `flashcard_headers_ibfk_2` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `flashcard_headers` ADD CONSTRAINT `flashcard_headers_ibfk_3` FOREIGN KEY (`parent_header_id`) REFERENCES `flashcard_headers`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `flashcard_study_progress` ADD CONSTRAINT `flashcard_study_progress_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `flashcard_study_progress` ADD CONSTRAINT `flashcard_study_progress_ibfk_2` FOREIGN KEY (`flashcard_id`) REFERENCES `flashcards`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `flashcard_versions` ADD CONSTRAINT `flashcard_versions_ibfk_1` FOREIGN KEY (`header_id`) REFERENCES `flashcard_headers`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `flashcards` ADD CONSTRAINT `flashcards_ibfk_1` FOREIGN KEY (`version_id`) REFERENCES `flashcard_versions`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `note_headers` ADD CONSTRAINT `fk_current_note_version` FOREIGN KEY (`current_version_id`) REFERENCES `note_versions`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `note_headers` ADD CONSTRAINT `note_headers_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `note_headers` ADD CONSTRAINT `note_headers_ibfk_2` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `note_images` ADD CONSTRAINT `note_images_ibfk_1` FOREIGN KEY (`version_id`) REFERENCES `note_versions`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `note_versions` ADD CONSTRAINT `note_versions_ibfk_1` FOREIGN KEY (`header_id`) REFERENCES `note_headers`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `quiz_attempts` ADD CONSTRAINT `quiz_attempts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `quiz_attempts` ADD CONSTRAINT `quiz_attempts_ibfk_2` FOREIGN KEY (`version_id`) REFERENCES `quiz_versions`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `quiz_headers` ADD CONSTRAINT `fk_current_quiz_version` FOREIGN KEY (`current_version_id`) REFERENCES `quiz_versions`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `quiz_headers` ADD CONSTRAINT `quiz_headers_ibfk_1` FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `quiz_headers` ADD CONSTRAINT `quiz_headers_ibfk_2` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `quiz_questions` ADD CONSTRAINT `quiz_questions_ibfk_1` FOREIGN KEY (`version_id`) REFERENCES `quiz_versions`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `quiz_responses` ADD CONSTRAINT `quiz_responses_ibfk_1` FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `quiz_responses` ADD CONSTRAINT `quiz_responses_ibfk_2` FOREIGN KEY (`question_id`) REFERENCES `quiz_questions`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `quiz_versions` ADD CONSTRAINT `quiz_versions_ibfk_1` FOREIGN KEY (`header_id`) REFERENCES `quiz_headers`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

