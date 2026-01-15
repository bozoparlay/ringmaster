# Docker Development Guide

This guide explains how to use Docker containers for Ringmaster development, following Anthropic's recommended practices for Claude Code. Using containers provides security isolation, consistent environments, and safer AI-assisted development.

## Why Docker?

Anthropic recommends using development containers (devcontainers) when working with Claude Code for several important reasons:

### Security Isolation

When Claude Code runs with elevated permissions (like `--dangerously-skip-permissions`), it can execute arbitrary commands. A container provides:

- **Network isolation** - Default-deny firewall rules prevent unauthorized outbound connections
- **Filesystem isolation** - Container can only access mounted volumes, not your entire system
- **Process isolation** - Commands run inside the container, not on your host machine

### Consistent Environments

- **Same Node.js version** - Everyone uses Node.js 20, avoiding "works on my machine" issues
- **Same dependencies** - All dev tools are pre-installed in the container
- **Reproducible builds** - CI/CD can use the same container configuration

### Safer AI Development

As stated in [Anthropic's documentation](https://code.claude.com/docs/en/devcontainer):

> While the devcontainer provides substantial protections, it's not completely immune to all attacks. When using `--dangerously-skip-permissions`, there's a risk of credential or data exfiltration.

The container mitigates this by limiting what Claude Code can access and where it can connect.

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- VS Code with [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- Or: Any editor + Docker CLI

### Option A: VS Code Dev Container (Recommended)

1. **Install the extension**
   ```
   code --install-extension ms-vscode-remote.remote-containers
   ```

2. **Open Ringmaster in VS Code**
   ```bash
   code /path/to/ringmaster
   ```

3. **Reopen in Container**
   - Press `Cmd/Ctrl + Shift + P`
   - Type "Reopen in Container"
   - Select the option and wait for build

4. **Start developing**
   - Terminal opens inside container
   - Run `npm install && npm run dev`
   - Access at http://localhost:3000

### Option B: Docker CLI

```bash
# Build the dev container
docker build -t ringmaster-dev .devcontainer/

# Run with mounted source code
docker run -it --rm \
  -v $(pwd):/workspace \
  -p 3000:3000 \
  -p 3001:3001 \
  ringmaster-dev

# Inside container
cd /workspace
npm install
npm run dev
```

## Configuration

### Directory Structure

```
.devcontainer/
├── devcontainer.json    # VS Code container config
├── Dockerfile           # Container image definition
└── init-firewall.sh     # Network security rules
```

### devcontainer.json

```jsonc
{
  "name": "Ringmaster Dev",
  "build": {
    "dockerfile": "Dockerfile"
  },
  "forwardPorts": [3000, 3001],
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss"
      ]
    }
  },
  "postCreateCommand": "npm install",
  "remoteUser": "node"
}
```

### Dockerfile

```dockerfile
FROM node:20-slim

# Install development dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    iptables \
    && rm -rf /var/lib/apt/lists/*

# Setup firewall (optional, for extra security)
COPY init-firewall.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-firewall.sh

WORKDIR /workspace

# Run as non-root user
USER node
```

### Network Security (init-firewall.sh)

The firewall script implements a default-deny policy with specific allowlisted destinations:

```bash
#!/bin/bash

# Default deny outbound
iptables -P OUTPUT DROP

# Allow essential connections
iptables -A OUTPUT -p tcp --dport 443 -d registry.npmjs.org -j ACCEPT  # npm
iptables -A OUTPUT -p tcp --dport 443 -d github.com -j ACCEPT          # GitHub
iptables -A OUTPUT -p tcp --dport 443 -d api.anthropic.com -j ACCEPT   # Claude API
iptables -A OUTPUT -p tcp --dport 443 -d api.us-east-1.amazonaws.com -j ACCEPT  # Bedrock
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT                         # DNS
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT                         # SSH/Git

# Allow localhost
iptables -A OUTPUT -o lo -j ACCEPT
```

## Port Mapping

When running in Docker, map the same ports used for local development:

| Port | Purpose | Notes |
|------|---------|-------|
| 3000 | Main dev server | Primary development |
| 3001 | Task worktree server | For parallel testing |

```bash
# Map both ports
docker run -p 3000:3000 -p 3001:3001 ...
```

## Environment Variables

Pass environment variables into the container:

```bash
# Using docker run
docker run -e GITHUB_TOKEN=ghp_xxx -e AWS_ACCESS_KEY_ID=xxx ...

# Or use an env file
docker run --env-file .env.local ...
```

**Important**: Never bake secrets into the Docker image. Always pass them at runtime.

### AWS Credentials for Bedrock

For AI task analysis, you need AWS credentials:

```bash
# Option 1: Pass explicitly
docker run \
  -e AWS_ACCESS_KEY_ID=xxx \
  -e AWS_SECRET_ACCESS_KEY=xxx \
  -e AWS_REGION=us-east-1 \
  ...

# Option 2: Mount credentials file
docker run \
  -v ~/.aws:/home/node/.aws:ro \
  ...
```

## Volume Mounts

### Development Mount

Mount the entire project for live editing:

```bash
docker run -v $(pwd):/workspace ...
```

Changes you make on the host are immediately reflected in the container.

### Persistent node_modules

For faster rebuilds, use a named volume for node_modules:

```bash
docker run \
  -v $(pwd):/workspace \
  -v ringmaster_node_modules:/workspace/node_modules \
  ...
```

### Git Configuration

Mount your git config for commits from inside the container:

```bash
docker run \
  -v ~/.gitconfig:/home/node/.gitconfig:ro \
  -v ~/.ssh:/home/node/.ssh:ro \
  ...
```

## Claude Code in Docker

### Running Claude Code Inside Container

```bash
# Enter the container
docker exec -it ringmaster-dev bash

# Run Claude Code
claude

# Or with specific flags
claude --dangerously-skip-permissions
```

### Security Considerations

Even inside a container, be mindful:

1. **Mounted volumes are accessible** - Claude can read/write anything you mount
2. **Network allowlist is your defense** - Only whitelisted hosts can be contacted
3. **Credentials can leak** - If you mount `~/.aws` or pass `GITHUB_TOKEN`, Claude can use them

### Best Practices

| Do | Don't |
|----|-------|
| Use read-only mounts for credentials (`:ro`) | Mount entire home directory |
| Restrict network to needed hosts only | Allow all outbound traffic |
| Review firewall rules for your use case | Use default Docker networking |
| Keep container images updated | Use outdated base images |

## Troubleshooting

### Container won't start

```bash
# Check Docker is running
docker info

# Check for port conflicts
lsof -i :3000
```

### npm install fails

```bash
# Clear npm cache inside container
npm cache clean --force

# If using volume for node_modules, try removing it
docker volume rm ringmaster_node_modules
```

### Can't connect to external services

If the firewall is blocking needed connections:

```bash
# Check current rules
iptables -L OUTPUT -n

# Temporarily allow all (for debugging only!)
iptables -P OUTPUT ACCEPT
```

### Git operations fail

Ensure git config is mounted:

```bash
docker run \
  -v ~/.gitconfig:/home/node/.gitconfig:ro \
  -v ~/.ssh:/home/node/.ssh:ro \
  ...
```

### Hot reload not working

On macOS/Windows, file watching can be slow. Try:

```jsonc
// next.config.js
module.exports = {
  webpack: (config) => {
    config.watchOptions = {
      poll: 1000,
      aggregateTimeout: 300,
    };
    return config;
  },
};
```

## CI/CD Usage

Use the same container in CI for consistent builds:

```yaml
# .github/workflows/ci.yml
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:20-slim
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - run: npm test
```

## Reference

- [Anthropic Dev Container Documentation](https://code.claude.com/docs/en/devcontainer)
- [VS Code Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

## Summary

| Benefit | How Docker Helps |
|---------|------------------|
| **Security** | Network isolation, filesystem sandboxing |
| **Consistency** | Same environment for all developers |
| **Safety with AI** | Limits what Claude Code can access |
| **Reproducibility** | CI/CD uses identical environment |

Docker containers are recommended by Anthropic for safer AI-assisted development. While not foolproof, they significantly reduce the attack surface when using Claude Code with elevated permissions.
