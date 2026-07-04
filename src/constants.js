export const VERSION = '0.2.0-alpha.2';

export const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.setuplens',
  '.next',
  '.npm-cache',
  '.nuxt',
  '.cache',
  '.turbo',
  '.venv',
  'venv',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  'target',
  'vendor'
]);

export const TEXT_EXTENSIONS = new Set([
  '', '.bat', '.c', '.cc', '.cjs', '.conf', '.config', '.cpp', '.csproj', '.css', '.cxx', '.env', '.fsproj',
  '.go', '.gradle', '.h', '.hpp', '.html', '.ini', '.java', '.js', '.json', '.jsx', '.md', '.mjs', '.mod', '.php',
  '.prisma', '.properties', '.ps1', '.py', '.rb', '.rs', '.sh', '.sln', '.slnx', '.sql', '.toml', '.ts',
  '.tsx', '.txt', '.vue', '.xml', '.yaml', '.yml'
]);

export const STATUS_ORDER = Object.freeze({ fail: 0, warn: 1, info: 2, pass: 3 });

export const FINDING_SCOPES = Object.freeze({
  SETUP: 'setup',
  HYGIENE: 'hygiene'
});

export const STATUS_LABELS = Object.freeze({
  fail: 'FAIL',
  warn: 'WARN',
  info: 'INFO',
  pass: 'PASS'
});

export const VSCODE_EXTENSIONS = Object.freeze({
  node: [
    ['dbaeumer.vscode-eslint', 'JavaScript and TypeScript linting'],
    ['esbenp.prettier-vscode', 'Consistent formatting']
  ],
  python: [
    ['ms-python.python', 'Python language support'],
    ['charliermarsh.ruff', 'Fast Python linting and formatting']
  ],
  docker: [
    ['ms-azuretools.vscode-containers', 'Docker and Compose tooling'],
    ['redhat.vscode-yaml', 'YAML validation and completion']
  ],
  java: [
    ['vscjava.vscode-java-pack', 'Java development tools']
  ],
  rust: [
    ['rust-lang.rust-analyzer', 'Rust language support']
  ],
  go: [
    ['golang.go', 'Go language support']
  ]
});
