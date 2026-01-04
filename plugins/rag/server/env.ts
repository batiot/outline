import { IsBoolean, IsOptional, IsString, IsNumber, Min, Max } from "class-validator";
import { Environment } from "@server/env";
import { Public } from "@server/utils/decorators/Public";
import environment from "@server/utils/environment";

class RAGPluginEnvironment extends Environment {
    @Public
    @IsBoolean()
    public RAG_ENABLED = this.toBoolean(environment.RAG_ENABLED ?? "false");
    @IsString()
    public RAG_LITELLM_BASE_URL = this.toOptionalString(environment.RAG_LITELLM_BASE_URL);

    @IsOptional()
    @IsString()
    public RAG_LITELLM_API_KEY = this.toOptionalString(environment.RAG_LITELLM_API_KEY);

    @IsString()
    public RAG_EMBEDDING_MODEL = String(
        environment.RAG_EMBEDDING_MODEL ?? "amazon.titan-embed-text-v1"
    );

    @IsNumber()
    @Min(1)
    public RAG_EMBEDDING_DIMENSION =
        this.toOptionalNumber(environment.RAG_EMBEDDING_DIMENSION) ?? 1536;

    @IsNumber()
    @Min(0)
    @Max(1)
    public RAG_SIMILARITY_THRESHOLD =
        this.toOptionalNumber(environment.RAG_SIMILARITY_THRESHOLD) ?? 0.7;

    @IsNumber()
    @Min(100)
    public RAG_CHUNK_SIZE =
        this.toOptionalNumber(environment.RAG_CHUNK_SIZE) ?? 500;

    @IsNumber()
    @Min(0)
    public RAG_CHUNK_OVERLAP =
        this.toOptionalNumber(environment.RAG_CHUNK_OVERLAP) ?? 50;
}

export default new RAGPluginEnvironment();
