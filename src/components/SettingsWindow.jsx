import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildSearchIndex, searchIndex } from '../utils/settingsSearch.mjs';
import {
  Monitor,
  Palette,
  MusicNote,
  Bell,
  SquaresFour,
  Gear,
  Flask,
  MagnifyingGlass,
  ArrowCounterClockwise,
  Check,
  CaretRight,
  Clipboard,
  Folder,
  PencilSimple,
  Cloud,
  House,
  Sparkle,
  Timer,
  Waves,
  TextAa,
  Cursor,
  Drop,
  SpeakerHigh,
  Image,
  ArrowsOutSimple,
  Desktop,
  Keyboard,
  BatteryFull,
  CheckCircle,
  SlidersHorizontal,
  Lightning,
  Moon,
  Sun,
  Rows,
  LockSimple,
  DownloadSimple,
  Bluetooth,
  WifiHigh,
  Question,
  X,
} from 'phosphor-react';
import '../styles/settings.css';
import ThemeCreatorModal from './ThemeCreatorModal';

// Mirrors SETTINGS_DEFAULTS in electron/main.js. The main process also exposes
// these through settings-get-defaults, so keep this only as an offline fallback.
const DEFAULTS_FALLBACK = {
  displayMode: 'pill',
  expandBy: 'Наведением',
  expandDelay: 110,
  openTab: 'Последнюю вкладку',
  battery: true,
  capslock: true,
  pillLyric: true,
  hideFullscreen: true,
  theme: 'Классика',
  accent: '#ffffff',
  accentFollowTrack: true,
  roundness: 75,
  edgeFade: 100,
  lightBorder: true,
  shadow: true,
  scale: 100,
  collapsedScale: 100,
  expandedScale: 100,
  anim: 'Капля',
  wavePower: 100,
  playerBg: 'Без фона',
  playerAnim: 'Только пульс',
  syncLyrics: true,
  notifDuration: 1.8,
  volumeNotif: true,
  batteryNotif: true,
  capsNotif: true,
  clipNotif: true,
  notifProgress: true,
  notifIcons: true,
  notifPosition: 'bottom',
  notifAnimation: 'slide',
  notifAccentTint: true,
  liveEdge: true,
  miniIsland: false,
  hiddenTabs: [],
  expBeats: true,
  beatPower: 100,
  city: '',
  playerVolume: 100,
  downloadNotif: true,
  discordRPC: false,
  pomoWork: 25,
  pomoShort: 5,
  pomoLong: 15,
  pomoUntilLong: 4,
  pomoSound: true,
  pomoDND: false,
  pomoAutoNext: true,
};

const THEMES = [
  { name: 'Классика', bg: '#000000', dot: '#a78bfa' },
  { name: 'Минимал', bg: '#141416', dot: '#d4d4d8' },
  { name: 'Неон', bg: '#0a1024', dot: '#38bdf8' },
  { name: 'Мягкий', bg: '#1a1a1e', dot: '#f0abfc' },
  { name: 'Лес', bg: '#0d1a12', dot: '#4ade80' },
  { name: 'Закат', bg: '#1c0f14', dot: '#fb7185' },
  { name: 'Щелчок', bg: '#000000', dot: '#e5e5e5' },
];

