/** @type {import('jest').Config} */
module.exports = {
  displayName: "vscode-extension",
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^vscode$": "<rootDir>/__mocks__/vscode.js",
  },
  globals: {
    "ts-jest": {
      tsconfig: "<rootDir>/tsconfig.json",
    },
  },
};
