export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The constitution caps the subject at 72 characters (§1).
    'header-max-length': [2, 'always', 72],
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'refactor',
        'test',
        'docs',
        'chore',
        'perf',
        'build',
        'ci',
      ],
    ],
  },
}
