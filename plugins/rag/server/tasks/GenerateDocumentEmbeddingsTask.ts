import { BaseTask } from "@server/queues/tasks/base/BaseTask";
import { Document, DocumentEmbedding } from "@server/models";
import Logger from "@server/logging/Logger";
import ChunkingHelper from "../helpers/ChunkingHelper";
import LiteLLMClient from "../services/LiteLLMClient";
import env from "../env";

interface Props {
    documentId: string;
    force?: boolean;
}

class GenerateDocumentEmbeddingsTask extends BaseTask<Props> {
    public async perform(props: Props) {
        if (!env.RAG_ENABLED) {
            return;
        }

        const { documentId, force } = props;
        const document = await Document.findByPk(documentId);

        if (!document) {
            Logger.warn("rag", `Document ${documentId} not found for embedding generation`);
            return;
        }

        // 1. Check if embedding is current
        const latestEmbedding = await DocumentEmbedding.findOne({
            where: {
                documentId,
                modelId: env.RAG_EMBEDDING_MODEL,
            },
            order: [["documentVersion", "DESC"]],
        });

        if (!force && latestEmbedding && latestEmbedding.documentVersion >= document.version) {
            Logger.info("rag", `Embeddings for document ${documentId} are up to date`);
            return;
        }

        // 2. Chunk document content
        const chunks = ChunkingHelper.chunkText(document.text);
        if (chunks.length === 0) {
            // If document is too short, we might want to delete existing embeddings
            await DocumentEmbedding.destroy({
                where: { documentId, modelId: env.RAG_EMBEDDING_MODEL },
            });
            return;
        }

        // 3. Generate embeddings via LiteLLM
        const texts = chunks.map((c) => c.chunkText);
        const response = await LiteLLMClient.batchCreateEmbeddings(texts);

        // 4. Store new embeddings
        // We use a transaction to ensure we don't have partial updates
        await DocumentEmbedding.sequelize?.transaction(async (transaction) => {
            // Delete ALL existing embeddings for this document and model
            await DocumentEmbedding.destroy({
                where: { documentId, modelId: env.RAG_EMBEDDING_MODEL },
                transaction,
            });

            // Insert new ones
            await DocumentEmbedding.bulkCreate(
                chunks.map((chunk, index) => ({
                    documentId: document.id,
                    teamId: document.teamId,
                    modelId: env.RAG_EMBEDDING_MODEL,
                    documentVersion: document.version,
                    chunkIndex: chunk.chunkIndex,
                    context: chunk.chunkText,
                    embedding: response.data[index].embedding,
                })),
                { transaction }
            );
        });

        Logger.info("rag", `Generated ${chunks.length} embeddings for document ${documentId}`);
    }
}

export default GenerateDocumentEmbeddingsTask;
