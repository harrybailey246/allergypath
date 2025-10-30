import { spawn } from "node:child_process";

const processes = [
  {
    name: "web",
    command: ["npm", ["run", "dev", "--workspace", "web"]],
  },
  {
    name: "api",
    command: ["npm", ["run", "start:dev", "--workspace", "api"]],
  },
];

const children = processes.map(({ name, command }) => {
  const [cmd, args] = command;
  const executable = process.platform === "win32" && !cmd.endsWith(".cmd") ? `${cmd}.cmd` : cmd;
  const child = spawn(executable, args, { stdio: "pipe", env: process.env });

  const prefix = `[${name}]`;

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`${prefix} ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`${prefix} ${chunk}`);
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`${prefix} exited with code ${code}`);
      shutdown(code ?? 1);
    } else {
      shutdown(0);
    }
  });

  return child;
});

function shutdown(code) {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exitCode = code;
}

process.on("SIGINT", () => {
  shutdown(0);
});

process.on("SIGTERM", () => {
  shutdown(0);
});
