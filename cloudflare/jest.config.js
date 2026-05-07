/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/src/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", {
      tsconfig: {
        lib: ["es2022"],
        target: "es2022",
        module: "commonjs",
        strict: false,
        skipLibCheck: true,
        esModuleInterop: true,
        types: ["jest", "node"],
      },
    }],
  },
};
