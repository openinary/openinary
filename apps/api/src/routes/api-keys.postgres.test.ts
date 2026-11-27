import { apiKeysSuite } from "./api-keys.suite";

// Skipped unless TEST_DATABASE_URL is set (see shared/testing).
apiKeysSuite("postgres");
