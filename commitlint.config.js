export default {
  extends: ['@commitlint/config-conventional'],
  // Dependabot writes "Bump …" with a capital and long link lines, and has no
  // setting to change either. Its own commits, by its subject and its sign-off
  // together, are left alone; the pull request title is what lands on main.
  ignores: [
    (message) =>
      /^ci\(deps\): Bump /.test(message) &&
      /\nSigned-off-by: dependabot\[bot\] <support@github\.com>\s*$/.test(
        message,
      ),
  ],
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
