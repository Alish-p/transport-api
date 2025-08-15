module.exports = {
  root: true,
  env: {
    node: true,
    es2020: true,
  },
  extends: ['airbnb-base', 'prettier'],
  plugins: ['perfectionist', 'unused-imports', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-console': 0,
    'prefer-destructuring': ['warn', { object: true, array: false }],
    'unused-imports/no-unused-imports': 'warn',
    'perfectionist/sort-exports': ['warn', { order: 'asc', type: 'line-length' }],
    'perfectionist/sort-imports': [
      'warn',
      { order: 'asc', type: 'line-length', 'newlines-between': 'always' },
    ],
    'consistent-return':0,
    'no-underscore-dangle':0,
    'import/extensions':0,
    'import/prefer-default-export':0,
    'no-else-return':0,
    'no-restricted-syntax':0,
  },
};
