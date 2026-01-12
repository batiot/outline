"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.addColumn(
                "collections",
                "universeId",
                {
                    type: Sequelize.UUID,
                    allowNull: true,
                    references: {
                        model: "universes",
                        key: "id",
                    },
                    onUpdate: "CASCADE",
                    onDelete: "SET NULL",
                },
                { transaction }
            );

            await queryInterface.addIndex("collections", ["universeId"], {
                transaction,
            });
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.removeColumn("collections", "universeId", { transaction });
        });
    },
};
