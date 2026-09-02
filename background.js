const CLEANUP_ALARM = 'form_auto_saver_cleanup_job';
const RETENTION_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;

async function runExpiredDraftsCleanup() {
  try {
    const records = await chrome.storage.local.get(null);
    const currentTime = Date.now();
    const batchUpdates = {};
    const batchDeletions = [];

    for (const [key, value] of Object.entries(records)) {
      if (!key.startsWith('drafts_') || typeof value !== 'object' || value === null) {
        continue;
      }

      let mutated = false;
      const filteredGroup = { ...value };

      for (const [fieldId, draft] of Object.entries(value)) {
        if (!draft || typeof draft !== 'object') continue;

        const updatedTime = Number(draft.updatedAt) || 0;
        if (currentTime - updatedTime > RETENTION_LIMIT_MS) {
          delete filteredGroup[fieldId];
          mutated = true;
        }
      }

      if (mutated) {
        if (Object.keys(filteredGroup).length === 0) {
          batchDeletions.push(key);
        } else {
          batchUpdates[key] = filteredGroup;
        }
      }
    }

    if (batchDeletions.length > 0) {
      await chrome.storage.local.remove(batchDeletions);
    }

    if (Object.keys(batchUpdates).length > 0) {
      await chrome.storage.local.set(batchUpdates);
    }
  } catch {
    // cleanup exceptions handled quietly
  }
}

function registerCleanupAlarm() {
  chrome.alarms.get(CLEANUP_ALARM, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(CLEANUP_ALARM, {
        periodInMinutes: 1440
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  registerCleanupAlarm();
  runExpiredDraftsCleanup();
});

chrome.runtime.onStartup.addListener(() => {
  registerCleanupAlarm();
  runExpiredDraftsCleanup();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CLEANUP_ALARM) {
    runExpiredDraftsCleanup();
  }
});
