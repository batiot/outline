import type { InferAttributes, InferCreationAttributes } from "sequelize";
import {
    Table,
    Column,
    DataType,
    ForeignKey,
    BelongsTo,
    HasMany,
} from "sequelize-typescript";
import Collection from "./Collection";
import Team from "./Team";
import IdModel from "./base/IdModel";
import Fix from "./decorators/Fix";

@Table({ tableName: "universes", modelName: "universe" })
@Fix
class Universe extends IdModel<
    InferAttributes<Universe>,
    Partial<InferCreationAttributes<Universe>>
> {
    @Column
    name: string;

    // associations

    @BelongsTo(() => Team, "teamId")
    team: Team;

    @ForeignKey(() => Team)
    @Column(DataType.UUID)
    teamId: string;

    @HasMany(() => Collection, "universeId")
    collections: Collection[];
}

export default Universe;
