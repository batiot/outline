import type Universe from "@server/models/Universe";

export default function presentUniverse(universe: Universe) {
    return {
        id: universe.id,
        name: universe.name,
        teamId: universe.teamId,
        createdAt: universe.createdAt,
        updatedAt: universe.updatedAt,
    };
}
