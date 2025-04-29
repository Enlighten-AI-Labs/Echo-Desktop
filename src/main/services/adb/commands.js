/**
 * ADB Commands module - handles executing commands on devices
 */
const { execAdbCommand } = require('./deviceManager');

/**
 * Get installed apps on a specific device
 * @param {string} deviceId - The device identifier
 * @returns {Promise<Array>} List of installed apps
 */
async function getInstalledApps(deviceId) {
  try {
    console.log(`Getting installed apps for device: ${deviceId}`);
    
    // First ensure the ADB server is running
    await execAdbCommand('start-server');
    
    // Get package list using the pm list packages command
    const output = await execAdbCommand(`-s ${deviceId} shell pm list packages -3`);
    
    // Process the output to get a list of package names
    // The output format is "package:com.example.app"
    const packageNames = output
      .split('\n')
      .filter(line => line.trim().startsWith('package:'))
      .map(line => line.trim().substring(8));
    
    // Get app names for each package
    const apps = [];
    for (const packageName of packageNames) {
      apps.push({
        packageName,
        appName: packageName // Fallback to package name
      });
    }
    
    console.log(`Found ${apps.length} installed apps`);
    return apps;
  } catch (error) {
    console.error('Error getting installed apps:', error);
    throw error;
  }
}

/**
 * Launch an app on a specific device
 * @param {string} deviceId - The device identifier
 * @param {string} packageName - The app package name to launch
 * @returns {Promise<Object>} Success status
 */
async function launchApp(deviceId, packageName) {
  try {
    console.log(`Launching app ${packageName} on device ${deviceId}`);
    
    // First ensure the ADB server is running
    await execAdbCommand('start-server');
    
    // Get the main activity of the package
    const activityCmd = `-s ${deviceId} shell dumpsys package ${packageName} | grep -A 1 "android.intent.action.MAIN" | grep -v "android.intent.action.MAIN" | grep -v "^--$" | head -1`;
    const activityOutput = await execAdbCommand(activityCmd);
    
    let launchCommand;
    if (activityOutput && activityOutput.includes('/')) {
      // Extract the activity name
      const activityMatch = activityOutput.match(/([a-zA-Z0-9\.]+\/[a-zA-Z0-9\.]+)/);
      if (activityMatch && activityMatch[1]) {
        const activity = activityMatch[1].trim();
        launchCommand = `-s ${deviceId} shell am start -n ${activity}`;
      } else {
        // Fallback to monkey command if we can't extract the activity
        launchCommand = `-s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
      }
    } else {
      // Fallback to monkey command
      launchCommand = `-s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
    }
    
    // Launch the app
    const output = await execAdbCommand(launchCommand);
    console.log('Launch app output:', output);
    
    return { success: true, message: `App ${packageName} launched successfully` };
  } catch (error) {
    console.error(`Error launching app ${packageName}:`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Execute an arbitrary ADB command for a specific device
 * @param {string} deviceId - The device identifier
 * @param {string} command - The command to execute
 * @returns {Promise<Object>} Command output
 */
async function executeCommand(deviceId, command) {
  try {
    // Make sure ADB server is running
    await execAdbCommand('start-server');
    
    // If command doesn't include a specific device, add the device ID
    let fullCommand = command;
    if (deviceId && !command.includes('-s') && command.startsWith('shell')) {
      fullCommand = `-s ${deviceId} ${command}`;
    }
    
    console.log(`Executing custom ADB command: ${fullCommand}`);
    const output = await execAdbCommand(fullCommand);
    
    return {
      success: true,
      output: output
    };
  } catch (error) {
    console.error('Error executing ADB command:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  execAdbCommand,
  executeCommand,
  launchApp,
  getInstalledApps
}; 