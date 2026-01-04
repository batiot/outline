import ChunkingHelper from "./helpers/ChunkingHelper";
import RAGSearchHelper from "./helpers/RAGSearchHelper";
import LiteLLMClient from "./services/LiteLLMClient";
import { sequelize } from "@server/storage/database";

jest.mock("./services/LiteLLMClient");

describe("RAG Plugin", () => {
    describe("ChunkingHelper", () => {
        it("should split text into chunks", () => {
            const text = "This is a long text that should be split into multiple chunks for embedding purposes. ".repeat(10);
            const chunks = ChunkingHelper.chunkText(text);
            expect(chunks.length).toBeGreaterThan(1);
            expect(chunks[0].chunkText.length).toBeGreaterThan(50);
        });

        it("should return empty array for short text", () => {
            const chunks = ChunkingHelper.chunkText("short");
            expect(chunks).toEqual([]);
        });
    });

    describe("RAGSearchHelper", () => {
        it("should call LiteLLM and execute query", async () => {
            const mockUser = {
                id: "user-123",
                teamId: "team-456",
                collectionIds: jest.fn().mockResolvedValue(["col-1", "col-2"]),
            } as any;

            (LiteLLMClient.createEmbedding as jest.Mock).mockResolvedValue({
                data: [{ embedding: new Array(1536).fill(0.1) }],
            });

            const querySpy = jest.spyOn(sequelize, "query").mockResolvedValue([] as any);

            await RAGSearchHelper.searchForUser(mockUser, { query: "test query" });

            expect(LiteLLMClient.createEmbedding).toHaveBeenCalledWith("test query");
            expect(querySpy).toHaveBeenCalled();

            querySpy.mockRestore();
        });
    });
});
