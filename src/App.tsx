import { useEffect, useRef, useState } from 'react';
import tzlookup from 'tz-lookup';

type TabKey = 'clock' | 'alarms' | 'stopwatch' | 'sleep' | 'world' | 'settings';
type DeviceKind = 'phone' | 'computer';
type LocationSource = 'automatic' | 'manual';

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
  { key: 'stopwatch', label: 'Stopwatch', hint: 'Track time' },
  { key: 'sleep', label: 'Sleep', hint: 'Timer' },
  { key: 'world', label: 'World', hint: 'Cities' },
  { key: 'settings', label: 'Settings', hint: 'Device & location' },
];

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const storageKeys = {
  alarms: 'pulse-clock-alarms',
  worlds: 'pulse-clock-worlds',
  settings: 'pulse-clock-settings',
};

const pad = (value: number) => String(value).padStart(2, '0');

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
  const zoneName = new Intl.DateTimeFormat('en-US', {
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

function playAlertTone() {
  try {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.0001;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.9);
    oscillator.stop(audioContext.currentTime + 1);
  } catch {
    // Ignore audio failures in restrictive browsers.
  }
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
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [stopwatchStart, setStopwatchStart] = useState<number | null>(null);
  const [stopwatchElapsed, setStopwatchElapsed] = useState(0);
  const [stopwatchLaps, setStopwatchLaps] = useState<StopwatchLap[]>([]);
  const [sleepMinutes, setSleepMinutes] = useState(25);
  const [sleepTimer, setSleepTimer] = useState<SleepTimerState>({
    active: false,
    durationMinutes: 25,
    startedAt: null,
    endsAt: null,
  });
  const [worldClocks, setWorldClocks] = useState<SavedLocation[]>([]);
  const [worldQuery, setWorldQuery] = useState('');
  const [notifyGranted, setNotifyGranted] = useState(Notification.permission === 'granted');
  const sleepFireRef = useRef(false);

  useEffect(() => {
    const updateDevice = () => setDeviceKind(getDeviceKind());
    window.addEventListener('resize', updateDevice);
    window.addEventListener('orientationchange', updateDevice);
    return () => {
      window.removeEventListener('resize', updateDevice);
      window.removeEventListener('orientationchange', updateDevice);
    };
  }, []);

  useEffect(() => {
    const savedAlarms = window.localStorage.getItem(storageKeys.alarms);
    const savedWorlds = window.localStorage.getItem(storageKeys.worlds);
    const savedSettings = window.localStorage.getItem(storageKeys.settings);

    if (savedAlarms) {
      try {
        setAlarms(JSON.parse(savedAlarms) as Alarm[]);
      } catch {
        window.localStorage.removeItem(storageKeys.alarms);
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
        const parsed = JSON.parse(savedSettings) as { locationLabel?: string; timeZone?: string; source?: LocationSource; latitude?: number; longitude?: number };
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
    };
    window.localStorage.setItem(storageKeys.settings, JSON.stringify(snapshot));
  }, [locationLabel, timeZone, locationSource, latitude, longitude]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.alarms, JSON.stringify(alarms));
  }, [alarms]);

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
          playAlertTone();
        }
      }, 500);
      return () => window.clearInterval(timer);
    }
    sleepFireRef.current = false;
    return undefined;
  }, [sleepTimer.active, sleepTimer.endsAt]);

  useEffect(() => {
    const currentParts = formatParts(timeZone);
    const currentDateKey = getDateKeyInTimeZone(timeZone);

    alarms.forEach((alarm) => {
      if (!alarm.enabled) {
        return;
      }
      if (alarm.lastTriggered === currentDateKey) {
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
      playAlertTone();
    });
  }, [alarms, timeZone, nowTick]);

  useEffect(() => {
    if (deviceKind === 'phone' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolveCoordinates(position.coords.latitude, position.coords.longitude, 'automatic');
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
  const clockAngles = {
    hour: currentClock.hour % 12,
    minute: currentClock.minute,
    second: currentClock.second,
  };
  const hourRotation = clockAngles.hour * 30 + clockAngles.minute * 0.5;
  const minuteRotation = clockAngles.minute * 6 + clockAngles.second * 0.1;
  const secondRotation = clockAngles.second * 6;
  const stopwatchDisplay = formatDuration(stopwatchElapsed);
  const sleepRemaining = sleepTimer.active && sleepTimer.endsAt !== null ? Math.max(sleepTimer.endsAt - Date.now(), 0) : sleepMinutes * 60 * 1000;

  const setAlarmDay = (day: number) => {
    setAlarmRepeatDays((current) =>
      current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day].sort((left, right) => left - right),
    );
  };

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

  function addAlarm() {
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
    setAlarmLabel('Morning alarm');
    setAlarmTime('07:00');
    setAlarmRepeatDays([1, 2, 3, 4, 5]);
  }

  function toggleAlarm(id: string) {
    setAlarms((current) => current.map((alarm) => (alarm.id === id ? { ...alarm, enabled: !alarm.enabled } : alarm)));
  }

  function deleteAlarm(id: string) {
    setAlarms((current) => current.filter((alarm) => alarm.id !== id));
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

  function startSleepTimer() {
    const durationMs = sleepMinutes * 60 * 1000;
    setSleepTimer({
      active: true,
      durationMinutes: sleepMinutes,
      startedAt: Date.now(),
      endsAt: Date.now() + durationMs,
    });
    setActiveTab('sleep');
  }

  function cancelSleepTimer() {
    setSleepTimer({ active: false, durationMinutes: sleepMinutes, startedAt: null, endsAt: null });
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

  const clockCards = worldClocks.length > 0 ? worldClocks : [{ id: 'home', label: locationLabel, latitude: latitude ?? 0, longitude: longitude ?? 0, timeZone }];

  return (
    <div className={`shell ${deviceKind}`}>
      <div className="background-glow glow-a" />
      <div className="background-glow glow-b" />
      <header className="topbar">
        <div>
          <p className="eyebrow">Pulse Clock</p>
          <h1>Time that follows the person, not the machine.</h1>
          <p className="lede">
            A polished clock suite for phone and desktop with automatic location on mobile and manual location on larger screens.
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
          <button
            key={tab.key}
            className={activeTab === tab.key ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
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
                  <strong>{currentClock.dayName}, {currentClock.dateLabel}</strong>
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
              <h2>Wake-ups, repeats, and labels</h2>
              <div className="form-grid">
                <label>
                  Alarm time
                  <input type="time" value={alarmTime} onChange={(event) => setAlarmTime(event.target.value)} />
                </label>
                <label>
                  Label
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
                <button className="primary-button" type="button" onClick={addAlarm}>
                  Add alarm
                </button>
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
              <p>Alarms are checked against the selected location timezone, so the ring follows the person’s current place.</p>
              <p>On phones, the app asks for GPS access. On desktop, type a city or region instead.</p>
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
              <p>It keeps lap times locally so the session is preserved while the page stays open.</p>
            </div>
          </section>
        )}

        {activeTab === 'sleep' && (
          <section className="panel split-panel">
            <div>
              <p className="panel-tag">Sleep timer</p>
              <h2>Countdown to rest mode</h2>
              <div className="form-grid compact">
                <label>
                  Minutes
                  <input
                    type="range"
                    min="5"
                    max="180"
                    step="5"
                    value={sleepMinutes}
                    onChange={(event) => setSleepMinutes(Number(event.target.value))}
                  />
                  <span className="range-label">{sleepMinutes} minutes</span>
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
                When the countdown finishes, the app triggers a notification, vibration if available, and a soft tone.
              </p>
            </div>
            <div className="info-panel">
              <h3>Sleep helper</h3>
              <p>Useful for music, meditation, or winding down. It is local to the device and requires no account.</p>
              <p>Timer length is adjustable from five minutes up to three hours.</p>
            </div>
          </section>
        )}

        {activeTab === 'world' && (
          <section className="panel split-panel">
            <div>
              <p className="panel-tag">World clock</p>
              <h2>Keep a few cities in view</h2>
              <div className="search-row">
                <input
                  placeholder="Search a city, country, or region"
                  value={worldQuery}
                  onChange={(event) => setWorldQuery(event.target.value)}
                />
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
                        <span>{pad(parts.hour)}:{pad(parts.minute)}</span>
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
              <h2>Device-aware location handling</h2>
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
              <div className="search-row">
                <input
                  placeholder="Manual location search"
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.target.value)}
                />
                <button type="button" className="primary-button" onClick={searchLocation}>
                  Set location
                </button>
              </div>
              <p className="helper-text">{locationMessage || 'Use the search box to set your place, then all clocks update instantly.'}</p>
            </div>
            <div className="info-panel">
              <h3>Cross-platform behavior</h3>
              <p>The app adapts its layout to coarse pointer devices, smaller screens, and browser support for notifications and vibration.</p>
              <p>It works on Linux, Windows, Android, and other systems through the browser.</p>
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

export default App;
