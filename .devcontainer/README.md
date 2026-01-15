# Ringmaster Development Container

A secure, isolated Docker development environment for the Ringmaster application.

## Features

- **Network Isolation**: Firewall restricts outbound traffic to approved domains only
- **Pre-configured Tools**: Node.js 20, Git, GitHub CLI, zsh with powerline theme
- **VS Code Integration**: Recommended extensions and settings for TypeScript/React/Next.js
- **Persistent History**: Bash/zsh history and Claude config persist across sessions

## Allowed Network Access

The firewall allows outbound connections to:
- **GitHub**: API, web, and git operations
- **npm Registry**: Package installation
- **Anthropic API**: Claude integration
- **AWS Bedrock**: AI model access (us-east-1, us-west-2)
- **VS Code Marketplace**: Extension installation

All other outbound traffic is blocked.

## Usage

### VS Code (Recommended)

1. Install the "Dev Containers" extension in VS Code
2. Open the Ringmaster project folder
3. Press `Cmd/Ctrl + Shift + P` → "Dev Containers: Reopen in Container"
4. Wait for the container to build and start
5. Run `npm run dev` to start the development server

### Manual Docker

```bash
# Build the container
docker build -t ringmaster-dev .devcontainer/

# Run with required capabilities
docker run -it \
  --cap-add=NET_ADMIN \
  --cap-add=NET_RAW \
  -v $(pwd):/workspace \
  -p 3000:3000 \
  ringmaster-dev
```

## Port Forwarding

The container automatically forwards port 3000 for the Next.js development server.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DEVCONTAINER` | Set to `true` for container detection |
| `NODE_OPTIONS` | `--max-old-space-size=4096` for larger builds |
| `NEXT_TELEMETRY_DISABLED` | Disables Next.js telemetry |

## Troubleshooting

### Firewall verification failed

If the container fails to start with firewall errors, ensure Docker has network capabilities:

```bash
docker run --cap-add=NET_ADMIN --cap-add=NET_RAW ...
```

### Cannot access external URLs

This is expected behavior. The firewall blocks most external traffic for security. Only whitelisted domains are accessible.

### npm install fails

Ensure the container has network access to `registry.npmjs.org`. The firewall should allow this by default.

## Security Notes

This container is designed for AI-assisted development where:
- Code can be written and modified by AI tools
- Network access is restricted to prevent data exfiltration
- Only trusted endpoints (GitHub, npm, Anthropic) are accessible

The security model trades convenience for isolation - if you need access to additional services, modify the `init-firewall.sh` script.
