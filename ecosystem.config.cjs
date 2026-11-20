// PM2: two app processes on one server. Run after `npm run build` and copying static files (see DEPLOY.md).
module.exports = {
  apps: [
    {
      name: "chokprathan",
      cwd: ".next/standalone",
      script: "server.js",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "1G",
      env: { NODE_ENV: "production", PORT: "3000", HOSTNAME: "127.0.0.1", TRUST_PROXY: "1" },
      // Variables from .env.production.local are loaded by Next.js at start.
    },
  ],
};
