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
