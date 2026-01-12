"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.createTable(
                "universes",
                {
                    id: {
                        type: Sequelize.UUID,
                        allowNull: false,
                        primaryKey: true,
                    },
                    name: {
                        type: Sequelize.STRING,
                        allowNull: false,
                    },
                    teamId: {
                        type: Sequelize.UUID,
                        allowNull: false,
                        onDelete: "cascade",
                        references: {
                            model: "teams",
                        },
                    },
                    createdAt: {
                        type: Sequelize.DATE,
                        allowNull: false,
                    },
                    updatedAt: {
                        type: Sequelize.DATE,
                        allowNull: false,
                    },
                },
                { transaction }
            );

            await queryInterface.addIndex("universes", ["teamId"], {
                transaction,
            });
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable("universes");
    },
};
