export { DatabaseStorage, storage } from "../storage";
export type { IStorage } from "./types";

/*
File Purpose:
This file is the modular entrypoint for the storage layer.

Responsibilities:

* Re-exports the existing storage implementation and singleton
* Re-exports the storage interface type contract

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