const ACCENTS = ['#3b82f6', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899', '#f97316', '#ef4444', '#eab308'];

const ISLAND_TABS = [
  { id: 'player', label: 'Плеер', icon: House, fixed: true },
  { id: 'buffer', label: 'Буфер', icon: Clipboard },
  { id: 'shelf', label: 'Полка', icon: Folder },
  { id: 'text', label: 'Текст', icon: PencilSimple },
  { id: 'focus', label: 'Фокус', icon: Timer },
  { id: 'weather', label: 'Погода', icon: Cloud },
];

const TAB_META = [
  { id: 'island', label: 'Остров', icon: Monitor, kicker: 'Поведение', desc: 'Как остров раскрывается, что показывает в свёрнутом виде и когда прячется.' },
  { id: 'appearance', label: 'Внешний вид', icon: Palette, kicker: 'Оформление', desc: 'Тема, акцент, форма и движение. Всё меняется вживую — прямо в превью.' },
  { id: 'music', label: 'Музыка', icon: MusicNote, kicker: 'Звук', desc: 'Оформление плеера и синхронный текст. Управление треком остаётся в острове.' },
  { id: 'notifications', label: 'Уведомления', icon: Bell, kicker: 'Сигналы', desc: 'Что и как долго показывать в плашке острова.' },
  { id: 'focus', label: 'Фокус', icon: Timer, kicker: 'Помидор', desc: 'Таймер Pomodoro: длительности, звук и авто-переход.' },
  { id: 'tabs', label: 'Вкладки', icon: SquaresFour, kicker: 'Компоновка', desc: 'Соберите меню острова под себя. Плеер остаётся всегда.' },
  { id: 'system', label: 'Система', icon: Gear, kicker: 'Система', desc: 'Автозапуск, интеграции и определение города для погоды.' },
  { id: 'experimental', label: 'Экспериментальное', icon: Flask, kicker: 'Лаборатория', desc: 'То, что уже работает, но пока не везде и не у всех.' },
  { id: 'help', label: 'Справка', icon: Question, kicker: 'Помощь', desc: 'Как пользоваться островом и его скрытыми жестами.' },
];

const GROUPS = {
  island: [
    {
      id: 'open',
      title: 'Раскрытие',
      desc: 'Что происходит, когда курсор касается острова.',
      items: [
        { key: 'displayMode', title: 'Положение', sub: 'Пилюля парит под краем или прилипает к нему', icon: Monitor, type: 'segmented', options: [{ value: 'pill', label: 'Пилюля' }, { value: 'attached', label: 'У края' }] },
        { key: 'islandDisplay', title: 'Монитор', sub: 'На каком экране показывать остров', icon: Monitor, type: 'display' },
        { key: 'expandBy', title: 'Раскрывать', sub: 'Наведением — без клика; кликом — только по нажатию', icon: Cursor, type: 'segmented', options: [{ value: 'Наведением', label: 'Наведением' }, { value: 'Кликом', label: 'Кликом' }] },
        { key: 'expandDelay', title: 'Задержка раскрытия', sub: 'Сколько держать курсор над островом', icon: Timer, type: 'slider', min: 0, max: 500, step: 10, suffix: ' мс' },
        { key: 'openTab', title: 'При раскрытии открывать', sub: 'Последнюю вкладку или каждый раз плеер', icon: ArrowsOutSimple, type: 'segmented', options: [{ value: 'Последнюю вкладку', label: 'Последнюю' }, { value: 'Плеер', label: 'Плеер' }] },
      ],
    },
    {
      id: 'indicators',
      title: 'Свёрнутый вид',
      desc: 'Информация на пилюле, когда остров не раскрыт.',
      items: [
        { key: 'battery', title: 'Батарея или дата', sub: 'На устройстве без батареи показывается дата', icon: BatteryFull, type: 'toggle' },
        { key: 'capslock', title: 'Раскладка и Caps Lock', sub: 'Код языка рядом с часами', icon: Keyboard, type: 'toggle' },
        { key: 'pillLyric', title: 'Строка песни', sub: 'Вместо названия трека — то, что поёт сейчас', icon: TextAa, type: 'toggle' },
      ],
    },
    {
      id: 'sizes',
      title: 'Размеры',
      desc: 'Свёрнутая пилюля и раскрытая панель масштабируются независимо.',
      items: [
        { key: 'collapsedScale', title: 'Размер свёрнутого', sub: 'Остров в покое и плашки на нём: часы, музыка, уведомления', icon: Rows, type: 'slider', min: 70, max: 140, step: 5, suffix: '%' },
        { key: 'expandedScale', title: 'Размер раскрытого', sub: 'Остров с вкладками и всё, что в нём', icon: ArrowsOutSimple, type: 'slider', min: 70, max: 140, step: 5, suffix: '%' },
      ],
    },
    {
      id: 'focus',
      title: 'Фокус',
      desc: 'Уберите остров с дороги, когда он не нужен.',
      items: [
        { key: 'hideFullscreen', title: 'Прятать в полноэкранных приложениях', sub: 'Игры и видео на весь экран', icon: ArrowsOutSimple, type: 'toggle' },
      ],
    },
  ],
  appearance: [
    {
      id: 'theme',
      title: 'Тема',
      desc: 'Фон и настроение раскрытого острова.',
      custom: 'themes',
    },
    {
      id: 'accent',
      title: 'Акцент',
      desc: 'Цвет волны, прогресса и подсветки. Можно взять из обложки трека.',
      custom: 'accent',
    },
    {
      id: 'shape',
      title: 'Форма',
      desc: 'Геометрия и материал острова.',
      items: [
        { key: 'accentFollowTrack', title: 'Акцент под трек', sub: 'Когда играет музыка — цвет из обложки; в покое — ваш акцент', icon: MusicNote, type: 'toggle' },

        { key: 'roundness', title: 'Скругление', sub: 'Углы раскрытого острова', icon: SquaresFour, type: 'slider', min: 0, max: 100 },
        { key: 'edgeFade', title: 'Слияние с краем', sub: 'Вогнутые «плечи» в режиме у края', icon: Moon, type: 'slider', min: 0, max: 100 },
      ],
    },
    {
      id: 'live',
      title: 'Живые эффекты',
      desc: 'Живые эффекты под музыку.',
      pro: true,
      items: [
        { key: 'liveEdge', title: 'Живая кромка', sub: 'Нижний край раскрытого острова мягко колышется, под музыку — сильнее', icon: Sparkle, type: 'toggle' },
        { key: 'wavePower', title: 'Сила волны', sub: 'Высота волн и пульсации боков под музыку', icon: Waves, type: 'slider', min: 0, max: 200 },
      ],
    },
    {
      id: 'motion',
      title: 'Анимация',
      desc: 'Как остров появляется и исчезает.',
      items: [
        { key: 'anim', title: 'Раскрытие', sub: 'Наведите на вариант — он проиграется на картинке выше', icon: Sparkle, type: 'chips', options: ['Капля', 'Пружина', 'Плавно', 'Волна', 'Желе', 'Тянучка', 'Мяч', 'Резинка', 'Щелчок', 'Пузырь'] },
      ],
    },
    {
      id: 'material',
      title: 'Материал',
      desc: 'Дополнительные эффекты поверхности.',
      items: [
        { key: 'artworkTheme', title: 'Живой фон в цвет темы', sub: 'Медленные градиенты в раскрытом острове', icon: Palette, type: 'toggle' },
        { key: 'copyWave', title: 'Волна при копировании', sub: 'Световая волна по острову, когда текст скопирован', icon: Waves, type: 'toggle' },
      ],
    },
  ],
  music: [
    {
      id: 'player',
      title: 'Плеер',
      desc: 'Как выглядит раскрытый плеер.',
      items: [
        { key: 'playerBg', title: 'Фон плеера', sub: 'Без фона — чисто; Сияние — мягкий градиент от акцента; Обложка — размытая картинка трека', icon: Image, type: 'segmented', options: [{ value: 'Без фона', label: 'Без фона' }, { value: 'Сияние', label: 'Сияние' }, { value: 'Обложка', label: 'Обложка' }] },
        { key: 'playerAnim', title: 'Индикатор воспроизведения', sub: 'Эквалайзер рядом с названием трека', icon: Sparkle, type: 'segmented', options: [{ value: 'Без анимации', label: 'Нет' }, { value: 'Только пульс', label: 'Пульс' }, { value: 'Пульс и полоски', label: 'Полоски' }] },
      ],
    },
    {
      id: 'lyrics',
      title: 'Текст',
      desc: 'Синхронные строки ищутся на lrclib.net.',
      items: [
        { key: 'syncLyrics', title: 'Синхронный текст', sub: 'Строки подстраиваются под время трека', icon: TextAa, type: 'toggle' },
      ],
    },
  ],
  notifications: [
    {
      id: 'timing',
      title: 'Длительность',
      desc: 'Сколько плашка остаётся на экране.',
      items: [
        { key: 'notifDuration', title: 'Время показа', sub: 'Общее для всех событий', icon: Timer, type: 'slider', min: 0.5, max: 5, step: 0.1, suffix: ' с' },
      ],
    },

    {
      id: 'sources',
      title: 'События',
      desc: 'Выберите, о чём остров должен сообщать.',
      items: [
        { key: 'volumeNotif', title: 'Громкость', sub: 'Колесико над плашкой продолжает менять звук', icon: SpeakerHigh, type: 'toggle' },
        { key: 'batteryNotif', title: 'Батарея и зарядка', sub: 'Подключение питания и низкий заряд', icon: BatteryFull, type: 'toggle' },
        { key: 'capsNotif', title: 'Caps Lock', sub: 'Плашка на пару секунд при нажатии. Постоянный значок на свёрнутом острове — в «Остров»', icon: Keyboard, type: 'toggle' },
        { key: 'clipNotif', title: 'Копирование', sub: 'Что скопировано, и что с этим сделать: QR-код, в заметки, на полку, сохранить картинку', icon: Clipboard, type: 'toggle' },
        { key: 'downloadNotif', title: 'Загрузки', sub: 'То, что живёт на острове, пока идёт: прогресс скачивания, в конце — плашка с файлом', icon: DownloadSimple, type: 'toggle' },
      ],
    },
  ],
  focus: [
    {
      id: 'pomodoro',
      title: 'Помидор',
      desc: 'Длительности фаз и поведение таймера.',
      items: [
        { key: 'pomoWork', title: 'Работа', sub: 'Длительность рабочей фазы', icon: Timer, type: 'slider', min: 5, max: 60, suffix: ' мин' },
        { key: 'pomoShort', title: 'Короткий перерыв', sub: 'После каждого помидора', icon: Timer, type: 'slider', min: 1, max: 15, suffix: ' мин' },
        { key: 'pomoLong', title: 'Длинный перерыв', sub: 'После нескольких помидоров', icon: Timer, type: 'slider', min: 5, max: 40, suffix: ' мин' },
        { key: 'pomoUntilLong', title: 'Помидоров до длинного', sub: 'Сколько рабочих фаз до длинного перерыва', icon: ArrowCounterClockwise, type: 'slider', min: 2, max: 8, suffix: '' },
      ],
    },
    {
      id: 'pomo-behavior',
      title: 'Поведение',
      desc: 'Звук и автоматика таймера.',
      items: [
        { key: 'pomoSound', title: 'Звук завершения', sub: 'Сигнал по окончании фазы', icon: SpeakerHigh, type: 'toggle' },
        { key: 'pomoDND', title: 'Не беспокоить', sub: 'Глушить уведомления во время работы', icon: Bell, type: 'toggle' },
        { key: 'pomoAutoNext', title: 'Авто-переход', sub: 'Автоматически начинать следующую фазу', icon: ArrowCounterClockwise, type: 'toggle' },
      ],
    },
  ],
  experimental: [
    {
      id: 'musiclab',
      title: 'Музыка',
      desc: 'Живые эффекты, которые реагируют на воспроизведение.',
      items: [
        { key: 'expBeats', title: 'Пульс под биты', sub: 'Световая волна бежит внутри острова, пока играет музыка', icon: Sparkle, type: 'toggle' },
        { key: 'beatPower', title: 'Сила пульса', sub: 'Размер и яркость бегущей волны', icon: Waves, type: 'slider', min: 0, max: 200 },
      ],
    },
  ],
  help: [
    {
      id: 'help-basic',
      title: 'Основное',
      desc: '',
      helpItems: [
        { title: 'Раскрыть остров', sub: 'Наведите курсор на остров вверху экрана. Уведите — он свернётся сам. Раскрытие по клику и задержка — в «Остров»' },
        { title: 'Вкладки', sub: 'Вверху раскрытого острова. Порядок меняется: зажмите вкладку и перетащите. Лишние прячутся в разделе «Вкладки»' },
        { title: 'Настройки', sub: 'Шестерёнка справа от вкладок или значок Island в трее (у часов Windows)' },
        { title: 'Полноэкранные игры и видео', sub: 'Остров прячется сам, чтобы не мешать. Выключается в «Остров» → «Скрытие»' },
      ],
    },
    {
      id: 'help-mouse',
      title: 'Мышь: скрытые жесты',
      desc: '',
      helpItems: [
        { title: 'Правая кнопка мыши', sub: 'Открывает меню почти везде: у файлов на полке, закреплённых программ, задач, событий календаря. В «Буфере» — удаляет запись' },
        { title: 'Перетаскивание', sub: 'Файлы, брошенные на свёрнутый остров, попадают на «Полку». Программу или файл, брошенные на панель под часами (когда музыка не играет), остров закрепит' },
        { title: 'Колёсико', sub: 'Над линией громкости под треком и над плашкой громкости — меняет звук. Над строкой песни — сдвигает текст раньше или позже. Над закреплёнными программами — листает их' },
        { title: 'Двойной клик', sub: 'По дню в календаре — расписание этого дня' },
        { title: 'Полоса прогресса трека', sub: 'Клик и перетаскивание перематывает песню. Если плеер не принимает перемотку, полоса мигнет' },
      ],
    },
    {
      id: 'help-music',
      title: 'Музыка',
      desc: '',
      helpItems: [
        { title: 'Откуда берётся трек', sub: 'Из системного плеера Windows: Spotify, Яндекс Музыка, браузеры, Telegram — всё, что показывает обложку в меню громкости Windows. Яндекс Браузер — в «Экспериментальном»' },
        { title: 'Текст песни', sub: 'Ищется в открытых базах и подсвечивается по словам. Есть не для всех песен. Если строки спят или опаздывают — колёсико над строкой в плеере или «Сдвиг текста» в «Музыке»' },
        { title: 'Telegram и некоторые сайты', sub: 'Не сообщают длину трека: остров считает время сам, а перемотка с острова недоступна. Кнопки «назад» и «вперёд» тускнеют, когда листать некуда' },
      ],
    },
  ],
};

const CUSTOM_SEARCH = [
  { tab: 'appearance', anchor: 'theme', title: 'Темы оформления', sub: 'Классика, Минимал, Неон, Лес, Закат…', icon: Palette },
  { tab: 'appearance', anchor: 'accent', title: 'Акцент и свой цвет', sub: 'Палитра или цвет обложки', icon: Sparkle },
  { tab: 'tabs', anchor: 'tabs-list', title: 'Вкладки острова', sub: 'Буфер, полка, текст, погода', icon: SquaresFour },
  { tab: 'system', anchor: 'startup', title: 'Запускать вместе с Windows', sub: 'Автозапуск и тест запуска', icon: Desktop },
  { tab: 'system', anchor: 'integrations', title: 'Календарь и индикаторы приватности', sub: 'Интеграции Windows', icon: LockSimple },
  { tab: 'system', anchor: 'weather', title: 'Город для погоды', sub: 'Если погода не определилась сама', icon: Cloud },
];

const TAB_KEYS = {
  island: GROUPS.island.flatMap((g) => (g.items || []).map((i) => i.key)),
  appearance: [...GROUPS.appearance.flatMap((g) => (g.items || []).map((i) => i.key)), 'theme', 'accent', 'accentFollowTrack'],
  music: GROUPS.music.flatMap((g) => (g.items || []).map((i) => i.key)),
  notifications: GROUPS.notifications.flatMap((g) => (g.items || []).map((i) => i.key)),
  focus: GROUPS.focus.flatMap((g) => (g.items || []).map((i) => i.key)),
  tabs: ['hiddenTabs'],
  system: null,
  experimental: GROUPS.experimental.flatMap((g) => (g.items || []).map((i) => i.key)),
};

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

function formatValue(value, item) {
  if (item.step && item.step < 1) return Number(value).toFixed(1).replace('.', ',');
  return Math.round(Number(value));
}

function startupStatusLabel(status) {
  if (status === 'Valid') return 'включён';
  if (status === 'Broken path') return 'путь устарел';
  return 'не настроен';
}

function ResetButton({ onReset, label = 'Сбросить' }) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleClick = () => {
    if (armed) {
      clearTimeout(timerRef.current);
      setArmed(false);
      onReset();
      return;
    }
    setArmed(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setArmed(false), 2800);
  };

  return (
    <button
      type="button"
      className={cx('st-section__reset', armed && 'st-section__reset--primed')}
      onClick={handleClick}
    >
      {armed ? 'Точно?' : label}
    </button>
  );
}

