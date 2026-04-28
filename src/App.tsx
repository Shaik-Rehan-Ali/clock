import { ChangeEvent, useEffect, useRef, useState } from 'react';
import tzlookup from 'tz-lookup';
import { playRingtone, ringtoneList } from './ringtones';

type TabKey = 'clock' | 'alarms' | 'timer' | 'stopwatch' | 'sleep' | 'world' | 'settings' | 'developer';
type DeviceKind = 'phone' | 'computer';
type LocationSource = 'automatic' | 'manual';
type RingtoneChoice =
  | 'pulse'
  | 'chime'
  | 'beacon'
  | 'rooster'
  | 'beat-plucker'
  | 'morning-glory'
  | 'apex'
  | 'digital-phone'
  | 'classic-clock'
  | 'alarm-2010'
  | 'custom';

type SavedLocation = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  timeZone: string;
};

type Alarm = {
  id: string;
  time: string;
  label: string;
  repeatDays: number[];
  enabled: boolean;
  lastTriggered: string | null;
};

type TaggedTimer = {
  id: string;
  label: string;
  durationMinutes: number;
  remainingMs: number;
  active: boolean;
  endsAt: number | null;
};

type StopwatchLap = {
  id: string;
  label: string;
  elapsedMs: number;
};

type SleepTimerState = {
  active: boolean;
  durationMinutes: number;
  startedAt: number | null;
  endsAt: number | null;
};

type ClockParts = {
  hour: number;
  minute: number;
  second: number;
  dayName: string;
  dateLabel: string;
  zoneName: string;
};

const tabs: Array<{ key: TabKey; label: string; hint: string }> = [
  { key: 'clock', label: 'Clock', hint: 'Live time' },
  { key: 'alarms', label: 'Alarm', hint: 'Wake-ups' },
  { key: 'timer', label: 'Timer', hint: 'Tagged timers' },
  { key: 'stopwatch', label: 'Stopwatch', hint: 'Track time' },
  { key: 'sleep', label: 'Sleep', hint: '24h timer' },
  { key: 'world', label: 'World', hint: 'Cities' },
  { key: 'settings', label: 'Settings', hint: 'Device & sound' },
  { key: 'developer', label: 'Developer', hint: 'Creator' },
];

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const storageKeys = {
  alarms: 'pulse-clock-alarms',
  timers: 'pulse-clock-tagged-timers',
  worlds: 'pulse-clock-worlds',
  settings: 'pulse-clock-settings',
};

const pad = (value: number) => String(value).padStart(2, '0');

function isAppInstalled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  // Check for PWA standalone mode
  const isStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  const isInFullscreen = window.matchMedia('(display-mode: standalone)').matches;
  return isStandalone || isInFullscreen;
}

async function openIndexedDB(): Promise<IDBDatabase | null> {
  try {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const request = indexedDB.open('pulse-clock-db', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('ringtones')) {
          db.createObjectStore('ringtones', { keyPath: 'id' });
        }
      };
    });
  } catch {
    return null;
  }
}

async function saveCustomRingtoneToIDB(id: string, blob: Blob): Promise<boolean> {
  try {
    const db = await openIndexedDB();
    if (!db) return false;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['ringtones'], 'readwrite');
      const store = transaction.objectStore('ringtones');
      const request = store.put({ id, blob, timestamp: Date.now() });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
    });
  } catch {
    return false;
  }
}

async function loadCustomRingtoneFromIDB(id: string): Promise<Blob | null> {
  try {
    const db = await openIndexedDB();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['ringtones'], 'readonly');
      const store = transaction.objectStore('ringtones');
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.blob ?? null);
    });
  } catch {
    return null;
  }
}

function getDeviceKind(): DeviceKind {
  if (typeof window === 'undefined') {
    return 'computer';
  }

  const smallScreen = window.matchMedia('(max-width: 760px)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

  return smallScreen || coarsePointer || mobileUA ? 'phone' : 'computer';
}

function formatParts(timeZone: string): ClockParts {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const hour = Number(byType.get('hour') ?? '0');
  const minute = Number(byType.get('minute') ?? '0');
  const second = Number(byType.get('second') ?? '0');
  const dayName = byType.get('weekday') ?? 'Now';
  const dateLabel = `${byType.get('month') ?? ''} ${byType.get('day') ?? ''}`.trim();
  const zoneName =
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    })
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')?.value ?? timeZone;

  return { hour, minute, second, dayName, dateLabel, zoneName };
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function getDateKeyInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';

  return `${year}-${month}-${day}`;
}

function clampMinutes(hours: number, minutes: number): number {
  const safeHours = Math.max(0, Math.min(24, Math.floor(hours)));
  const safeMinutes = safeHours === 24 ? 0 : Math.max(0, Math.min(59, Math.floor(minutes)));
  const combined = safeHours * 60 + safeMinutes;
  return Math.max(1, Math.min(1440, combined));
}

function splitMinutes(totalMinutes: number) {
  const safe = Math.max(1, Math.min(1440, Math.floor(totalMinutes)));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return { hours, minutes };
}

