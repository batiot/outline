import {
    Table,
    Column,
    Model,
    DataType,
    ForeignKey,
    BelongsTo,
    Index,
    AllowNull,
    Default,
    PrimaryKey,
} from "sequelize-typescript";
import Document from "./Document";
import Team from "./Team";

@Table({
    tableName: "document_embeddings",
    modelName: "document_embedding",
    timestamps: true,
})
class DocumentEmbedding extends Model {
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column(DataType.UUID)
    public id: string;

    @ForeignKey(() => Document)
    @AllowNull(false)
    @Column(DataType.UUID)
    public documentId: string;

    @BelongsTo(() => Document)
    public document: Document;

    @ForeignKey(() => Team)
    @AllowNull(false)
    @Column(DataType.UUID)
    public teamId: string;

    @BelongsTo(() => Team)
    public team: Team;

    @AllowNull(false)
    @Column(DataType.STRING)
    public modelId: string;

    @AllowNull(false)
    @Column(DataType.INTEGER)
    public documentVersion: number;

    @AllowNull(false)
    @Column(DataType.INTEGER)
    public chunkIndex: number;

    @AllowNull(false)
    @Column(DataType.TEXT)
    public context: string;

    @AllowNull(false)
    @Column("VECTOR(1536)")
    public embedding: number[];

    @Index
    @Column(DataType.DATE)
    public createdAt: Date;

    @Index
    @Column(DataType.DATE)
    public updatedAt: Date;
}

export default DocumentEmbedding;
