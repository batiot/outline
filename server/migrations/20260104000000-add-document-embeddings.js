"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `CREATE EXTENSION IF NOT EXISTS vector;`
    );

    await queryInterface.createTable("document_embeddings", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      documentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "documents",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      teamId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "teams",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      modelId: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      documentVersion: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      chunkIndex: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      context: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.sequelize.query(
      `ALTER TABLE document_embeddings ADD COLUMN embedding vector(1536);`
    );

    await queryInterface.addConstraint("document_embeddings", {
      fields: ["documentId", "chunkIndex", "modelId"],
      type: "unique",
      name: "document_embeddings_unique_chunk",
    });

    await queryInterface.sequelize.query(
      `CREATE INDEX document_embeddings_vector_idx ON document_embeddings USING hnsw (embedding vector_cosine_ops);`
    );

    await queryInterface.addIndex("document_embeddings", ["teamId"]);
    await queryInterface.addIndex("document_embeddings", ["documentId"]);
    await queryInterface.addIndex("document_embeddings", ["modelId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("document_embeddings");
  },
};
