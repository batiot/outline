import SearchHelper from "@server/models/helpers/SearchHelper";
import { User } from "@server/models";
import RAGSearchHelper, { RAGSearchOptions, RAGSearchResult } from "./RAGSearchHelper";

class HybridSearchHelper {
    public static async searchForUser(
        user: User,
        options: RAGSearchOptions & { mode?: "vector" | "hybrid"; vectorWeight?: number; keywordWeight?: number }
    ): Promise<RAGSearchResult[]> {
        if (options.mode === "vector" || !options.mode) {
            return RAGSearchHelper.searchForUser(user, options);
        }

        // Execute both searches in parallel
        const [vectorResults, keywordResults] = await Promise.all([
            RAGSearchHelper.searchForUser(user, options),
            SearchHelper.searchForUser(user, {
                query: options.query,
                limit: options.limit || 10,
            }),
        ]);

        return this.mergeWithRRF(vectorResults, keywordResults, {
            limit: options.limit || 10,
            vectorWeight: options.vectorWeight || 0.7,
            keywordWeight: options.keywordWeight || 0.3,
        });
    }

    private static mergeWithRRF(
        vectorResults: RAGSearchResult[],
        keywordResults: any[],
        options: { limit: number; vectorWeight: number; keywordWeight: number }
    ): RAGSearchResult[] {
        const k = 60; // RRF constant
        const scores = new Map<string, { score: number; result: RAGSearchResult }>();

        // Add vector scores
        vectorResults.forEach((result, rank) => {
            const rrf = 1 / (k + rank + 1);
            scores.set(result.documentId, {
                score: rrf * options.vectorWeight,
                result,
            });
        });

        // Add keyword scores
        keywordResults.forEach((result, rank) => {
            const docId = result.document.id;
            const rrf = 1 / (k + rank + 1);
            const existing = scores.get(docId);
            if (existing) {
                existing.score += rrf * options.keywordWeight;
            } else {
                // Convert keyword result to RAGSearchResult format
                scores.set(docId, {
                    score: rrf * options.keywordWeight,
                    result: {
                        id: `kw_${result.document.id}`,
                        documentId: result.document.id,
                        title: result.document.title,
                        collectionId: result.document.collectionId,
                        score: 0, // We don't have a comparable score here
                        context: result.context || "",
                        chunkIndex: 0,
                    },
                });
            }
        });

        // Sort and return top results
        return Array.from(scores.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, options.limit)
            .map(({ result }) => result);
    }
}

export default HybridSearchHelper;
