module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', '*.js', '*.d.ts'],
  rules: {
    // Keep CI noise low; tighten later once MVP is stable
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // Formatting will be handled separately (prettier) when we decide to enforce it
    'no-useless-escape': 'off',
    // Legacy codebase uses some requires and mutable lets; treat as non-blocking for now
    '@typescript-eslint/no-var-requires': 'off',
    'prefer-const': 'off',
  },
};

