export default {
  name: 'team-policy',
  async run(context) {
    const hasOwnership = context.files.includes('CODEOWNERS') || context.files.includes('.github/CODEOWNERS');
    return [{
      id: 'codeowners',
      category: 'Team policy',
      status: hasOwnership ? 'pass' : 'warn',
      title: 'Code ownership',
      message: hasOwnership ? 'A CODEOWNERS file is present.' : 'No CODEOWNERS file was found.',
      recommendation: hasOwnership ? null : 'Add CODEOWNERS for review routing.',
      weight: hasOwnership ? 0 : 3
    }];
  }
};
