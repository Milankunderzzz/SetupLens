const RULES = [
  {
    type: 'missing_env_var',
    severity: 'fail',
    title: 'Missing environment variable',
    pattern: /(?:missing|required|not found|undefined)[^\n\r]{0,80}?(?:environment variable|env(?:ironment)? var(?:iable)?)[^\n\r]{0,80}?["'`]?([A-Z][A-Z0-9_]{2,})["'`]?/i,
    recommendation: (match) => `Define ${match[1]} in the local environment file or shell before starting the app.`
  },
  {
    type: 'missing_env_var',
    severity: 'fail',
    title: 'Missing environment variable',
    pattern: /Environment variable not found:\s*([A-Z][A-Z0-9_]{2,})/i,
    recommendation: (match) => `Define ${match[1]} in .env or the environment used by this command.`
  },
  {
    type: 'module_not_found',
    severity: 'fail',
    title: 'Missing module or package',
    pattern: /(?:Cannot find module|ERR_MODULE_NOT_FOUND|ModuleNotFoundError:\s*No module named)\s+['"]?([^'"\n\r]+)['"]?/i,
    recommendation: (match) => `Install or restore the missing dependency/module: ${match[1]}.`
  },
  {
    type: 'node_dependencies_missing',
    severity: 'fail',
    title: 'Node dependencies are not installed',
    pattern: /npx\s+(?:error\s+)?canceled due to missing packages and no YES option:\s*\["([^"]+)"\]/i,
    recommendation: (match) => `Install project dependencies so ${match[1]} is available locally, then retry the probe.`
  },
  {
    type: 'macos_resource_fork_files',
    severity: 'fail',
    title: 'macOS archive metadata files are being treated as Python source',
    pattern: /\*\*\* Error compiling ['"]?([^'"\n\r]*(?:__MACOSX|(?:^|[\\/])\._)[^'"\n\r]*\.py)['"]?[\s\S]{0,220}?source code string cannot contain null bytes/i,
    recommendation: (match) => `Remove ${match[1]} and other __MACOSX/._* archive metadata files before running Python checks.`
  },
  {
    type: 'python_syntax_error',
    severity: 'fail',
    title: 'Python syntax error',
    pattern: /File ["']([^"']+\.py)["'], line (\d+)[\s\S]{0,240}?(?:SyntaxError|IndentationError):\s*([^\n\r]+)/i,
    recommendation: (match) => `Fix ${match[1]} at line ${match[2]}: ${match[3]}.`
  },
  {
    type: 'missing_file',
    severity: 'fail',
    title: 'Required file or directory is missing',
    pattern: /(?:ENOENT|no such file or directory|No such file or directory|cannot find path|Could not open input file)[^\n\r]{0,120}/i,
    recommendation: () => 'Restore the missing file, generate it from the documented template, or update the command/path that references it.'
  },
  {
    type: 'next_invalid_config',
    severity: 'fail',
    title: 'Next.js configuration is invalid',
    pattern: /(?:Invalid next\.config|next\.config\.(?:js|mjs|ts).*invalid|next config.*invalid|Could not find a production build|No such directory.*\.next)/i,
    recommendation: () => 'Fix next.config and verify the build output before starting Next.js.'
  },
  {
    type: 'next_missing_routes',
    severity: 'fail',
    title: 'Next.js route directory is missing',
    pattern: /(?:Couldn't find any `pages` or `app` directory|couldn't find any pages or app directory|No app directory|No pages directory)/i,
    recommendation: () => 'Add an app/ or pages/ route directory, or point SetupLens at the package that owns the Next.js app.'
  },
  {
    type: 'react_server_component_boundary',
    severity: 'fail',
    title: 'React Server Component boundary failed',
    pattern: /(?:ReactServerComponentsError|You're importing a component that needs use(?:State|Effect)|needs ["']use client["']|Hooks can only be used in Client Components)/i,
    recommendation: () => 'Move client-only code behind a "use client" boundary or remove browser-only hooks from server components.'
  },
  {
    type: 'prisma_database_unreachable',
    severity: 'fail',
    title: 'Prisma cannot reach the database',
    pattern: /(?:P1001|Can't reach database server|PrismaClientInitializationError)/i,
    recommendation: () => 'Start the database service and verify DATABASE_URL host, port, credentials, and network access.'
  },
  {
    type: 'prisma_database_missing',
    severity: 'fail',
    title: 'Prisma database does not exist',
    pattern: /(?:P1003|Database .* does not exist)/i,
    recommendation: () => 'Create the target database or point DATABASE_URL at an existing development database.'
  },
  {
    type: 'prisma_schema_drift',
    severity: 'fail',
    title: 'Prisma schema and database are out of sync',
    pattern: /(?:P2021|P2022|table .* does not exist|column .* does not exist|The table .* does not exist)/i,
    recommendation: () => 'Run the project migration workflow after confirming the target database is safe to change.'
  },
  {
    type: 'django_settings_error',
    severity: 'fail',
    title: 'Django settings are not configured',
    pattern: /(?:django\.core\.exceptions\.ImproperlyConfigured|Requested setting .* settings are not configured|DJANGO_SETTINGS_MODULE|No module named .*settings)/i,
    recommendation: () => 'Set DJANGO_SETTINGS_MODULE or restore the settings module before running Django commands.'
  },
  {
    type: 'django_allowed_hosts',
    severity: 'fail',
    title: 'Django ALLOWED_HOSTS rejected the request',
    pattern: /(?:DisallowedHost|Invalid HTTP_HOST header|ALLOWED_HOSTS)/i,
    recommendation: () => 'Add the local hostname to ALLOWED_HOSTS for development.'
  },
  {
    type: 'rails_credentials_key_missing',
    severity: 'fail',
    title: 'Rails credentials key is missing',
    pattern: /(?:Missing.*RAILS_MASTER_KEY|Missing.*master\.key|ActiveSupport::MessageEncryptor::InvalidMessage|Couldn't decrypt .*credentials)/i,
    recommendation: () => 'Provide RAILS_MASTER_KEY or config/master.key before booting encrypted credentials.'
  },
  {
    type: 'spring_datasource_config',
    severity: 'fail',
    title: 'Spring Boot datasource is not configured',
    pattern: /(?:Failed to configure a DataSource|url attribute is not specified and no embedded datasource|Cannot determine embedded database driver class)/i,
    recommendation: () => 'Define spring.datasource settings or activate the profile that supplies local database configuration.'
  },
  {
    type: 'spring_bean_creation',
    severity: 'fail',
    title: 'Spring Boot bean creation failed',
    pattern: /(?:APPLICATION FAILED TO START|BeanCreationException|UnsatisfiedDependencyException)/i,
    recommendation: () => 'Inspect the failing bean dependency and the active Spring profile/configuration.'
  },
  {
    type: 'dotnet_configuration_missing',
    severity: 'fail',
    title: '.NET configuration file or launch profile is missing',
    pattern: /(?:appsettings(?:\.[A-Za-z0-9_-]+)?\.json.*(?:not found|missing)|launchSettings\.json.*(?:not found|missing)|Unable to configure HTTPS endpoint)/i,
    recommendation: () => 'Restore appsettings/launchSettings or document the environment variables used for local startup.'
  },
  {
    type: 'go_entrypoint_or_package_error',
    severity: 'fail',
    title: 'Go package entrypoint is not runnable',
    pattern: /(?:no Go files|package .* is not a main package|function main is undeclared|cannot find main module)/i,
    recommendation: () => 'Run the correct cmd/<service> package or add a conventional main.go entrypoint.'
  },
  {
    type: 'rust_feature_mismatch',
    severity: 'fail',
    title: 'Rust feature or target configuration mismatch',
    pattern: /(?:package .* does not have feature|the package .* depends on .* with features .* but .* does not have these features|no bin target named)/i,
    recommendation: () => 'Fix Cargo features, target names, or workspace member selection before running the binary.'
  },
  {
    type: 'port_in_use',
    severity: 'fail',
    title: 'Port already in use',
    pattern: /(?:EADDRINUSE|address already in use|port\s+(\d+)\s+is already in use)/i,
    recommendation: (match) => match[1]
      ? `Stop the process using port ${match[1]} or configure the app to use another port.`
      : 'Stop the process using the requested port or configure the app to use another port.'
  },
  {
    type: 'database_migration_required',
    severity: 'fail',
    title: 'Database migration appears required',
    pattern: /(?:relation .* does not exist|table .* does not exist|no such table|pending migrations|migrate.*before running|database schema is not up to date|Prisma Migrate)/i,
    recommendation: () => 'Run the project migration command after confirming the target database is correct.'
  },
  {
    type: 'laravel_missing_app_key',
    severity: 'fail',
    title: 'Laravel APP_KEY is missing',
    pattern: /(?:No application encryption key has been specified|MissingAppKeyException|APP_KEY.*(?:missing|empty|not set))/i,
    recommendation: () => 'Copy the environment template if needed, then run php artisan key:generate in a local development environment.'
  },
  {
    type: 'database_unreachable',
    severity: 'fail',
    title: 'Database connection failed',
    pattern: /(?:ECONNREFUSED|could not connect to server|database.*(?:unreachable|refused|failed)|PrismaClientInitializationError|SQLSTATE)/i,
    recommendation: () => 'Start the database service, verify the connection URL, and run required migrations if the schema is missing.'
  },
  {
    type: 'network_or_dns',
    severity: 'fail',
    title: 'Network or DNS lookup failed',
    pattern: /(?:ENOTFOUND|EAI_AGAIN|getaddrinfo|Name or service not known|Temporary failure in name resolution|Could not resolve host)/i,
    recommendation: () => 'Check network access, DNS, proxy settings, VPN requirements, and service hostnames.'
  },
  {
    type: 'tls_certificate',
    severity: 'fail',
    title: 'TLS or certificate validation failed',
    pattern: /(?:SELF_SIGNED_CERT|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|certificate verify failed|SSL certificate problem)/i,
    recommendation: () => 'Install the required trusted certificate, fix the certificate chain, or configure the documented development CA.'
  },
  {
    type: 'private_package_auth',
    severity: 'fail',
    title: 'Package registry authentication failed',
    pattern: /(?:E401|ENEEDAUTH|401 Unauthorized|403 Forbidden|authentication token|npm ERR! code E403)/i,
    recommendation: () => 'Authenticate with the private registry or configure the required package manager token.'
  },
  {
    type: 'unsupported_runtime_version',
    severity: 'fail',
    title: 'Runtime version is incompatible',
    pattern: /(?:Unsupported engine|engine .* incompatible|requires node|requires Python|Your Ruby version is|invalid target release|UnsupportedClassVersionError|NETSDK1045|go: module requires Go)/i,
    recommendation: () => 'Switch to the runtime version declared by the project before installing or starting it.'
  },
  {
    type: 'dependency_resolution',
    severity: 'fail',
    title: 'Dependency resolution failed',
    pattern: /(?:ERESOLVE|ResolutionImpossible|No matching distribution found|Could not resolve dependency|peer dependency conflict)/i,
    recommendation: () => 'Resolve the dependency version conflict before retrying the install or build command.'
  },
  {
    type: 'native_build_tools_missing',
    severity: 'fail',
    title: 'Native build tools are missing',
    pattern: /(?:node-gyp|gyp ERR|MSB\d+|Build Tools|CMake .* not found|make: .* not found|gcc: .* not found|clang: .* not found|Failed building wheel|pg_config executable not found)/i,
    recommendation: () => 'Install the native compiler/build toolchain required by this dependency, then retry the install.'
  },
  {
    type: 'docker_unavailable',
    severity: 'fail',
    title: 'Docker daemon unavailable',
    pattern: /(?:Cannot connect to the Docker daemon|docker daemon is not running|error during connect)/i,
    recommendation: () => 'Start Docker Desktop or the Docker daemon, then retry the Docker probe.'
  },
  {
    type: 'permission_denied',
    severity: 'fail',
    title: 'Permission denied',
    pattern: /(?:EACCES|EPERM|Permission denied|Access is denied|operation not permitted)/i,
    recommendation: () => 'Fix file permissions, avoid protected directories, or rerun with the documented user/account.'
  },
  {
    type: 'package_lock_mismatch',
    severity: 'fail',
    title: 'Lockfile and manifest are out of sync',
    pattern: /(?:npm ci can only install|package-lock\.json.*out of sync|frozen-lockfile|lockfile.*not up to date|Your lockfile needs to be updated)/i,
    recommendation: () => 'Regenerate or update the lockfile with the project package manager, then commit the result.'
  },
  {
    type: 'command_not_found',
    severity: 'fail',
    title: 'Command not found',
    pattern: /(?:is not recognized as an internal or external command|command not found|not found:|ENOENT)/i,
    recommendation: () => 'Install the missing command-line tool or make sure it is available on PATH.'
  },
  {
    type: 'configuration_parse_error',
    severity: 'fail',
    title: 'Configuration parse error',
    pattern: /(?:YAMLException|TOML parse error|JSON.parse|Unexpected token .* in JSON|mapping values are not allowed|did not find expected key|invalid configuration)/i,
    recommendation: () => 'Fix the malformed configuration file reported by the command output.'
  },
  {
    type: 'syntax_or_compile_error',
    severity: 'fail',
    title: 'Syntax or compile error',
    pattern: /(?:SyntaxError|TSError|TypeError \[ERR|Compilation failed|failed to compile|tsc.*error TS\d+)/i,
    recommendation: () => 'Fix the reported source or type error before using this command as a startup path.'
  }
];

const READY_PATTERN = /(?:ready|started|listening|compiled successfully|local:\s*https?:\/\/|server running|vite .*ready)/i;

function firstNonEmpty(...values) {
  return values.find((value) => String(value ?? '').trim().length > 0) ?? '';
}

function classifyNodeProbe(result, combined) {
  if (!['node', 'prisma', 'monorepo'].includes(result.adapter)) return null;

  const missingNpx = combined.match(/npx\s+(?:error\s+)?canceled due to missing packages and no YES option:\s*\["([^"]+)"\]/i);
  if (missingNpx) {
    return {
      type: 'node_dependencies_missing',
      severity: 'fail',
      title: 'Node dependencies are not installed',
      evidence: firstNonEmpty(missingNpx[0]).slice(0, 240),
      subject: missingNpx[1],
      recommendation: `Install project dependencies so ${missingNpx[1]} is available locally, then retry the probe.`
    };
  }

  const missingScriptBinary = combined.match(/['"]?([A-Za-z][\w.-]+)['"]?\s+is not recognized as an internal or external command/i)
    ?? combined.match(/sh:\s*(?:\d+:\s*)?([A-Za-z][\w.-]+):\s*(?:not found|command not found)/i)
    ?? combined.match(/^([A-Za-z][\w.-]+):\s*command not found/im);
  const packageScript = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?[\w:-]+/.test(result.display ?? '')
    || /^>\s+[^\n]+\n>\s+[A-Za-z][\w.-]+/m.test(combined);
  if (missingScriptBinary && packageScript) {
    return {
      type: 'node_dependencies_missing',
      severity: 'fail',
      title: 'Node dependencies are not installed',
      evidence: firstNonEmpty(missingScriptBinary[0]).slice(0, 240),
      subject: missingScriptBinary[1],
      recommendation: `Run the package manager install command for this package so the local ${missingScriptBinary[1]} binary exists, then retry ${result.display}.`
    };
  }

  return null;
}

export function classifyLog(output) {
  const text = String(output ?? '');
  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    return {
      type: rule.type,
      severity: rule.severity,
      title: rule.title,
      evidence: firstNonEmpty(match[0]).slice(0, 240),
      subject: match[1] ?? null,
      recommendation: rule.recommendation(match)
    };
  }
  return null;
}

export function classifyProbeResult(result) {
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const contextual = classifyNodeProbe(result, combined);
  if (contextual) return contextual;
  const classified = classifyLog(combined);
  if (classified) return classified;

  if (result.status === 'timeout') {
    const appearsReady = READY_PATTERN.test(combined);
    return {
      type: appearsReady ? 'startup_appears_ready' : 'command_timeout',
      severity: appearsReady ? 'info' : 'warn',
      title: appearsReady ? 'Startup command kept running after becoming ready' : 'Probe timed out',
      evidence: appearsReady ? 'The command did not exit before the timeout, but its output looked like a running server.' : null,
      subject: result.display,
      recommendation: appearsReady
        ? 'Treat this as a likely startup success and stop the process when you are done testing.'
        : 'Increase the probe timeout or run the command manually to inspect long-running behavior.'
    };
  }

  if (result.status === 'fail') {
    return {
      type: 'unclassified_command_failure',
      severity: 'fail',
      title: 'Command failed',
      evidence: combined.trim().slice(0, 240) || `Exit code ${result.exitCode}`,
      subject: result.display,
      recommendation: 'Review the command output above and add a SetupLens adapter rule if this failure type should be recognized automatically.'
    };
  }

  return null;
}
