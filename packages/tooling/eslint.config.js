import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';

const serverOnly = [
  '@gather/delivery',
  '@gather/delivery/*',
  '@nestjs/*',
  'mongoose',
  'bullmq',
  'ioredis',
  'livekit-server-sdk',
  'argon2',
  'node:*',
];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.cache/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly' },
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks, 'react-refresh': refresh },
    rules: {
      ...hooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      'no-restricted-imports': ['error', { patterns: serverOnly }],
    },
  },
  {
    files: ['packages/contracts/src/**/*.ts', 'packages/world/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...serverOnly,
            'react',
            'react-dom',
            'phaser',
            'socket.io*',
            'livekit*',
            '**/apps/**',
          ],
        },
      ],
    },
  },
);
