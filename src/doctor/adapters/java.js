import path from 'node:path';
import { readText } from '../../lib/files.js';
import { createProbe } from '../probes.js';

function gradleCommand(index) {
  const wrapper = index.byRelative.get(process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  if (wrapper) return process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  return 'gradle';
}

async function hasSpringBoot(files) {
  for (const file of files) {
    const text = await readText(file);
    if (text && /spring-boot|org\.springframework\.boot/i.test(text)) return true;
  }
  return false;
}

async function springConfig(index) {
  const files = index.files.filter((file) => /src\/main\/resources\/application(?:-[A-Za-z0-9_.-]+)?\.(?:properties|ya?ml)$/.test(file.relative));
  const profiles = [];
  for (const file of files) {
    const match = file.name.match(/^application-([A-Za-z0-9_.-]+)\./);
    if (match) profiles.push(match[1]);
  }
  return { files: files.map((file) => file.relative), profiles: [...new Set(profiles)].sort() };
}

export async function javaAdapter({ index, detection }) {
  const pomFiles = index.files.filter((file) => file.name === 'pom.xml');
  const gradleFiles = index.files.filter((file) => ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'].includes(file.name));
  if (!detection.stacks.includes('java') && pomFiles.length === 0 && gradleFiles.length === 0) return null;

  const springBoot = await hasSpringBoot([...pomFiles, ...gradleFiles]);
  const spring = await springConfig(index);
  const buildTool = pomFiles.length > 0 ? 'maven' : 'gradle';
  const rootPom = pomFiles.find((file) => path.posix.dirname(file.relative) === '.') ?? pomFiles[0];
  const rootGradle = gradleFiles.find((file) => path.posix.dirname(file.relative) === '.') ?? gradleFiles[0];
  const cwd = rootPom
    ? (path.posix.dirname(rootPom.relative) === '.' ? '.' : path.posix.dirname(rootPom.relative))
    : rootGradle
      ? (path.posix.dirname(rootGradle.relative) === '.' ? '.' : path.posix.dirname(rootGradle.relative))
      : '.';
  const gradle = gradleCommand(index);
  const actions = [];

  if (buildTool === 'maven') {
    actions.push({
      type: 'install',
      command: 'mvn -DskipTests dependency:go-offline',
      cwd,
      reason: `${rootPom.relative} declares a Maven project.`,
      confidence: 'medium'
    });
    actions.push({
      type: 'run',
      command: springBoot ? 'mvn spring-boot:run' : 'mvn test',
      cwd,
      reason: springBoot ? 'Spring Boot evidence was detected.' : 'No framework run task was detected; Maven test is the safest verification path.',
      confidence: springBoot ? 'high' : 'medium'
    });
  } else {
    actions.push({
      type: 'install',
      command: `${gradle} dependencies`,
      cwd,
      reason: `${rootGradle?.relative ?? 'Gradle files'} declares a Gradle project.`,
      confidence: 'medium'
    });
    actions.push({
      type: 'run',
      command: springBoot ? `${gradle} bootRun` : `${gradle} test`,
      cwd,
      reason: springBoot ? 'Spring Boot Gradle evidence was detected.' : 'No framework run task was detected; Gradle test is the safest verification path.',
      confidence: springBoot ? 'high' : 'medium'
    });
  }

  const probes = [
    createProbe({
      id: 'java.runtime.version',
      adapter: 'java',
      label: 'Java runtime',
      command: 'java',
      args: ['-version'],
      purpose: 'Verify that Java is available before running build tool commands.',
      confidence: 'high'
    })
  ];
  probes.push(buildTool === 'maven'
    ? createProbe({
      id: 'java.maven.version',
      adapter: 'java',
      label: 'Maven',
      command: 'mvn',
      args: ['--version'],
      cwd,
      purpose: 'Verify that Maven is available for this project.',
      confidence: 'high'
    })
    : createProbe({
      id: 'java.gradle.version',
      adapter: 'java',
      label: 'Gradle',
      command: gradle,
      args: ['--version'],
      cwd,
      purpose: 'Verify that Gradle or the Gradle wrapper is available for this project.',
      confidence: 'high'
    }));
  probes.push(buildTool === 'maven'
    ? createProbe({
      id: 'java.maven.compile',
      adapter: 'java',
      label: 'Maven compile',
      command: 'mvn',
      args: ['-DskipTests', 'compile'],
      cwd,
      purpose: 'Compile Java sources without running tests or starting the service.',
      kind: 'verify',
      confidence: 'medium'
    })
    : createProbe({
      id: 'java.gradle.classes',
      adapter: 'java',
      label: 'Gradle classes',
      command: gradle,
      args: ['classes'],
      cwd,
      purpose: 'Compile Java sources without starting the service.',
      kind: 'verify',
      confidence: 'medium'
    }));

  const issues = [];
  if (springBoot && spring.files.length === 0) {
    issues.push({
      type: 'spring_missing_application_config',
      severity: 'warn',
      title: 'Spring Boot application config was not found',
      evidence: 'Spring Boot evidence was detected, but no application.properties/yml file was indexed.',
      recommendation: 'Verify whether configuration is supplied through environment variables, config server, or an omitted application.yml/properties file.'
    });
  }

  return {
    id: 'java',
    title: 'Java project adapter',
    confidence: springBoot ? 'high' : 'medium',
    signals: {
      buildTool,
      frameworks: springBoot ? ['Spring Boot'] : [],
      spring,
      pomFiles: pomFiles.map((file) => file.relative),
      gradleFiles: gradleFiles.map((file) => file.relative)
    },
    actions,
    probes,
    issues
  };
}