function playPresetTone(preset: Exclude<RingtoneChoice, 'custom'>) {
  stopCurrentAudio();
  void playRingtone(preset);
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('clock');
  const [deviceKind, setDeviceKind] = useState<DeviceKind>(getDeviceKind);
  const [locationSource, setLocationSource] = useState<LocationSource>('automatic');
  const [locationLabel, setLocationLabel] = useState('Detecting location...');
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationMessage, setLocationMessage] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [alarmTime, setAlarmTime] = useState('07:00');
  const [alarmLabel, setAlarmLabel] = useState('Morning alarm');
  const [alarmRepeatDays, setAlarmRepeatDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);

  const [timers, setTimers] = useState<TaggedTimer[]>([]);
  const [timerLabel, setTimerLabel] = useState('Study focus');
  const [timerHours, setTimerHours] = useState(0);
  const [timerMinutes, setTimerMinutes] = useState(30);
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);

  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [stopwatchStart, setStopwatchStart] = useState<number | null>(null);
  const [stopwatchElapsed, setStopwatchElapsed] = useState(0);
  const [stopwatchLaps, setStopwatchLaps] = useState<StopwatchLap[]>([]);

  const [sleepDurationMinutes, setSleepDurationMinutes] = useState(25);
  const [sleepHours, setSleepHours] = useState(0);
  const [sleepMinutesPart, setSleepMinutesPart] = useState(25);
  const [sleepTimer, setSleepTimer] = useState<SleepTimerState>({
    active: false,
    durationMinutes: 25,
    startedAt: null,
    endsAt: null,
  });

  const [ringtoneChoice, setRingtoneChoice] = useState<RingtoneChoice>('pulse');
  const [customRingtoneId, setCustomRingtoneId] = useState<string | null>(null);
  const [customRingtoneName, setCustomRingtoneName] = useState('');
  const [customRingtoneUrl, setCustomRingtoneUrl] = useState<string | null>(null);
  const [appMode, setAppMode] = useState('browser');

  const [worldClocks, setWorldClocks] = useState<SavedLocation[]>([]);
  const [worldQuery, setWorldQuery] = useState('');
  const [notifyGranted, setNotifyGranted] = useState(Notification.permission === 'granted');
  const sleepFireRef = useRef(false);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const updateDevice = () => setDeviceKind(getDeviceKind());
    const installed = isAppInstalled();
    setAppMode(installed ? 'installed' : 'browser');
    window.addEventListener('resize', updateDevice);
    window.addEventListener('orientationchange', updateDevice);
    return () => {
      window.removeEventListener('resize', updateDevice);
      window.removeEventListener('orientationchange', updateDevice);
    };
  }, []);

  useEffect(() => {
    const savedAlarms = window.localStorage.getItem(storageKeys.alarms);
    const savedTimers = window.localStorage.getItem(storageKeys.timers);
    const savedWorlds = window.localStorage.getItem(storageKeys.worlds);
    const savedSettings = window.localStorage.getItem(storageKeys.settings);

    if (savedAlarms) {
      try {
        setAlarms(JSON.parse(savedAlarms) as Alarm[]);
      } catch {
        window.localStorage.removeItem(storageKeys.alarms);
      }
    }

    if (savedTimers) {
      try {
        setTimers(JSON.parse(savedTimers) as TaggedTimer[]);
      } catch {
        window.localStorage.removeItem(storageKeys.timers);
      }
    }

    if (savedWorlds) {
      try {
        setWorldClocks(JSON.parse(savedWorlds) as SavedLocation[]);
      } catch {
        window.localStorage.removeItem(storageKeys.worlds);
      }
    }

    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings) as {
          locationLabel?: string;
          timeZone?: string;
          source?: LocationSource;
          latitude?: number;
          longitude?: number;
          ringtoneChoice?: RingtoneChoice;
          customRingtoneId?: string;
          customRingtoneName?: string;
        };
        if (parsed.locationLabel) {
          setLocationLabel(parsed.locationLabel);
        }
        if (parsed.timeZone) {
          setTimeZone(parsed.timeZone);
        }
        if (parsed.source) {
          setLocationSource(parsed.source);
        }
        if (typeof parsed.latitude === 'number') {
          setLatitude(parsed.latitude);
        }
        if (typeof parsed.longitude === 'number') {
          setLongitude(parsed.longitude);
        }
        if (parsed.ringtoneChoice) {
          setRingtoneChoice(parsed.ringtoneChoice);
        }
        if (parsed.customRingtoneId) {
          setCustomRingtoneId(parsed.customRingtoneId);
        }
        if (parsed.customRingtoneName) {
          setCustomRingtoneName(parsed.customRingtoneName);
        }
      } catch {
        window.localStorage.removeItem(storageKeys.settings);
      }
    }
  }, []);

  useEffect(() => {
    const snapshot = {
      locationLabel,
      timeZone,
      source: locationSource,
      latitude,
      longitude,
      ringtoneChoice,
      customRingtoneId,
      customRingtoneName,
    };
    window.localStorage.setItem(storageKeys.settings, JSON.stringify(snapshot));
  }, [locationLabel, timeZone, locationSource, latitude, longitude, ringtoneChoice, customRingtoneId, customRingtoneName]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.alarms, JSON.stringify(alarms));
  }, [alarms]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.timers, JSON.stringify(timers));
  }, [timers]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.worlds, JSON.stringify(worldClocks));
  }, [worldClocks]);

  useEffect(() => {
    const updateClock = () => setNowTick(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (stopwatchRunning && stopwatchStart !== null) {
      const timer = window.setInterval(() => {
        setStopwatchElapsed(Date.now() - stopwatchStart);
      }, 30);
      return () => window.clearInterval(timer);
    }
    return undefined;
  }, [stopwatchRunning, stopwatchStart]);

  useEffect(() => {
    if (sleepTimer.active && sleepTimer.endsAt !== null) {
      const timer = window.setInterval(() => {
        const remaining = Math.max(sleepTimer.endsAt! - Date.now(), 0);
        if (remaining === 0 && !sleepFireRef.current) {
          sleepFireRef.current = true;
          setSleepTimer((current) => ({ ...current, active: false, startedAt: null, endsAt: null }));
          setActiveTab('sleep');
          fireAlert('Sleep timer complete', 'Your sleep timer has finished.');
          playConfiguredRingtone();
        }
      }, 500);
      return () => window.clearInterval(timer);
    }
    sleepFireRef.current = false;
    return undefined;
  }, [sleepTimer.active, sleepTimer.endsAt, ringtoneChoice, customRingtoneId]);

  useEffect(() => {
    const currentParts = formatParts(timeZone);
    const currentDateKey = getDateKeyInTimeZone(timeZone);

    alarms.forEach((alarm) => {
      if (!alarm.enabled || alarm.lastTriggered === currentDateKey) {
        return;
      }

      const [hourText, minuteText] = alarm.time.split(':');
      if (Number(hourText) !== currentParts.hour || Number(minuteText) !== currentParts.minute || currentParts.second > 1) {
        return;
      }

      const today = new Date().toLocaleString('en-US', { timeZone, weekday: 'short' });
      const weekdayIndex = weekdayLabels.indexOf(today);
      if (alarm.repeatDays.length > 0 && !alarm.repeatDays.includes(weekdayIndex)) {
        return;
      }

      setAlarms((current) => current.map((entry) => (entry.id === alarm.id ? { ...entry, lastTriggered: currentDateKey } : entry)));
      fireAlert('Alarm ringing', alarm.label || 'Alarm');
      playConfiguredRingtone();
    });
  }, [alarms, timeZone, nowTick, ringtoneChoice, customRingtoneId]);

  useEffect(() => {
    setTimers((current) => {
      let changed = false;
      const now = Date.now();
      const next = current.map((timer) => {
        if (!timer.active || timer.endsAt === null) {
          return timer;
        }

        const remaining = Math.max(timer.endsAt - now, 0);
        if (remaining === 0) {
          changed = true;
          fireAlert('Timer complete', `${timer.label} is complete.`);
          playConfiguredRingtone();
          return {
            ...timer,
            active: false,
            endsAt: null,
            remainingMs: timer.durationMinutes * 60_000,
          };
        }

        if (remaining !== timer.remainingMs) {
          changed = true;
          return { ...timer, remainingMs: remaining };
        }

        return timer;
      });

      return changed ? next : current;
    });
  }, [nowTick, ringtoneChoice, customRingtoneId]);

  useEffect(() => {
    if (deviceKind === 'phone' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          void resolveCoordinates(position.coords.latitude, position.coords.longitude, 'automatic');
        },
        () => {
          setLocationSource('manual');
          setLocationLabel('Location permission not granted');
          setLocationMessage('Enter a city, region, or place name to set your clock.');
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else {
      setLocationSource('manual');
      setLocationMessage('Enter a city, region, or place name to set your clock.');
    }
  }, [deviceKind]);

  useEffect(() => {
    if ('Notification' in window) {
      setNotifyGranted(Notification.permission === 'granted');
    }
  }, []);

  const currentClock = formatParts(timeZone);
  const hourRotation = (currentClock.hour % 12) * 30 + currentClock.minute * 0.5;
  const minuteRotation = currentClock.minute * 6 + currentClock.second * 0.1;
  const secondRotation = currentClock.second * 6;
  const stopwatchDisplay = formatDuration(stopwatchElapsed);
  const sleepRemaining =
    sleepTimer.active && sleepTimer.endsAt !== null
      ? Math.max(sleepTimer.endsAt - Date.now(), 0)
      : sleepDurationMinutes * 60 * 1000;

  const setAlarmDay = (day: number) => {
    setAlarmRepeatDays((current) =>
      current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day].sort((left, right) => left - right),
    );
  };

  function playConfiguredRingtone() {
    stopCurrentAudio();

    if (ringtoneChoice === 'custom' && customRingtoneUrl) {
      if (customAudioRef.current) {
        customAudioRef.current.pause();
        customAudioRef.current.currentTime = 0;
      }
      const customTone = new Audio(customRingtoneUrl);
      customAudioRef.current = customTone;
      customTone.volume = 0.5;
      void customTone.play().catch(() => {
        void playRingtone('pulse');
      });
      return;
    }

    if (ringtoneChoice === 'custom') {
      void playRingtone('pulse');
      return;
    }

    void playRingtone(ringtoneChoice as Exclude<RingtoneChoice, 'custom'>);
  }

  async function resolveCoordinates(lat: number, lon: number, source: LocationSource) {
    const resolvedZone = tzlookup(lat, lon);
    setLatitude(lat);
    setLongitude(lon);
    setTimeZone(resolvedZone);
    setLocationSource(source);
    setLocationLabel(await reverseGeocode(lat, lon));
    setLocationMessage('Location updated successfully.');
  }

  async function reverseGeocode(lat: number, lon: number) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) {
        return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      }
      const data = (await response.json()) as { display_name?: string };
      return data.display_name?.split(',').slice(0, 3).join(', ') ?? `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    } catch {
      return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    }
  }

  async function searchLocation() {
    if (!locationQuery.trim()) {
      setLocationMessage('Type a place name first.');
      return;
    }

    setLocationMessage('Searching...');
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(locationQuery)}`,
        { headers: { Accept: 'application/json' } },
      );
      const results = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (!results.length) {
        setLocationMessage('No matching place found.');
        return;
      }
      const match = results[0];
      await resolveCoordinates(Number(match.lat), Number(match.lon), 'manual');
      setLocationLabel(match.display_name.split(',').slice(0, 3).join(', '));
      setLocationMessage('Manual location applied.');
      setLocationQuery('');
    } catch {
      setLocationMessage('Could not reach the location service.');
    }
  }

  async function requestNotificationAccess() {
    if (!('Notification' in window)) {
      setLocationMessage('Notifications are not supported in this browser.');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifyGranted(permission === 'granted');
  }

  function fireAlert(title: string, body: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
    if (navigator.vibrate) {
      navigator.vibrate([250, 100, 250]);
    }
  }

  function resetAlarmForm() {
    setEditingAlarmId(null);
    setAlarmLabel('Morning alarm');
    setAlarmTime('07:00');
    setAlarmRepeatDays([1, 2, 3, 4, 5]);
  }

  function submitAlarm() {
    if (editingAlarmId) {
      setAlarms((current) =>
        current.map((alarm) =>
          alarm.id === editingAlarmId
            ? {
                ...alarm,
                time: alarmTime,
                label: alarmLabel.trim() || 'Alarm',
                repeatDays: alarmRepeatDays,
                lastTriggered: null,
              }
            : alarm,
        ),
      );
      resetAlarmForm();
      return;
    }

    setAlarms((current) => [
      {
        id: makeId('alarm'),
        time: alarmTime,
        label: alarmLabel.trim() || 'Alarm',
        repeatDays: alarmRepeatDays,
        enabled: true,
        lastTriggered: null,
      },
      ...current,
    ]);
    resetAlarmForm();
  }

  function startEditingAlarm(alarm: Alarm) {
    setEditingAlarmId(alarm.id);
    setAlarmTime(alarm.time);
    setAlarmLabel(alarm.label);
    setAlarmRepeatDays(alarm.repeatDays);
  }

  function toggleAlarm(id: string) {
    setAlarms((current) => current.map((alarm) => (alarm.id === id ? { ...alarm, enabled: !alarm.enabled } : alarm)));
  }

  function deleteAlarm(id: string) {
    setAlarms((current) => current.filter((alarm) => alarm.id !== id));
    if (editingAlarmId === id) {
      resetAlarmForm();
    }
  }

  function setTimerDuration(hours: number, minutes: number) {
    const totalMinutes = clampMinutes(hours, minutes);
    const split = splitMinutes(totalMinutes);
    setTimerHours(split.hours);
    setTimerMinutes(split.minutes);
  }

  function resetTimerForm() {
    setEditingTimerId(null);
    setTimerLabel('Study focus');
    setTimerDuration(0, 30);
  }

  function submitTimer() {
    const durationMinutes = clampMinutes(timerHours, timerMinutes);

    if (editingTimerId) {
      setTimers((current) =>
        current.map((timer) =>
          timer.id === editingTimerId
            ? {
                ...timer,
                label: timerLabel.trim() || 'Tagged timer',
                durationMinutes,
                remainingMs: durationMinutes * 60_000,
                active: false,
                endsAt: null,
              }
            : timer,
        ),
      );
      resetTimerForm();
      return;
    }

    setTimers((current) => [
      {
        id: makeId('timer'),
        label: timerLabel.trim() || 'Tagged timer',
        durationMinutes,
        remainingMs: durationMinutes * 60_000,
        active: false,
        endsAt: null,
      },
      ...current,
    ]);
    resetTimerForm();
  }

  function startEditingTimer(timer: TaggedTimer) {
    setEditingTimerId(timer.id);
    setTimerLabel(timer.label);
    const split = splitMinutes(timer.durationMinutes);
    setTimerHours(split.hours);
    setTimerMinutes(split.minutes);
  }

  function toggleTimer(id: string) {
    setTimers((current) =>
      current.map((timer) => {
        if (timer.id !== id) {
          return timer;
        }

        if (timer.active && timer.endsAt !== null) {
          return {
            ...timer,
            active: false,
            endsAt: null,
            remainingMs: Math.max(timer.endsAt - Date.now(), 0),
          };
        }

        const resumeMs = timer.remainingMs > 0 ? timer.remainingMs : timer.durationMinutes * 60_000;
        return {
          ...timer,
          active: true,
          endsAt: Date.now() + resumeMs,
          remainingMs: resumeMs,
        };
      }),
    );
  }

  function removeTimer(id: string) {
    setTimers((current) => current.filter((timer) => timer.id !== id));
    if (editingTimerId === id) {
      resetTimerForm();
    }
  }

  function startStopwatch() {
    if (stopwatchRunning) {
      return;
    }
    const startPoint = Date.now() - stopwatchElapsed;
    setStopwatchStart(startPoint);
    setStopwatchRunning(true);
  }

  function pauseStopwatch() {
    setStopwatchRunning(false);
  }

  function resetStopwatch() {
    setStopwatchRunning(false);
    setStopwatchElapsed(0);
    setStopwatchStart(null);
    setStopwatchLaps([]);
  }

  function recordLap() {
    setStopwatchLaps((current) => [
      {
        id: makeId('lap'),
        label: `Lap ${current.length + 1}`,
        elapsedMs: stopwatchElapsed,
      },
      ...current,
    ]);
  }

  function setSleepDuration(hours: number, minutes: number) {
    const nextMinutes = clampMinutes(hours, minutes);
    const split = splitMinutes(nextMinutes);
    setSleepHours(split.hours);
    setSleepMinutesPart(split.minutes);
    setSleepDurationMinutes(nextMinutes);
    setSleepTimer((current) => ({ ...current, durationMinutes: nextMinutes }));
  }

  function startSleepTimer() {
    const durationMs = sleepDurationMinutes * 60 * 1000;
    setSleepTimer({
      active: true,
      durationMinutes: sleepDurationMinutes,
      startedAt: Date.now(),
      endsAt: Date.now() + durationMs,
    });
    setActiveTab('sleep');
  }

  function cancelSleepTimer() {
    setSleepTimer({ active: false, durationMinutes: sleepDurationMinutes, startedAt: null, endsAt: null });
    sleepFireRef.current = false;
  }

  async function addWorldClock() {
    if (!worldQuery.trim()) {
      setLocationMessage('Search for a city to add a world clock.');
      return;
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(worldQuery)}`,
        { headers: { Accept: 'application/json' } },
      );
      const results = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (!results.length) {
        setLocationMessage('No matching city found for world clock.');
        return;
      }
      const match = results[0];
      const zone = tzlookup(Number(match.lat), Number(match.lon));
      setWorldClocks((current) => [
        {
          id: makeId('world'),
          label: match.display_name.split(',').slice(0, 3).join(', '),
          latitude: Number(match.lat),
          longitude: Number(match.lon),
          timeZone: zone,
        },
        ...current.filter((item) => item.timeZone !== zone),
      ]);
      setWorldQuery('');
      setLocationMessage('World clock added.');
    } catch {
      setLocationMessage('Could not add that city right now.');
    }
  }

  function removeWorldClock(id: string) {
    setWorldClocks((current) => current.filter((clock) => clock.id !== id));
  }

  function handleCustomRingtoneUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Size check: max 5MB
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setLocationMessage('Audio file too large. Maximum size is 5MB.');
      return;
    }

    const ringtoneId = makeId('ringtone');

    if (appMode === 'installed') {
      // Use IndexedDB for installed PWA app
      void (async () => {
        try {
          const saved = await saveCustomRingtoneToIDB(ringtoneId, file);
          if (saved) {
            setCustomRingtoneId(ringtoneId);
            setCustomRingtoneName(file.name);
            setRingtoneChoice('custom');
            setLocationMessage(`Custom ringtone "${file.name}" saved successfully.`);
          } else {
            setLocationMessage('Failed to save ringtone. Try using a browser with IndexedDB support.');
          }
        } catch {
          setLocationMessage('Error saving custom ringtone. Please try again.');
        }
      })();
    } else {
      // Use data URL for browser mode (smaller file, single session)
      const reader = new FileReader();
      reader.onerror = () => {
        setLocationMessage('Failed to read audio file. Please try again.');
      };
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          try {
            setCustomRingtoneUrl(result);
            setCustomRingtoneId(ringtoneId);
            setCustomRingtoneName(file.name);
            setRingtoneChoice('custom');
            setLocationMessage(`Custom ringtone "${file.name}" loaded for this session.`);
          } catch {
            setLocationMessage('Error loading ringtone. File may be too large for browser storage.');
          }
        }
      };
      reader.readAsDataURL(file);
    }
  }

  // Load custom ringtone from IDB when customRingtoneId changes (app-installed mode)
  useEffect(() => {
    if (appMode !== 'installed' || !customRingtoneId) {
      return;
    }

    void (async () => {
      try {
        const blob = await loadCustomRingtoneFromIDB(customRingtoneId);
        if (blob) {
          const url = URL.createObjectURL(blob);
          setCustomRingtoneUrl(url);
        }
      } catch {
        // Silently fail - fallback to preset
      }
    })();
  }, [customRingtoneId, appMode]);

  const clockCards =
    worldClocks.length > 0
      ? worldClocks
      : [{ id: 'home', label: locationLabel, latitude: latitude ?? 0, longitude: longitude ?? 0, timeZone }];

  return (
    <div className={`shell ${deviceKind}`}>
      <div className="background-glow glow-a" />
      <div className="background-glow glow-b" />
      <header className="topbar">
        <div>
          <p className="eyebrow">Pulse Clock</p>
          <h1>Time that follows the person, not the machine.</h1>
          <p className="lede">
            A polished clock suite for phone and desktop with automatic location on mobile, custom ringtones, tagged timers, and editable alarms.
          </p>
        </div>
        <div className="status-card">
          <span className="status-label">Device</span>
          <strong>{deviceKind === 'phone' ? 'Phone layout' : 'Computer layout'}</strong>
          <span>{locationSource === 'automatic' ? 'Location detected from GPS' : 'Location entered manually'}</span>
        </div>
      </header>

      <nav className="tabs" aria-label="Clock sections">
        {tabs.map((tab) => (
          <button key={tab.key} className={activeTab === tab.key ? 'tab active' : 'tab'} onClick={() => setActiveTab(tab.key)} type="button">
            <span>{tab.label}</span>
            <small>{tab.hint}</small>
          </button>
        ))}
      </nav>

      <main className="content-grid">
        {activeTab === 'clock' && (
          <section className="panel hero-panel">
            <div className="hero-copy">
              <p className="panel-tag">Current location</p>
              <h2>{locationLabel}</h2>
              <p className="zone-line">
                {timeZone} · {currentClock.zoneName}
              </p>
              <div className="digital-time" aria-label="Current time">
                {pad(currentClock.hour)}:{pad(currentClock.minute)}:{pad(currentClock.second)}
              </div>
              <div className="subgrid">
                <div>
                  <span>Date</span>
                  <strong>
                    {currentClock.dayName}, {currentClock.dateLabel}
                  </strong>
                </div>
                <div>
                  <span>Coordinates</span>
                  <strong>{latitude !== null && longitude !== null ? `${latitude.toFixed(3)}, ${longitude.toFixed(3)}` : 'Not set yet'}</strong>
                </div>
              </div>
            </div>
            <div className="analog-clock" aria-hidden="true">
              <div className="dial-ring" />
              <div className="hand hour" style={{ transform: `translateX(-50%) rotate(${hourRotation}deg)` }} />
              <div className="hand minute" style={{ transform: `translateX(-50%) rotate(${minuteRotation}deg)` }} />
              <div className="hand second" style={{ transform: `translateX(-50%) rotate(${secondRotation}deg)` }} />
              <div className="center-dot" />
              <span className="tick tick-12">12</span>
              <span className="tick tick-3">3</span>
              <span className="tick tick-6">6</span>
              <span className="tick tick-9">9</span>
            </div>
          </section>
        )}

        {activeTab === 'alarms' && (
          <section className="panel split-panel">
            <div>
              <p className="panel-tag">Alarm studio</p>
              <h2>Wake-ups, repeats, labels, and edits</h2>
              <div className="form-grid">
                <label>
                  Alarm time
                  <input type="time" value={alarmTime} onChange={(event) => setAlarmTime(event.target.value)} />
                </label>
                <label>
                  Label / tag name
                  <input value={alarmLabel} onChange={(event) => setAlarmLabel(event.target.value)} placeholder="Morning run" />
                </label>
              </div>
              <div className="weekday-row">
                {weekdayLabels.map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    className={alarmRepeatDays.includes(index) ? 'chip active' : 'chip'}
                    onClick={() => setAlarmDay(index)}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <div className="action-row">
                <button className="primary-button" type="button" onClick={submitAlarm}>
                  {editingAlarmId ? 'Save changes' : 'Add alarm'}
                </button>
                {editingAlarmId && (
                  <button className="secondary-button" type="button" onClick={resetAlarmForm}>
                    Cancel edit
                  </button>
                )}
                <button className="secondary-button" type="button" onClick={requestNotificationAccess}>
                  {notifyGranted ? 'Notifications enabled' : 'Enable notifications'}
                </button>
              </div>
              <div className="list-stack">
                {alarms.length === 0 && <p className="empty-state">No alarms yet. Add one above.</p>}
                {alarms.map((alarm) => (
                  <article className="list-card" key={alarm.id}>
                    <div>
                      <strong>{alarm.label}</strong>
                      <p>{alarm.time} · {alarm.repeatDays.length === 0 ? 'One-time' : alarm.repeatDays.map((day) => weekdayLabels[day]).join(', ')}</p>
                    </div>
                    <div className="list-actions">
                      <button type="button" className="ghost-button" onClick={() => startEditingAlarm(alarm)}>
                        Edit
                      </button>
                      <button type="button" className="ghost-button" onClick={() => toggleAlarm(alarm.id)}>
                        {alarm.enabled ? 'On' : 'Off'}
                      </button>
                      <button type="button" className="ghost-button danger" onClick={() => deleteAlarm(alarm.id)}>
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <div className="info-panel">
              <h3>Alarm behavior</h3>
              <p>All alarms follow your selected timezone and use your chosen ringtone, including custom uploaded audio.</p>
              <p>Edit mode lets you quickly update a tag, time, or repeat days without removing the alarm first.</p>
            </div>
          </section>
        )}

        {activeTab === 'timer' && (
          <section className="panel split-panel">
            <div>
              <p className="panel-tag">Tagged timer</p>
              <h2>Named countdown timers with edit controls</h2>
              <div className="form-grid">
                <label>
                  Timer tag name
                  <input value={timerLabel} onChange={(event) => setTimerLabel(event.target.value)} placeholder="Workout set" />
                </label>
                <label>
                  Duration (24-hour range)
                  <div className="time-picker-row">
                    <input
                      type="number"
                      min="0"
                      max="24"
                      value={timerHours}
                      onChange={(event) => setTimerDuration(Number(event.target.value), timerMinutes)}
                    />
                    <span>:</span>
                    <input
                      type="number"
                      min="0"
                      max={timerHours === 24 ? '0' : '59'}
                      value={timerMinutes}
                      onChange={(event) => setTimerDuration(timerHours, Number(event.target.value))}
                    />
                  </div>
                </label>
              </div>
              <div className="action-row">
                <button className="primary-button" type="button" onClick={submitTimer}>
                  {editingTimerId ? 'Save timer' : 'Add timer'}
                </button>
                {editingTimerId && (
                  <button className="secondary-button" type="button" onClick={resetTimerForm}>
                    Cancel edit
                  </button>
                )}
              </div>
              <div className="list-stack">
                {timers.length === 0 && <p className="empty-state">No tagged timers yet. Create one above.</p>}
                {timers.map((timer) => (
                  <article className="list-card" key={timer.id}>
                    <div>
                      <strong>{timer.label}</strong>
                      <p>
                        Total: {formatHourMinute(timer.durationMinutes)} · Remaining: {formatDuration(timer.remainingMs)}
                      </p>
                    </div>
                    <div className="list-actions">
                      <button type="button" className="ghost-button" onClick={() => startEditingTimer(timer)}>
                        Edit
                      </button>
                      <button type="button" className="ghost-button" onClick={() => toggleTimer(timer.id)}>
                        {timer.active ? 'Off' : 'On'}
                      </button>
                      <button type="button" className="ghost-button danger" onClick={() => removeTimer(timer.id)}>
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <div className="info-panel">
              <h3>Timer notes</h3>
              <p>Each timer keeps a clear tag name, has On/Off control, and can be edited any time.</p>
              <p>Completion alerts use the same selected ringtone as alarms and sleep timers.</p>
            </div>
          </section>
        )}

        {activeTab === 'stopwatch' && (
          <section className="panel split-panel">
            <div>
              <p className="panel-tag">Stopwatch</p>
              <h2>Precise timing with lap support</h2>
              <div className="digital-time large">{stopwatchDisplay}</div>
              <div className="action-row">
                <button type="button" className="primary-button" onClick={stopwatchRunning ? pauseStopwatch : startStopwatch}>
                  {stopwatchRunning ? 'Pause' : 'Start'}
                </button>
                <button type="button" className="secondary-button" onClick={recordLap} disabled={!stopwatchRunning}>
                  Lap
                </button>
                <button type="button" className="secondary-button" onClick={resetStopwatch}>
                  Reset
                </button>
              </div>
              <div className="list-stack">
                {stopwatchLaps.length === 0 && <p className="empty-state">No laps recorded yet.</p>}
                {stopwatchLaps.map((lap) => (
                  <article className="list-card" key={lap.id}>
                    <strong>{lap.label}</strong>
                    <p>{formatDuration(lap.elapsedMs)}</p>
                  </article>
                ))}
              </div>
            </div>
            <div className="info-panel">
              <h3>Built for phone and desktop</h3>
              <p>The stopwatch stays responsive and uses fine-grained updates while running, then idles when paused.</p>
              <p>It keeps lap times locally so your session is preserved while the page stays open.</p>
            </div>
          </section>
        )}

        {activeTab === 'sleep' && (
          <section className="panel split-panel">
            <div>
              <p className="panel-tag">Sleep timer</p>
              <h2>24-hour sleep countdown</h2>
              <div className="form-grid compact">
                <label>
                  Duration (HH:MM up to 24:00)
                  <div className="time-picker-row">
                    <input
                      type="number"
                      min="0"
                      max="24"
                      value={sleepHours}
                      onChange={(event) => setSleepDuration(Number(event.target.value), sleepMinutesPart)}
                    />
                    <span>:</span>
                    <input
                      type="number"
                      min="0"
                      max={sleepHours === 24 ? '0' : '59'}
                      value={sleepMinutesPart}
                      onChange={(event) => setSleepDuration(sleepHours, Number(event.target.value))}
                    />
                  </div>
                  <span className="range-label">Selected: {formatHourMinute(sleepDurationMinutes)}</span>
                </label>
              </div>
              <div className="digital-time large">{formatDuration(sleepRemaining)}</div>
              <div className="action-row">
                <button type="button" className="primary-button" onClick={startSleepTimer}>
                  Start timer
                </button>
                <button type="button" className="secondary-button" onClick={cancelSleepTimer}>
                  Cancel
                </button>
              </div>
              <p className="helper-text">
                When the countdown finishes, the app triggers a notification, vibration if available, and your selected ringtone.
              </p>
            </div>
            <div className="info-panel">
              <h3>Sleep helper</h3>
              <p>The timer now supports a full 24-hour range so long sessions and overnight cutoff schedules are easy to set.</p>
              <p>Pick your own sound profile in Settings, including custom uploaded audio.</p>
            </div>
          </section>
        )}

        {activeTab === 'world' && (
          <section className="panel split-panel">
            <div>
              <p className="panel-tag">World clock</p>
              <h2>Keep a few cities in view</h2>
              <div className="search-row">
                <input placeholder="Search a city, country, or region" value={worldQuery} onChange={(event) => setWorldQuery(event.target.value)} />
                <button type="button" className="primary-button" onClick={addWorldClock}>
                  Add city
                </button>
              </div>
              <div className="list-stack">
                {clockCards.map((clock) => {
                  const parts = formatParts(clock.timeZone);
                  return (
                    <article className="list-card world-card" key={clock.id}>
                      <div>
                        <strong>{clock.label}</strong>
                        <p>{clock.timeZone}</p>
                      </div>
                      <div className="world-time">
                        <span>
                          {pad(parts.hour)}:{pad(parts.minute)}
                        </span>
                        <small>{parts.dayName}</small>
                      </div>
                      {clock.id !== 'home' && (
                        <button type="button" className="ghost-button danger" onClick={() => removeWorldClock(clock.id)}>
                          Remove
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
            <div className="info-panel">
              <h3>Saved city cards</h3>
              <p>The world clock saves locations in the browser so you can compare time zones on every launch.</p>
              <p>Add as many places as you need for travel, work, or family coordination.</p>
            </div>
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="panel split-panel">
            <div>
              <p className="panel-tag">Settings</p>
              <h2>Device-aware location + ringtone controls</h2>
              <div className="info-grid">
                <div className="info-card">
                  <span>Device</span>
                  <strong>{deviceKind}</strong>
                  <p>{deviceKind === 'phone' ? 'GPS permission is requested for automatic location.' : 'Manual location entry is the default on desktop.'}</p>
                </div>
                <div className="info-card">
                  <span>Time zone</span>
                  <strong>{timeZone}</strong>
                  <p>All live views follow the selected location zone.</p>
                </div>
                <div className="info-card">
                  <span>Location source</span>
                  <strong>{locationSource}</strong>
                  <p>{locationLabel}</p>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  Default ringtone
                  <select value={ringtoneChoice} onChange={(event) => setRingtoneChoice(event.target.value as RingtoneChoice)}>
                    {ringtoneList.map((ringtone) => (
                      <option key={ringtone.value} value={ringtone.value}>
                        {ringtone.label}
                      </option>
                    ))}
                    <option value="custom">Custom upload</option>
                  </select>
                </label>
                <label>
                  Custom ringtone file (max 5MB)
                  <input type="file" accept="audio/*" onChange={handleCustomRingtoneUpload} />
                  <span className="range-label">{customRingtoneName ? `Loaded: ${customRingtoneName}` : 'No custom file yet.'}</span>
                </label>
              </div>

              <div className="action-row">
                <button type="button" className="secondary-button" onClick={playConfiguredRingtone}>
                  Preview ringtone
                </button>
              </div>

              <div className="search-row">
                <input placeholder="Manual location search" value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} />
                <button type="button" className="primary-button" onClick={searchLocation}>
                  Set location
                </button>
              </div>
              <p className="helper-text">{locationMessage || 'Use the search box to set your place, then all clocks update instantly.'}</p>
            </div>
            <div className="info-panel">
              <h3>Sound integration</h3>
              <p>The ringtone you choose here is shared by alarms, tagged timers, and the sleep timer.</p>
              <p>
                {appMode === 'installed'
                  ? 'Running as installed app – custom ringtones are stored in local database.'
                  : 'Running in browser – custom ringtones are stored for this session only.'}
              </p>
            </div>
          </section>
        )}

        {activeTab === 'developer' && (
          <section className="panel split-panel">
            <div>
              <p className="panel-tag">Developer</p>
              <h2>Shaik Rehan Ali</h2>
              <p className="helper-text">
                Student at G Pulla Reddy Degree and PG College, pursuing BSC MSCS.
              </p>
              <div className="list-stack">
                <article className="list-card">
                  <div>
                    <strong>Creator profile</strong>
                    <p>Shaik Rehan Ali, a focused builder with a sharp product mindset and a clean execution style.</p>
                  </div>
                </article>
                <article className="list-card">
                  <div>
                    <strong>Academic track</strong>
                    <p>BSC MSCS at G Pulla Reddy Degree and PG College, with strong dedication to practical software skills.</p>
                  </div>
                </article>
                <article className="list-card">
                  <div>
                    <strong>Extra spotlight</strong>
                    <p>
                      Known for ambitious ideas, relentless consistency, and the confidence to turn small projects into standout experiences.
                    </p>
                  </div>
                </article>
              </div>
            </div>
            <div className="info-panel">
              <h3>Signature</h3>
              <p>This clock suite proudly carries the name and journey of Shaik Rehan Ali.</p>
              <p>A student developer with high momentum, strong curiosity, and next-level growth potential.</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function formatDuration(totalMs: number) {
  const safeTotal = Math.max(0, Math.floor(totalMs));
  const hours = Math.floor(safeTotal / 3_600_000);
  const minutes = Math.floor((safeTotal % 3_600_000) / 60_000);
  const seconds = Math.floor((safeTotal % 60_000) / 1000);
  const tenths = Math.floor((safeTotal % 1000) / 100);

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${tenths}`;
  }

  return `${pad(minutes)}:${pad(seconds)}.${tenths}`;
}

function formatHourMinute(totalMinutes: number) {
  const split = splitMinutes(totalMinutes);
  return `${pad(split.hours)}:${pad(split.minutes)}`;
}

export default App;
