// Runs auto-download rules every 30 minutes while the browser is open. Must
// stay DOM-free: it's a service worker in Chrome and an event page in Firefox.
import { runAutoRules } from "../lib/auto";
import { ext } from "../lib/browser";

const ALARM = "auto-download";

const run = () =>
  runAutoRules().then(({ error }) => {
    if (error) console.warn("Auto-download:", error);
  });

// Listeners are registered synchronously so the event that woke us arrives.
ext.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) return run();
});
ext.runtime.onStartup.addListener(() => void run());

// Alarms don't survive a Firefox restart, so recreate it on every wake.
ext.alarms
  .get(ALARM)
  .then((a) => a ?? ext.alarms.create(ALARM, { periodInMinutes: 30 }));
