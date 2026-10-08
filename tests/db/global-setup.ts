import { resetDatabase } from "../../scripts/lib/reset-db.mjs";
import { TEST_DATABASE_URL } from "./config";

export default async function setup() {
  await resetDatabase(TEST_DATABASE_URL);
}
