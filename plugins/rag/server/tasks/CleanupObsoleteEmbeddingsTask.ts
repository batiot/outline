import { BaseTask } from "@server/queues/tasks/base/BaseTask";
import { DocumentEmbedding } from "@server/models";
import Logger from "@server/logging/Logger";
import env from "../env";

interface Props {
    teamId?: string;
}

class CleanupObsoleteEmbeddingsTask extends BaseTask<Props> {
    public async perform(props: Props) {
        const { teamId } = props;
        const currentModelId = env.RAG_EMBEDDING_MODEL;

        const where: any = {
            modelId: { [Symbol.for("ne")]: currentModelId },
        };

        if (teamId) {
            where.teamId = teamId;
        }

        const deletedCount = await DocumentEmbedding.destroy({ where });

        Logger.info(
            "rag",
            `Cleaned up ${deletedCount} obsolete embeddings (model != ${currentModelId})`
        );
    }
}

export default CleanupObsoleteEmbeddingsTask;
