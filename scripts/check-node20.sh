#!/usr/bin/env bash
set -euo pipefail

# 1. Check whether staged changes affect runtime compatibility
# If git is available and we are inside a work tree, check if staged changes are documentation-only.
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
  if [ -n "$STAGED_FILES" ]; then
    AFFECTS_COMPAT=false
    while IFS= read -r file; do
      if [ -z "$file" ]; then continue; fi
      case "$file" in
        src/*|tests/*|scripts/*|.husky/*|package.json|package-lock.json|tsconfig*.json|vitest.config.*|eslint.config.*)
          AFFECTS_COMPAT=true
          break
          ;;
      esac
    done <<< "$STAGED_FILES"

    if [ "$AFFECTS_COMPAT" = false ]; then
      echo "Skipping full Node 20 compatibility check: staged changes are documentation-only."
      exit 0
    fi
  fi
fi

# 2. Determine runtime (Node 20 vs Docker node:20-bookworm-slim)
NODE_VER=""
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v 2>/dev/null || true)
fi

if [[ "$NODE_VER" =~ ^v?20\. ]]; then
  echo "Found Node.js 20 runtime: $NODE_VER"
  echo "Node version: $(node -v), npm version: $(npm -v)"
elif [ "${IN_NODE20_CONTAINER:-0}" = "1" ]; then
  echo "Error: Running inside container but node version ($NODE_VER) is not Node 20." >&2
  exit 1
else
  # Check if Docker is available
  DOCKER_CMD=""
  if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then
      DOCKER_CMD="docker"
    elif docker --context default info >/dev/null 2>&1; then
      DOCKER_CMD="docker --context default"
    fi
  fi

  if [ -n "$DOCKER_CMD" ]; then
    echo "Current Node runtime ($NODE_VER) is not Node 20. Running check in isolated node:20-bookworm-slim container via Docker..."
    REPO_DIR=$(pwd)
    exec $DOCKER_CMD run --rm \
      -v "$REPO_DIR:/workspace:ro" \
      -w /workspace \
      -e IN_NODE20_CONTAINER=1 \
      node:20-bookworm-slim bash scripts/check-node20.sh
  else
    echo "Error: Neither a Node 20 runtime (current: ${NODE_VER:-none}) nor a working Docker engine is available to run the Node 20 compatibility check." >&2
    exit 1
  fi
fi

# 3. Perform check in a clean temporary copy of the repository
echo "Creating clean temporary copy of the repository..."
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

REPO_COPY="$TMP_DIR/repo"
mkdir -p "$REPO_COPY"

if command -v tar >/dev/null 2>&1; then
  tar --exclude=".git" \
      --exclude=".env" \
      --exclude=".circleci/info.yml" \
      --exclude="node_modules" \
      --exclude="dist" \
      --exclude="coverage" \
      --exclude="*.log" \
      --exclude="*.tgz" \
      -cf - . | (cd "$REPO_COPY" && tar -xf -)
else
  cp -R . "$REPO_COPY"
  rm -rf "$REPO_COPY/.git" "$REPO_COPY/.env" "$REPO_COPY/.circleci/info.yml" "$REPO_COPY/node_modules" "$REPO_COPY/dist" "$REPO_COPY/coverage" "$REPO_COPY"/*.log "$REPO_COPY"/*.tgz
fi

cd "$REPO_COPY"

export HUSKY=0
export npm_config_engine_strict=true

# 4. In the clean Node 20 environment, run build, checks, and pack
echo "Running clean npm ci (--engine-strict)..."
npm ci --engine-strict --no-audit --no-fund

echo "Running typecheck..."
npm run typecheck

echo "Running unit tests..."
npm test

echo "Building package..."
npm run build

echo "Packing package tarball..."
PACK_JSON=$(npm pack --json --quiet)
TARBALL_NAME=$(node -e '
  const input = process.argv[1];
  const idx = input.indexOf("[");
  if (idx === -1) throw new Error("No JSON array found in npm pack output: " + input);
  const data = JSON.parse(input.slice(idx));
  console.log(data[0].filename);
' "$PACK_JSON")
TARBALL_PATH="$REPO_COPY/$TARBALL_NAME"

if [ ! -f "$TARBALL_PATH" ]; then
  echo "Error: Packed tarball $TARBALL_PATH not found after npm pack." >&2
  exit 1
fi
echo "Successfully packed: $TARBALL_NAME"

# 5. Test the packed package as a consumer
echo "Testing packed package in a clean consumer project under Node 20..."
CONSUMER_DIR="$TMP_DIR/consumer"
mkdir -p "$CONSUMER_DIR"
cd "$CONSUMER_DIR"

cat << 'EOF' > package.json
{
  "name": "consumer-smoke-test",
  "version": "1.0.0",
  "type": "module",
  "private": true
}
EOF

echo "Installing packed tarball in consumer project (--engine-strict)..."
npm install --engine-strict --omit=dev --no-audit --no-fund "$TARBALL_PATH"

echo "Verifying public package entry point exports..."
node --input-type=module --eval '
import { USCCB, createNodeHttpClient, parseIsoDate } from "catholic-mass-readings";
if (typeof USCCB !== "function") throw new Error("USCCB not exported from package");
if (typeof createNodeHttpClient !== "function") throw new Error("createNodeHttpClient not exported from package");
if (typeof parseIsoDate !== "function") throw new Error("parseIsoDate not exported from package");
console.log("Verified exports: USCCB, createNodeHttpClient, parseIsoDate");
'

echo "Typechecking consumer imports against package declarations..."
cat << 'EOF' > tsconfig.json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "noEmit": true
  },
  "files": ["check.ts"]
}
EOF

cat << 'EOF' > check.ts
import { USCCB, createNodeHttpClient, parseIsoDate } from "catholic-mass-readings";
import type { Mass, Reading, Verse } from "catholic-mass-readings";
const _m: Partial<Mass> = {};
const _r: Partial<Reading> = {};
const _v: Partial<Verse> = {};
const _u: typeof USCCB = USCCB;
const _c: typeof createNodeHttpClient = createNodeHttpClient;
const _p: typeof parseIsoDate = parseIsoDate;
EOF

"$REPO_COPY/node_modules/.bin/tsc"
echo "Consumer TypeScript typecheck passed successfully."

echo "Verifying installed CLI binary execution..."
npx --no-install catholic-mass-readings --help >/dev/null
echo "CLI binary executed successfully."

echo "Running deterministic offline parser test using embedded HTML..."
node --input-type=module --eval '
import { USCCB, MassType, parseIsoDate } from "catholic-mass-readings";
const embeddedHtml = `<!DOCTYPE html>
<html>
<head><title>Daily Mass Readings | USCCB</title></head>
<body>
  <div class="container">
    <div class="name">Reading I</div>
    <div class="address"><a href="https://bible.usccb.org/bible/genesis/1?1">Gen 1:1-2</a></div>
    <div class="content-body">
      <p>In the beginning, when God created the heavens and the earth,</p>
      <p>the earth was a formless wasteland, and darkness covered the abyss,</p>
    </div>
  </div>
  <div class="container">
    <div class="name">Gospel</div>
    <div class="address"><a href="https://bible.usccb.org/bible/john/1?1">Jn 1:1-3</a></div>
    <div class="content-body">
      <p>In the beginning was the Word, and the Word was with God, and the Word was God.</p>
    </div>
  </div>
</body>
</html>`;
const mockClient = {
  async get() { return { text: embeddedHtml, ok: true, status: 200, url: "https://bible.usccb.org/bible/readings/080625.cfm" }; },
  async head(url) { return { text: "", ok: true, status: 200, url }; }
};
const usccb = new USCCB(mockClient);
const mass = await usccb.getMass(parseIsoDate("2025-08-06"), MassType.DEFAULT);
if (!mass || mass.title !== "Daily Mass Readings" || mass.sections.length !== 2) {
  throw new Error("Offline parser test failed: unexpected structure returned");
}
console.log("Offline parser test verified successfully: " + mass.title);
'

echo "Node.js 20 compatibility check completed successfully!"
