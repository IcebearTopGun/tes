export const JWT_SECRET = process.env.SESSION_SECRET || "super-secret-key";
export const isIntegrationTestMode = process.env.INTEGRATION_TEST_MODE === "1" || process.env.NODE_ENV === "test";

/*
File Purpose:
This file centralizes route-level environment constants.

Responsibilities:

* Defines JWT secret and integration-test flag values
* Provides shared constants for route modules and middleware

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