function Row({ icon: Icon, title, sub, children, stacked, soon }) {
  return (
    <div className={cx('st-row', stacked && 'st-row--stacked')}>
      {Icon && (
        <div className="st-row__icon">
          <Icon size={17} />
        </div>
      )}
      <div className="st-row__text">
        <div className="st-row__title">
          {title}
          {soon && <span className="st-badge">в разработке</span>}
        </div>
        {sub && <div className="st-row__sub">{sub}</div>}
      </div>
      <div className="st-row__control">{children}</div>
    </div>
  );
}

function Switch({ value, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!value}
      disabled={disabled}
      className={cx('st-switch', value && 'st-switch--on')}
      onClick={() => !disabled && onChange(!value)}
    />
  );
}

function Segmented({ value, options, onChange, disabled }) {
  return (
    <div className="st-seg">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          className={cx('st-seg__item', value === opt.value && 'st-seg__item--active')}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ value, item, onChange, disabled }) {
  const percent = ((value - item.min) / (item.max - item.min)) * 100;
  return (
    <div className="st-slider">
      <input
        type="range"
        className="st-slider__range"
        min={item.min}
        max={item.max}
        step={item.step || 1}
        value={value}
        disabled={disabled}
        style={{ '--p': `${percent}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="st-slider__value">
        {formatValue(value, item)}
        {item.suffix || '%'}
      </span>
    </div>
  );
}

export const DisplaysContext = React.createContext([]);

function DisplayPicker({ value, onChange, disabled }) {
  const displays = React.useContext(DisplaysContext);
  if (!displays.length) return <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Нет доступных мониторов</span>;
  const primary = displays.find((d) => d.primary) || displays[0];
  const active = displays.some((d) => d.id === value) ? value : primary.id;
  const options = displays.map((d) => ({
    value: d.id,
    label: `${d.label} · ${d.width}×${d.height}${d.primary ? ' · основной' : ''}`,
  }));
  return <Segmented value={active} options={options} onChange={onChange} disabled={disabled} />;
}

function Chips({ value, options, onChange, disabled }) {
  const isMulti = Array.isArray(value);
  return (
    <div className="st-chips">
      {options.map((opt) => {
        const isActive = isMulti ? value.includes(opt) : value === opt;
        return (
        <button
          key={opt}
          type="button"
          disabled={disabled}
          className={cx('st-chip', isActive && 'st-chip--active')}
          onClick={() => {
            if (isMulti) {
              const next = isActive ? value.filter((v) => v !== opt) : [...value, opt];
              onChange(next);
            } else {
              onChange(opt);
            }
          }}
        >
          {opt}
        </button>
      )})}
    </div>
  );
}

function SettingRow({ item, value, onChange }) {
  const disabled = !!item.soon;
  const stacked = item.type === 'chips';
  const control = (() => {
    if (item.type === 'toggle') return <Switch value={value} onChange={onChange} disabled={disabled} />;
    if (item.type === 'segmented') return <Segmented value={value} options={item.options} onChange={onChange} disabled={disabled} />;
    if (item.type === 'slider') return <Slider value={value} item={item} onChange={onChange} disabled={disabled} />;
    if (item.type === 'chips') {
      return <Chips value={value} options={item.options} onChange={onChange} disabled={disabled} />;
    }
    if (item.type === 'display') {
      return <DisplayPicker value={value} onChange={onChange} disabled={disabled} />;
    }
    return null;
  })();

  return (
    <Row icon={item.icon} title={item.title} sub={item.sub} stacked={stacked} soon={item.soon}>
      {control}
    </Row>
  );
}

function SchemaSection({ tabId, group, values, onChange, onReset, index }) {
  const items = group.items || [];
  return (
    <section id={`sec-${tabId}-${group.id}`} className="st-section" style={{ '--i': index }}>
      <div className="st-section__head">
        <div>
          <div className="st-section__title">{group.title}</div>
          {group.desc && <div className="st-section__desc">{group.desc}</div>}
        </div>
        {onReset && <ResetButton onReset={onReset} />}
      </div>
      {items.map((item) => (
        <SettingRow
          key={item.key}
          item={item}
          value={values[item.key]}
          onChange={(v) => onChange(item.key, v)}
        />
      ))}
    </section>
  );
}

function ThemePicker({ value, onChange, customThemes = [], onCreate, onDelete, onEdit }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const all = [...THEMES, ...(customThemes || [])];

  const create = (theme) => {
    onCreate?.(theme);
    setOpen(false);
  };

  const pick = (theme) => {
    onChange?.(theme.name, theme);
  };

  return (
    <>
      <div className="st-themes">
        {all.map((theme) => {
          const active = value === theme.name;
          const isCustom = customThemes?.some((t) => t.name === theme.name);
          return (
            <button
              key={theme.name}
              type="button"
              className={cx('st-theme', active && 'st-theme--active')}
              onClick={() => pick(theme)}
              onContextMenu={(e) => { if (isCustom) { e.preventDefault(); onDelete?.(theme.name); } }}
              title={isCustom ? `${theme.name} (ПКМ — удалить)` : theme.name}
            >
              <div className="st-theme__stage" style={{ background: theme.bg }}>
                <div className="st-theme__pill">
                  <span className="st-theme__dot" style={{ background: theme.dot }} />
                  <span className="st-theme__bars" style={{ color: theme.dot }}>
                    <i style={{ height: 4 }} />
                    <i style={{ height: 7 }} />
                    <i style={{ height: 5 }} />
                  </span>
                </div>
              </div>
              <span className="st-theme__name">{theme.name}</span>
              {active && (
                <span className="st-theme__check">
                  <Check size={10} weight="bold" />
                </span>
              )}
              {isCustom && (
                <span
                  className="st-theme__edit"
                  role="button"
                  tabIndex={0}
                  title="Редактировать тему"
                  onClick={(e) => { e.stopPropagation(); setEditing({ ...theme, oldName: theme.name }); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setEditing({ ...theme, oldName: theme.name }); } }}
                >
                  <PencilSimple size={11} />
                </span>
              )}
            </button>
          );
        })}
        <button type="button" className="st-theme st-theme--add" onClick={() => setOpen((o) => !o)} title="Своя тема">
          <span className="st-theme__plus">+</span>
          <span className="st-theme__name">Своя тема</span>
        </button>
      </div>
      {open && (
        <ThemeCreatorModal onClose={() => setOpen(false)} onSave={create} />
      )}
      {editing && (
        <ThemeCreatorModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(theme) => { onEdit?.({ ...theme, oldName: editing.oldName }); setEditing(null); }}
        />
      )}
    </>
  );
}

function HotkeyInput({ icon: Icon, title, value, onSave }) {
  const [capturing, setCapturing] = useState(false);
  const btnRef = useRef(null);

  // When capturing, listen on window so any modifier combination is caught.
  useEffect(() => {
    if (!capturing) return undefined;
    const onKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Ignore bare modifier presses — wait for the actual key.
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      if (e.key === 'Escape') { setCapturing(false); return; }

      const mods = [];
      if (e.ctrlKey) mods.push('Control'); // Electron prefers 'Control'
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Shift');
      if (e.metaKey) mods.push('Super');

      // Use e.code to get the physical key, independent of keyboard layout (EN/RU)
      let main = e.code;
      if (main.startsWith('Key')) main = main.slice(3); // 'KeyM' -> 'M'
      else if (main.startsWith('Digit')) main = main.slice(5); // 'Digit1' -> '1'
      else if (main.startsWith('Numpad')) main = main.slice(6); // 'Numpad1' -> 'num1'
      else {
        const MAP = {
          ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
          Space: 'Space', Slash: '/', Backslash: '\\', Comma: ',', Period: '.',
          Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
          Minus: '-', Equal: '=', Backquote: '`',
          Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
          Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
        };
        main = MAP[main] || main;
      }

      const accel = [...mods, main].join('+');
      onSave(accel);
      setCapturing(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturing, onSave]);

  return (
    <Row icon={Icon} title={title} sub={capturing ? 'Нажмите клавишу или сочетание… (Esc — отмена)' : (value ? `${value}${(!value.includes('+') && /^[A-Za-z0-9]$/.test(value)) ? ' · только когда остров в фокусе' : ''}` : 'не задано')}>
      <button
        type="button"
        ref={btnRef}
        className={cx('st-btn', capturing && 'st-btn--capturing')}
        onClick={() => setCapturing((c) => !c)}
      >
        {capturing ? 'Слушаю…' : (value || 'Изменить')}
      </button>
    </Row>
  );
}

