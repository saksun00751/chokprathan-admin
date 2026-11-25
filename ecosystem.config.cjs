// PM2: two admin processes on one server. Run after `npm run build` and copying static files (see README "Deploy").
// Port 5001 so the member app (PM2 name "chokprathan", port 3000) can run on the same host.
// Both processes run the scheduler timer; the MariaDB named lock `chokprathan-admin:scheduler` lets one work at a time.
module.exports = {
  apps: [
    {
      name: "chokprathan-admin",
      cwd: ".next/standalone",
      script: "server.js",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "1G",
      env: { NODE_ENV: "production", PORT: "5001", HOSTNAME: "127.0.0.1", TRUST_PROXY: "1" },
      // Variables from .env.production.local (copied into .next/standalone) are loaded by Next.js at start.
    },
  ],
};
