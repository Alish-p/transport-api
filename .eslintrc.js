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
    sourceType: 'script',
  },
  rules: {
    'no-console': 0,
    'prefer-destructuring': ['warn', { object: true, array: false }],
    'unused-imports/no-unused-imports': 'warn',
    'perfectionist/sort-imports': [
      'warn',
      {
        type: 'line-length',
        order: 'asc',
        groups: [
          ['builtin', 'external'],
          'internal',
          ['parent', 'sibling', 'index'],
          'object',
          'type',
        ],
        'newlines-between': 'always',
      },
    ],
    'perfectionist/sort-named-imports': ['warn', { type: 'line-length', order: 'asc' }],
    'perfectionist/sort-exports': ['warn', { type: 'line-length', order: 'asc' }],
    'consistent-return': 0,
    'no-underscore-dangle': 0,
  },
};
