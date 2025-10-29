import type { Config } from 'jest';

const config: Config = {
  rootDir: './',
  testEnvironment: 'node',
  preset: 'ts-jest',
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};

export default config;
