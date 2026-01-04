import { BaseTask } from "@server/queues/tasks/base/BaseTask";
import { Document } from "@server/models";
import Logger from "@server/logging/Logger";
import GenerateDocumentEmbeddingsTask from "./GenerateDocumentEmbeddingsTask";
import env from "../env";

interface Props {
    teamId: string;
    force?: boolean;
}

class BulkIndexDocumentsTask extends BaseTask<Props> {
    public async perform(props: Props) {
        if (!env.RAG_ENABLED) {
            return;
        }

        const { teamId, force } = props;

        // Get all published documents for the team
        const documents = await Document.findAll({
            where: {
                teamId,
                publishedAt: { [Symbol.for("ne")]: null },
                deletedAt: null,
                archivedAt: null,
            },
            attributes: ["id"],
        });

        Logger.info("rag", `Bulk indexing ${documents.length} documents for team ${teamId}`);

        const task = new GenerateDocumentEmbeddingsTask();
        for (const doc of documents) {
            await task.schedule({ documentId: doc.id, force });
        }
    }
}

export default BulkIndexDocumentsTask;
