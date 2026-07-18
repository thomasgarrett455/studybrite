-- CreateTable
CREATE TABLE `diagrams` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `classroom_id` INTEGER NOT NULL,
    `topic` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `diagram_data` JSON NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `archived_at` TIMESTAMP(0) NULL,

    INDEX `idx_diagrams_classroom`(`classroom_id`, `archived_at`),
    INDEX `idx_diagrams_user`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `diagrams` ADD CONSTRAINT `diagrams_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `diagrams` ADD CONSTRAINT `diagrams_ibfk_2` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;