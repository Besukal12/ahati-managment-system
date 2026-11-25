process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/auth_test";
process.env.JWT_ACCESS_SECRET =
  "test-access-secret-with-at-least-32-characters";
process.env.JWT_REFRESH_SECRET =
  "test-refresh-secret-with-at-least-32-characters";
process.env.ADMIN_BOOTSTRAP_KEY =
  "test-admin-bootstrap-key-with-at-least-32-characters";
process.env.WEB_ORIGIN = "http://localhost:3000";
