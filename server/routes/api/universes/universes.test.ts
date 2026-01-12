import {
    buildUser,
    buildTeam,
    buildUniverse,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";

const server = getTestServer();

describe("#universes.list", () => {
    it("should require authentication", async () => {
        const res = await server.post("/api/universes.list");
        expect(res.status).toEqual(401);
    });

    it("should return universes for the team", async () => {
        const team = await buildTeam();
        const user = await buildUser({ teamId: team.id });
        const universe = await buildUniverse({
            teamId: team.id,
            name: "Universe A",
        });
        // Create another universe for a different team
        await buildUniverse();

        const res = await server.post("/api/universes.list", {
            body: {
                token: user.getJwtToken(),
            },
        });
        const body = await res.json();
        expect(res.status).toEqual(200);
        expect(body.data.length).toEqual(1);
        expect(body.data[0].id).toEqual(universe.id);
        expect(body.data[0].name).toEqual("Universe A");
    });
});
