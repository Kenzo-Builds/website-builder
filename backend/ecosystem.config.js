module.exports = {
  apps: [{
    name: 'website-builder',
    script: 'server.js',
    cwd: '/root/.openclaw/workspace/projects/website-builder/backend',
    env: {
      PORT: 3500,
      OPENROUTER_API_KEY: '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'
    }
  }]
}
