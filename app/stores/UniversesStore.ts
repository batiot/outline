import { action, computed } from "mobx";
import orderBy from "lodash/orderBy";
import Universe from "~/models/Universe";
import { client } from "~/utils/ApiClient";
import type RootStore from "./RootStore";
import Store from "./base/Store";

export default class UniversesStore extends Store<Universe> {
    constructor(rootStore: RootStore) {
        super(rootStore, Universe);
    }

    @action
    fetchAll = async () => {
        this.isFetching = true;

        try {
            const res = await client.post("/universes.list", {});
            if (res?.data) {
                res.data.forEach((item) => this.add(item));
            }
        } finally {
            this.isFetching = false;
        }
    };

    @computed
    get sorted(): Universe[] {
        return orderBy(Array.from(this.data.values()), "name", "asc");
    }
}