function AccentPicker({ value, onChange }) {
  const isAuto = value === 'auto';
  const isPreset = ACCENTS.includes(value);
  const custom = isAuto ? '#3b82f6' : (value || '#3b82f6');
  return (
    <div className="st-accent">
      <div className="st-swatches">
        {ACCENTS.map((color) => (
          <button
            key={color}
            type="button"
            className={cx('st-swatch', value === color && 'st-swatch--active')}
            style={{ background: color }}
            title={color}
            aria-label={color}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
      {/* Custom color: only shown as a distinct chip when the current value is
          NOT one of the presets, so the same colour is never shown twice. */}
      <div className="st-accent__custom">
        <label
          className={cx('st-color', !isPreset && !isAuto && 'st-color--filled')}
          style={!isPreset && !isAuto ? { background: custom } : undefined}
          title="Свой цвет"
        >
          <input type="color" value={custom} onChange={(e) => onChange(e.target.value)} />
          {isPreset || isAuto ? <span className="st-color__pipette" aria-hidden="true">＋</span> : null}
        </label>
        <span className="st-color__label">
          {isAuto ? 'В цвет трека' : (isPreset ? 'Свой цвет' : custom.toUpperCase())}
        </span>
      </div>
    </div>
  );
}

function CityInput({ value, onSave }) {
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (next !== (value || '')) onSave(next);
  };

  return (
    <div className="st-input">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        placeholder="Москва"
        spellCheck={false}
      />
      <button type="button" className="st-btn" onClick={commit}>
        Сохранить
      </button>
    </div>
  );
}

function IslandPreview({ values, expanded, onToggle }) {
  const theme = THEMES.find((t) => t.name === values.theme) || THEMES[0];
  const auto = values.accent === 'auto';
  const accent = auto ? '#ff4d9d' : values.accent || '#3b82f6';
  const radius = Math.round(((values.roundness ?? 75) / 100) * 32);
  const scale = Math.max(0.75, Math.min(1.12, (values.scale ?? 100) / 100));
  const attached = values.displayMode === 'attached';
  const shadows = [];
  if (values.shadow !== false) shadows.push('0 18px 44px rgba(0,0,0,0.62)');
  if (values.lightBorder !== false) shadows.push('inset 0 1px 0 rgba(255,255,255,0.1)');
  const showLyric = values.pillLyric !== false && values.syncLyrics !== false;

  return (
    <section className="st-preview" style={{ '--i': 0 }}>
      <div className="st-preview__head">
        <span className="st-preview__title">Живое превью</span>
        <div className="st-preview__toggle">
          <button type="button" className={!expanded ? 'is-active' : ''} onClick={() => expanded && onToggle()}>
            Свёрнут
          </button>
          <button type="button" className={expanded ? 'is-active' : ''} onClick={() => !expanded && onToggle()}>
            Раскрыт
          </button>
        </div>
      </div>
      <div className="st-preview__stage">
        <div
          className={cx(
            'st-mini',
            expanded ? 'st-mini--expanded' : 'st-mini--collapsed',
            attached && 'st-mini--attached',
          )}
          style={{
            background: theme.bg,
            borderRadius: attached ? `0 0 ${Math.round(radius * Math.min(1, (values.edgeFade ?? 100) / 100))}px ${Math.round(radius * Math.min(1, (values.edgeFade ?? 100) / 100))}px` : radius,
            boxShadow: shadows.join(', ') || 'none',
            transform: `scale(${scale})`,
          }}
        >
          {!expanded ? (
            <>
              <span className="st-mini__art" style={{ background: `linear-gradient(135deg, ${accent}, #ff4d9d)` }} />
              <span className="st-mini__line">
                {showLyric ? 'И я снова пою этот припев' : 'Название трека'}
              </span>
              <span className="st-mini__wave" style={{ color: accent }}>
                <i />
                <i />
                <i />
                <i />
              </span>
            </>
          ) : (
            <>
              <div className="st-mini__top">
                <span className="st-mini__art st-mini__art--lg" style={{ background: `linear-gradient(135deg, ${accent}, #ff4d9d)` }} />
                <div className="st-mini__meta">
                  <div className="st-mini__title">Название трека</div>
                  <div className="st-mini__sub">Исполнитель</div>
                </div>
                <span className="st-mini__wave" style={{ color: accent }}>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className="st-mini__bar">
                <span style={{ background: accent }} />
              </div>
            </>
          )}
        </div>
      </div>
      <div className="st-preview__note">
        <strong>{theme.name}</strong>
        {' · '}
        {auto ? 'акцент в цвет обложки' : `акцент ${accent.toUpperCase()}`}
        {' · '}
        масштаб {values.scale ?? 100}%
      </div>
    </section>
  );
}

function SettingsWindow() {
  const [tab, setTab] = useState('island');
  const [values, setValues] = useState(DEFAULTS_FALLBACK);
  const [defaults, setDefaults] = useState(DEFAULTS_FALLBACK);
  const [query, setQuery] = useState('');
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [startup, setStartup] = useState({ configEnabled: false, isDev: false, systemStatus: 'Missing' });
  const [calendar, setCalendar] = useState(false);
  const [privacy, setPrivacy] = useState(true);
  const [ready, setReady] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    window.electronAPI?.updateState?.().then((u) => { if (u) setUpdateInfo(u); });
    const unsub = window.electronAPI?.onUpdateAvailable?.((u) => { if (u) setUpdateInfo(u); });
    return () => unsub?.();
  }, []);

  const searchRef = useRef(null);
  const toastTimerRef = useRef(null);
  const mainRef = useRef(null);

  const flash = useCallback((message) => {
    setToastMsg(message || 'Сохранено');
    setToastVisible(true);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 1500);
  }, []);

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const api = window.electronAPI;
      const [all, defs, mode, startupStatus, calendarStatus, privacyStatus] = await Promise.all([
        api?.settingsGetAll?.(),
        api?.settingsGetDefaults?.(),
        api?.getDisplayMode?.(),
        api?.getStartupStatus?.(),
        api?.getCalendarStatus?.(),
        api?.getPrivacyStatus?.(),
      ]);
      if (!alive) return;

      const nextDefaults = { ...DEFAULTS_FALLBACK, ...(defs || {}) };
      setDefaults(nextDefaults);
      setValues({
        ...nextDefaults,
        ...(all || {}),
        ...(mode ? { displayMode: mode } : null),
      });
      if (startupStatus) setStartup(startupStatus);
      if (typeof calendarStatus === 'boolean') setCalendar(calendarStatus);
      if (typeof privacyStatus === 'boolean') setPrivacy(privacyStatus);
      setReady(true);
    })();

    const unsubSettings = window.electronAPI?.onSettingsUpdate?.(({ key, value }) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    });
    const unsubMode = window.electronAPI?.onDisplayModeChanged?.((mode) => {
      setValues((prev) => ({ ...prev, displayMode: mode }));
    });

    return () => {
      alive = false;
      unsubSettings?.();
      unsubMode?.();
    };
  }, []);

  const applyValues = useCallback((patch, message) => {
    setValues((prev) => ({ ...prev, ...patch }));
    const api = window.electronAPI;
    Object.entries(patch).forEach(([key, value]) => {
      if (key === 'displayMode') api?.setDisplayMode?.(value);
      if (key === 'islandDisplay') api?.settingsSet?.('islandDisplay', value);
      else if (key === 'city') {
        api?.settingsSet?.(key, value);
        api?.setWeatherCity?.(value);
      } else {
        if (key === 'playerVolume') api?.setVolume?.(value);
        api?.settingsSet?.(key, value);
      }
    });
    if (message !== false) flash(typeof message === 'string' ? message : 'Сохранено');
  }, [flash]);

  const setValue = useCallback((key, value) => {
    applyValues({ [key]: value });
  }, [applyValues]);

  const resetKeys = useCallback((keys, message = 'Раздел сброшен') => {
    const patch = {};
    keys.forEach((key) => {
      patch[key] = defaults[key];
    });
    applyValues(patch, message);
  }, [applyValues, defaults]);

  const resetAll = useCallback(() => {
    applyValues({ ...defaults }, 'Все настройки сброшены');
    setConfirmReset(false);
  }, [applyValues, defaults]);

  const openTab = useCallback((nextTab, anchor) => {
    setQuery('');
    setTab(nextTab);
    requestAnimationFrame(() => {
      if (!anchor) {
        mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const el = document.getElementById(`sec-${nextTab}-${anchor}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === 'k' || key === 'f')) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleStartup = useCallback(async (next) => {
    if (startup.isDev) {
      flash('Автозапуск доступен в установленной версии');
      return;
    }
    setStartup((prev) => ({ ...prev, configEnabled: next }));
    await window.electronAPI?.toggleStartup?.(next);
    const status = await window.electronAPI?.getStartupStatus?.();
    if (status) setStartup(status);
    flash(next ? 'Автозапуск включён' : 'Автозапуск выключен');
  }, [startup.isDev, flash]);

  const toggleCalendar = useCallback(async (next) => {
    setCalendar(next);
    await window.electronAPI?.toggleCalendarIntegration?.(next);
    flash(next ? 'Календарь подключён' : 'Календарь отключён');
  }, [flash]);

  const togglePrivacy = useCallback(async (next) => {
    setPrivacy(next);
    await window.electronAPI?.togglePrivacyIndicators?.(next);
    flash(next ? 'Индикаторы включены' : 'Индикаторы выключены');
  }, [flash]);

  const toggleIslandTab = useCallback((id) => {
    const current = Array.isArray(values.hiddenTabs) ? values.hiddenTabs : [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setValue('hiddenTabs', next);
  }, [values.hiddenTabs, setValue]);

  const searchIndexData = useMemo(() => buildSearchIndex({
    tabMeta: TAB_META,
    groups: GROUPS,
    customSearch: CUSTOM_SEARCH,
    islandTabs: ISLAND_TABS,
    systemEntries: [
      { tab: 'system', anchor: 'startup', title: 'Запускать вместе с Windows', sub: 'Автозапуск' },
      { tab: 'system', anchor: 'weather', title: 'Город для погоды', sub: 'Если погода не определилась сама' },
      { tab: 'system', anchor: 'integrations', title: 'Календарь и приватность', sub: 'Интеграции Windows' },
      { tab: 'system', anchor: 'discord', title: 'Discord Rich Presence', sub: 'Показывать трек в профиле Discord' },
    ],
  }), []);

  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    const raw = searchIndex(searchIndexData, query);
    if (!raw.length) return [];

    // Group flat results by tab, preserving tab order.
    const grouped = new Map();
    for (const entry of raw) {
      if (!grouped.has(entry.tab)) grouped.set(entry.tab, []);
      grouped.get(entry.tab).push(entry);
    }

    return TAB_META
      .filter((meta) => grouped.has(meta.id))
      .map((meta) => ({ meta, entries: grouped.get(meta.id) }));
  }, [query, searchIndexData]);

  const activeMeta = TAB_META.find((t) => t.id === tab) || TAB_META[0];
  const uiAccent = values.accent && values.accent !== 'auto' ? values.accent : '#3b82f6';
  const tabKeys = TAB_KEYS[tab];
  const showSaved = toastVisible && toastMsg === 'Сохранено';

  const renderTabContent = () => {
    if (tab === 'appearance') {
      return (
        <>
          <IslandPreview values={values} expanded={previewExpanded} onToggle={() => setPreviewExpanded((v) => !v)} />
          <section id="sec-appearance-theme" className="st-section" style={{ '--i': 1 }}>
            <div className="st-section__head">
              <div>
                <div className="st-section__title">Тема</div>
                <div className="st-section__desc">Фон и настроение раскрытого острова.</div>
              </div>
              <ResetButton onReset={() => resetKeys(['theme'])} />
            </div>
            <ThemePicker
              value={values.theme}
              onChange={(name, theme) => {
                setValue('theme', name);
                // A custom theme carries its own accent — apply it so the
                // accent picker and the island match the chosen theme.
                if (theme && theme.dot && (values.customThemes || []).some((t) => t.name === name)) {
                  setValue('accent', theme.dot);
                }
              }}
              customThemes={values.customThemes || []}
              onCreate={(theme) => {
                const next = [...(values.customThemes || []), theme];
                setValue('customThemes', next);
                setValue('theme', theme.name);
                if (theme.dot) setValue('accent', theme.dot);
              }}
              onDelete={(name) => {
                const next = (values.customThemes || []).filter((t) => t.name !== name);
                setValue('customThemes', next);
                if (values.theme === name) setValue('theme', 'Классика');
              }}
              onEdit={(theme) => {
                const next = (values.customThemes || []).map((t) => (t.name === theme.oldName || t.name === theme.name ? { ...t, ...theme } : t));
                setValue('customThemes', next);
                if (values.theme === theme.name && theme.dot) setValue('accent', theme.dot);
              }}
            />
          </section>
          <section id="sec-appearance-accent" className="st-section" style={{ '--i': 2 }}>
            <div className="st-section__head">
              <div>
                <div className="st-section__title">Акцент</div>
                <div className="st-section__desc">Цвет волны, прогресса и подсветки. Можно взять из обложки трека.</div>
              </div>
              <ResetButton onReset={() => resetKeys(['accent'])} />
            </div>
            <div style={{ padding: '10px 20px 20px' }}>
              <AccentPicker value={values.accent} onChange={(v) => setValue('accent', v)} />
            </div>
          </section>
          {GROUPS.appearance.filter((g) => g.items).map((group, i) => (
            <SchemaSection
              key={group.id}
              tabId="appearance"
              group={group}
              values={values}
              onChange={setValue}
              onReset={() => resetKeys(group.items.map((item) => item.key))}
              index={i + 3}
            />
          ))}
        </>
      );
    }

    if (tab === 'tabs') {
      return (
        <section id="sec-tabs-tabs-list" className="st-section" style={{ '--i': 0 }}>
          <div className="st-section__head">
            <div>
              <div className="st-section__title">Мои вкладки</div>
              <div className="st-section__desc">Скрытые вкладки исчезают из меню острова. Плеер остаётся всегда.</div>
            </div>
            <ResetButton onReset={() => resetKeys(['hiddenTabs'])} />
          </div>
          <div className="st-tablist">
            {ISLAND_TABS.map((islandTab) => {
              const hidden = (Array.isArray(values.hiddenTabs) ? values.hiddenTabs : []).includes(islandTab.id);
              const Icon = islandTab.icon;
              return (
                <div key={islandTab.id} className="st-tablist__item">
                  <span className="st-tablist__drag">
                    <Rows size={15} />
                  </span>
                  <span className="st-row__icon" style={{ width: 32, height: 32 }}>
                    <Icon size={15} />
                  </span>
                  <span className="st-tablist__name">{islandTab.label}</span>
                  {islandTab.fixed ? (
                    <span className="st-tablist__fixed">всегда</span>
                  ) : (
                    <Switch value={!hidden} onChange={() => toggleIslandTab(islandTab.id)} />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    if (tab === 'help') {
      return GROUPS.help.map((group, i) => (
        <section id={`sec-help-${group.id}`} className="st-section" style={{ '--i': i }} key={group.id}>
          <div className="st-section__head">
            <div>
              <div className="st-section__title">{group.title}</div>
            </div>
          </div>
          {group.helpItems.map((item, idx) => (
            <div className="st-row" key={idx}>
              <div className="st-row__text">
                <div className="st-row__title">{item.title}</div>
                <div className="st-row__sub">{item.sub}</div>
              </div>
            </div>
          ))}
        </section>
      ));
    }

    if (tab === 'system') {
      return (
        <>
          <section id="sec-system-hotkeys" className="st-section" style={{ '--i': 0 }}>
            <div className="st-section__head">
              <div>
                <div className="st-section__title">Горячие клавиши</div>
                <div className="st-section__desc">Глобальные сочетания, работают из любого приложения. Формат: Control+Alt+I</div>
              </div>
            </div>
            <HotkeyInput
              icon={Keyboard}
              title="Показать/скрыть остров"
              value={values.hotkeyToggle}
              onSave={(v) => setValue('hotkeyToggle', v)}
            />
            <HotkeyInput
              icon={MusicNote}
              title="Играть/пауза"
              value={values.hotkeyPlayPause}
              onSave={(v) => setValue('hotkeyPlayPause', v)}
            />
          </section>

          <section id="sec-system-startup" className="st-section" style={{ '--i': 1 }}>
            <div className="st-section__head">
              <div>
                <div className="st-section__title">Запуск</div>
                <div className="st-section__desc">Стартуйте вместе с Windows, не открывая лишних окон.</div>
              </div>
            </div>
            <Row
              icon={Desktop}
              title="Запускать вместе с Windows"
              sub={startup.isDev ? 'Доступно только в установленной версии' : `Состояние: ${startupStatusLabel(startup.systemStatus)}`}
              soon={startup.isDev}
            >
              <Switch value={!!startup.configEnabled} onChange={toggleStartup} disabled={startup.isDev} />
            </Row>
            {!startup.isDev && (
              <Row icon={Lightning} title="Проверить запуск" sub="Запустить копию приложения свёрнутой">
                <button
                  type="button"
                  className="st-btn"
                  onClick={async () => {
                    await window.electronAPI?.testStartup?.();
                    flash('Тестовый запуск выполнен');
                  }}
                >
                  Проверить
                </button>
              </Row>
            )}
          </section>

          <section id="sec-system-integrations" className="st-section" style={{ '--i': 1 }}>
            <div className="st-section__head">
              <div>
                <div className="st-section__title">Интеграции</div>
                <div className="st-section__desc">Системные события Windows, которые умеет показывать остров.</div>
              </div>
            </div>
            <Row icon={LockSimple} title="Индикаторы приватности" sub="Точки камеры и микрофона рядом с островом">
              <Switch value={privacy} onChange={togglePrivacy} />
            </Row>
          </section>

          <section id="sec-system-discord" className="st-section" style={{ '--i': 1 }}>
            <div className="st-section__head">
              <div>
                <div className="st-section__title">Discord</div>
                <div className="st-section__desc">Показывать текущий трек в профиле Discord.</div>
              </div>
              <ResetButton onReset={() => resetKeys(['discordRPC'])} />
            </div>
            <Row icon={Sparkle} title="Discord Rich Presence" sub="Название трека и исполнитель в статусе Discord">
              <Switch value={!!values.discordRPC} onChange={(v) => setValue('discordRPC', v)} />
            </Row>
          </section>

          <section id="sec-system-weather" className="st-section" style={{ '--i': 2 }}>
            <div className="st-section__head">
              <div>
                <div className="st-section__title">Погода</div>
                <div className="st-section__desc">Если город не определился автоматически, укажите его вручную.</div>
              </div>
              <ResetButton onReset={() => resetKeys(['city'])} />
            </div>
            <Row icon={Cloud} title="Город" sub="Название на русском или английском">
              <CityInput value={values.city} onSave={(v) => setValue('city', v)} />
            </Row>
          </section>
        </>
      );
    }

    return GROUPS[tab].map((group, i) => (
      <SchemaSection
        key={group.id}
        tabId={tab}
        group={group}
        values={values}
        onChange={setValue}
        onReset={group.items ? () => resetKeys(group.items.map((item) => item.key)) : null}
        index={i}
      />
    ));
  };

  return (
    <div className="st-app" style={{ '--accent': uiAccent }}>
      <div className="st-titlebar">
        <span className="st-titlebar__mark" />
        <span className="st-titlebar__title">Istel</span>
        <span className="st-titlebar__crumb">{query.trim() ? 'Поиск' : activeMeta.label}</span>
        <span className="st-titlebar__spacer" />
        <span className={cx('st-titlebar__status', showSaved && 'st-titlebar__status--visible')}>
          <i />
          Сохранено
        </span>
      </div>

      <div className="st-body">
        <aside className="st-sidebar">
          <div className="st-brand">
            <img className="st-brand__logo" src="./icon.png" alt="Istel" style={{ objectFit: 'cover' }} />
            <div>
              <div className="st-brand__name">Istel</div>
              <div className="st-brand__sub">Настройки</div>
            </div>
          </div>

          <div className="st-search">
            <MagnifyingGlass size={15} className="st-search__icon" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти настройку"
              spellCheck={false}
            />
            <kbd>Ctrl K</kbd>
          </div>

          <nav className="st-nav">
            <div className="st-nav__label">Основное</div>
            {TAB_META.slice(0, 4).map((item) => {
              const Icon = item.icon;
              const active = tab === item.id && !query;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cx('st-nav__item', active && 'st-nav__item--active')}
                  onClick={() => openTab(item.id)}
                >
                  <Icon size={17} weight={active ? 'fill' : 'regular'} />
                  {item.label}
                </button>
              );
            })}
            <div className="st-nav__label">Дополнительно</div>
            {TAB_META.slice(4).map((item) => {
              const Icon = item.icon;
              const active = tab === item.id && !query;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cx('st-nav__item', active && 'st-nav__item--active')}
                  onClick={() => openTab(item.id)}
                >
                  <Icon size={17} weight={active ? 'fill' : 'regular'} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {updateInfo && updateInfo.available && (
            <div
              style={{ margin: '8px 8px 0', padding: '10px', borderRadius: '10px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)' }}
            >
              <div style={{ fontSize: '11px', color: '#93c5fd', fontWeight: 600, marginBottom: '2px' }}>Доступно обновление</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>v{updateInfo.latest}</div>
              <button
                type="button"
                className="st-btn st-btn--accent"
                style={{ width: '100%', height: '28px', fontSize: '11px' }}
                onClick={() => window.electronAPI?.openExternal?.(updateInfo.url || 'https://github.com/rud1x/Istel/releases/latest')}
              >
                Скачать
              </button>
            </div>
          )}
          <div className="st-sidebar__footer">
            <span className="st-sidebar__version">v{updateInfo?.current || '1.1.0'}</span>
            <button type="button" className="st-linkbtn" onClick={() => setConfirmReset(true)}>
              Сбросить всё
            </button>
          </div>
        </aside>

        <main className="st-main" ref={mainRef}>
          <div className="st-content">
            {query ? (
              <>
                <div className="st-head">
                  <div>
                    <div className="st-head__eyebrow">Поиск</div>
                    <h1>Результаты</h1>
                    <p>
                      {searchResults && searchResults.length
                        ? `Найдено по запросу «${query.trim()}»`
                        : `Ничего не найдено по запросу «${query.trim()}»`}
                    </p>
                  </div>
                  <div className="st-head__actions">
                    <button type="button" className="st-btn" onClick={() => setQuery('')}>
                      <X size={14} />
                      Очистить
                    </button>
                  </div>
                </div>

                {searchResults && searchResults.length ? (
                  searchResults.map(({ meta, entries }, groupIndex) => (
                    <section key={meta.id} className="st-section" style={{ '--i': groupIndex }}>
                      <div className="st-section__head">
                        <div>
                          <div className="st-section__title">{meta.label}</div>
                          <div className="st-section__desc">{meta.kicker}</div>
                        </div>
                      </div>
                      {entries.map((entry, entryIndex) => {
                        if (entry.kind === 'setting' && entry.item) {
                          return (
                            <SettingRow
                              key={`${meta.id}-${entry.item.key}-${entryIndex}`}
                              item={entry.item}
                              value={values[entry.item.key]}
                              onChange={(v) => setValue(entry.item.key, v)}
                            />
                          );
                        }
                        // Navigation entry (tab/group title).
                        return (
                          <Row key={`${meta.id}-nav-${entryIndex}`} icon={MagnifyingGlass} title={entry.title} sub={entry.sub}>
                            <button type="button" className="st-btn" onClick={() => openTab(entry.tab, entry.anchor)}>
                              Открыть
                              <CaretRight size={12} />
                            </button>
                          </Row>
                        );
                      })}
                    </section>
                  ))
                ) : (
                  <div className="st-empty">
                    <MagnifyingGlass size={26} />
                    <strong>Попробуйте другой запрос</strong>
                    <span>Например: «акцент», «батарея», «тема», «город».</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="st-head">
                  <div>
                    <div className="st-head__eyebrow">{activeMeta.kicker}</div>
                    <h1>{activeMeta.label}</h1>
                    <p>{activeMeta.desc}</p>
                  </div>
                  <div className="st-head__actions">
                    {tabKeys && (
                      <ResetButton label="Сбросить раздел" onReset={() => resetKeys(tabKeys, 'Раздел сброшен')} />
                    )}
                  </div>
                </div>

                {!ready ? (
                  <div className="st-empty">
                    <SlidersHorizontal size={26} />
                    <span>Загружаем настройки…</span>
                  </div>
                ) : (
                  renderTabContent()
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <div className={cx('st-toast', toastVisible && 'st-toast--visible')}>
        <CheckCircle size={16} weight="fill" />
        {toastMsg || 'Сохранено'}
      </div>

      {confirmReset && (
        <div className="st-modal" onMouseDown={(e) => e.target === e.currentTarget && setConfirmReset(false)}>
          <div className="st-modal__card">
            <div className="st-modal__title">Сбросить все настройки?</div>
            <div className="st-modal__text">
              Оформление, поведение острова, вкладки и уведомления вернутся к значениям по умолчанию.
              Автозапуск и системные интеграции останутся как есть.
            </div>
            <div className="st-modal__actions">
              <button type="button" className="st-btn" onClick={() => setConfirmReset(false)}>
                Отмена
              </button>
              <button type="button" className="st-btn st-btn--danger" onClick={resetAll}>
                <ArrowCounterClockwise size={14} />
                Сбросить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsWindow;
