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
