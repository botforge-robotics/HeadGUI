const path = require('path');
const fs = require('fs');

/**
 * After pack hook: on Linux, wrap the main executable in a script that always
 * passes --no-sandbox to Electron. This fixes the SUID sandbox error when
 * running the AppImage directly (./AppImage) because executableArgs only
 * affect the .desktop file, not the AppRun invocation.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;

  const { appOutDir, packager } = context;
  const execName = packager.executableName;
  const execPath = path.join(appOutDir, execName);
  const execPathBin = path.join(appOutDir, execName + '.bin');

  if (!fs.existsSync(execPath)) return;

  fs.renameSync(execPath, execPathBin);

  const wrapperScript = `#!/bin/sh
exec "\$(dirname "\$0")/${execName}.bin" --no-sandbox "\$@"
`;

  fs.writeFileSync(execPath, wrapperScript, { mode: 0o755 });
}
