import { observable } from "mobx";
import type UniversesStore from "~/stores/UniversesStore";
import Model from "~/models/base/Model";
import Field from "./decorators/Field";

export default class Universe extends Model {
  static modelName = "Universe";

  store: UniversesStore;

  @Field
  @observable
  name: string;

  @Field
  @observable
  teamId: string;
}
