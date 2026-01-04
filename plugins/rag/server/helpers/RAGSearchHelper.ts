import { QueryTypes } from "sequelize";
import { toSql } from "pgvector";
import { sequelize } from "@server/storage/database";
import { User, DocumentEmbedding } from "@server/models";
import LiteLLMClient from "../services/LiteLLMClient";
import env from "../env";

export interface RAGSearchOptions {
    query: string;
    limit?: number;
    threshold?: number;
    collectionId?: string;
    documentId?: string;
}

export interface RAGSearchResult {
    id: string;
    documentId: string;
    title: string;
    collectionId: string;
    score: number;
    context: string;
    chunkIndex: number;
}

class RAGSearchHelper {
    public static async searchForUser(
        user: User,
        options: RAGSearchOptions
    ): Promise<RAGSearchResult[]> {
        const { query, limit = 10, threshold = env.RAG_SIMILARITY_THRESHOLD } = options;

        // 1. Generate embedding for the query
        const response = await LiteLLMClient.createEmbedding(query);
        const queryEmbedding = response.data[0].embedding;

        // 2. Get accessible collection IDs for user
        const collectionIds = await user.collectionIds();

        // 3. Execute raw SQL with permission filtering
        // We use cosine similarity: 1 - (embedding <=> :queryEmbedding)
        const results = await sequelize.query<any>(
            `
      SELECT 
        de.id,
        de."documentId",
        de.context,
        de."chunkIndex",
        d.title,
        d."collectionId",
        1 - (de.embedding <=> :queryEmbedding) as score
      FROM document_embeddings de
      INNER JOIN documents d ON de."documentId" = d.id
      LEFT JOIN user_memberships um ON d.id = um."documentId" AND um."userId" = :userId
      LEFT JOIN collection_memberships cm ON d."collectionId" = cm."collectionId" 
        AND cm."userId" = :userId
      WHERE de."teamId" = :teamId
        AND de."modelId" = :modelId
        AND d."publishedAt" IS NOT NULL
        AND d."deletedAt" IS NULL
        AND d."archivedAt" IS NULL
        AND (
          d."collectionId" = ANY(:collectionIds)
          OR um.id IS NOT NULL
          OR cm.id IS NOT NULL
        )
        AND 1 - (de.embedding <=> :queryEmbedding) > :threshold
      ORDER BY score DESC
      LIMIT :limit
    `,
            {
                replacements: {
                    queryEmbedding: toSql(queryEmbedding),
                    userId: user.id,
                    teamId: user.teamId,
                    modelId: env.RAG_EMBEDDING_MODEL,
                    collectionIds,
                    threshold,
                    limit,
                },
                type: QueryTypes.SELECT,
            }
        );

        return results.map((r) => ({
            id: r.id,
            documentId: r.documentId,
            title: r.title,
            collectionId: r.collectionId,
            score: parseFloat(r.score),
            context: r.context,
            chunkIndex: r.chunkIndex,
        }));
    }
}

export default RAGSearchHelper;
