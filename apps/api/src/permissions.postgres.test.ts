import { permissionsSuite } from "./permissions.suite";

// Skipped unless TEST_DATABASE_URL is set (see shared/testing).
permissionsSuite("postgres");
