import { InvalidRequestError } from "@server/errors";
import fetch from "@server/utils/fetch";
import env from "../env";

interface LiteLLMEmbeddingResponse {
    data: Array<{
        embedding: number[];
        index: number;
    }>;
    model: string;
    usage: {
        prompt_tokens: number;
        total_tokens: number;
    };
}

class LiteLLMClient {
    public async createEmbedding(input: string | string[]): Promise<LiteLLMEmbeddingResponse> {
        if (!env.RAG_LITELLM_BASE_URL) {
            throw new Error("RAG_LITELLM_BASE_URL is not configured");
        }

        try {
            const response = await fetch(`${env.RAG_LITELLM_BASE_URL}/embeddings`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.RAG_LITELLM_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: env.RAG_EMBEDDING_MODEL,
                    input,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `LiteLLM error: ${response.statusText}`);
            }

            return (await response.json()) as LiteLLMEmbeddingResponse;
        } catch (err) {
            throw InvalidRequestError(err.message);
        }
    }

    public async batchCreateEmbeddings(
        inputs: string[],
        batchSize = 20
    ): Promise<LiteLLMEmbeddingResponse> {
        // For now, LiteLLM handles arrays of strings, but we can batch if needed
        // to avoid hitting request size limits.
        return this.createEmbedding(inputs);
    }
}

export default new LiteLLMClient();
