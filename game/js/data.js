'use strict';
// ===== Типы урона =====
// Q — магия, W — физический, E — психический
const TYPES = {
  Q: { key: 'Q', name: 'Магия',       short: 'МАГ', color: '#c08bff', icon: '✦' },
  W: { key: 'W', name: 'Физический',  short: 'ФИЗ', color: '#ffa148', icon: '▲' },
  E: { key: 'E', name: 'Психический', short: 'ПСИ', color: '#4fe3ff', icon: '◉' },
};
const TYPE_KEYS = ['Q', 'W', 'E'];

// ===== Мобы =====
// mult — множитель урона по типу: 2 = уязвим, 0.5 = стойкий, 0 = иммунитет
const MOB_KINDS = {
  slime: {
    name: 'Слизень', look: { shape: 'blob', color: '#6fd66f', eyes: true }, hp: 26, atk: 5, atkType: 'W', xp: 8, gold: [1, 4],
    mult: { Q: 1, W: 2, E: 0 },
    trait: { id: 'regen', name: 'Регенерация', desc: 'В начале своего хода восстанавливает 6% HP' },
    desc: 'Безмозглая жижа. Психика на неё не действует, зато рубится отлично.',
  },
  wolf: {
    name: 'Волк', look: { shape: 'triangle', color: '#a3abbd', eyes: true }, hp: 32, atk: 7, atkType: 'W', xp: 11, gold: [2, 5],
    mult: { Q: 0.75, W: 1, E: 2 },
    trait: { id: 'double', name: 'Двойной укус', desc: '30% шанс атаковать дважды подряд' },
    desc: 'Зверь, живущий инстинктами. Боится ментального давления.',
  },
  shroom: {
    name: 'Гриболюд', look: { shape: 'pentagon', color: '#d36be0', eyes: true }, hp: 30, atk: 6, atkType: 'E', xp: 10, gold: [1, 6],
    mult: { Q: 2, W: 0.75, E: 0.5 },
    trait: { id: 'spores', name: 'Споры', desc: 'После его удара в вашем следующем коде 3 буквы скрыты (виден только цвет)' },
    desc: 'Споры туманят разум. Сгорает от магии.',
  },
  scorpion: {
    name: 'Скорпион', look: { shape: 'diamond', color: '#e4a43c', eyes: true }, hp: 34, atk: 8, atkType: 'W', xp: 12, gold: [2, 7],
    mult: { Q: 0.75, W: 2, E: 1 },
    trait: { id: 'poison', name: 'Яд', desc: 'Пропущенный удар отравляет: урон в начале ваших 3 ходов' },
    desc: 'Панцирь трескается от сильных ударов.',
  },
  fire: {
    name: 'Огненный дух', look: { shape: 'drop', color: '#ff6a3d', eyes: true }, hp: 28, atk: 9, atkType: 'Q', xp: 13, gold: [3, 8],
    mult: { Q: 0.5, W: 0.75, E: 2 },
    trait: { id: 'heat', name: 'Жар', desc: 'На ваши коды атаки на 25% меньше времени' },
    desc: 'Чистая магия огня. Его можно сбить с толку, но не перемагичить.',
  },
  ghost: {
    name: 'Призрак', look: { shape: 'arch', color: '#dfe8ff', eyes: true }, hp: 30, atk: 8, atkType: 'E', xp: 14, gold: [3, 9],
    mult: { Q: 2, W: 0, E: 1 },
    trait: { id: 'evade', name: 'Неуловимость', desc: '25% шанс, что ваша атака пройдёт вполсилы' },
    desc: 'Оружие проходит насквозь. Развеивается магией.',
  },
  whisper: {
    name: 'Шептун', look: { shape: 'star', color: '#7b5cff', eyes: true }, hp: 36, atk: 9, atkType: 'E', xp: 15, gold: [4, 10],
    mult: { Q: 1, W: 2, E: 0 },
    trait: { id: 'long', name: 'Шёпот', desc: 'Ваши коды атаки длиннее на 3 буквы' },
    desc: 'Пожиратель мыслей. Психика ему как еда, но щупальца мягкие.',
  },
  golem: {
    name: 'Голем', look: { shape: 'square', color: '#8f8b84', eyes: true }, hp: 50, atk: 10, atkType: 'W', xp: 18, gold: [5, 12],
    mult: { Q: 2, W: 0.5, E: 0.5 },
    trait: { id: 'armor', name: 'Каменная кожа', desc: 'Каждая буква наносит на 1.5 урона меньше' },
    desc: 'Каменная глыба, оживлённая рунами. Магия рвёт рунные связи.',
  },
  // ----- обитатели подземелий -----
  skeleton: {
    name: 'Скелет', look: { shape: 'cross', color: '#e8e4d8', eyes: true }, hp: 30, atk: 8, atkType: 'W', xp: 14, gold: [3, 8],
    mult: { Q: 1, W: 2, E: 0 }, dungeon: true,
    trait: { id: 'reassemble', name: 'Сборка', desc: 'Один раз за бой собирается заново с 30% HP' },
    desc: 'Кости без разума. Дробящие удары рассыпают его, но он упрям.',
  },
  bat: {
    name: 'Нетопырь', look: { shape: 'diamond', color: '#7a6a9a', eyes: true }, hp: 22, atk: 7, atkType: 'W', xp: 11, gold: [2, 6],
    mult: { Q: 2, W: 0.75, E: 1 }, dungeon: true,
    trait: { id: 'evade', name: 'Неуловимость', desc: '25% шанс, что ваша атака пройдёт вполсилы' },
    desc: 'Мечется в темноте. Магическая вспышка сбивает его наверняка.',
  },
  cultist: {
    name: 'Культист', look: { shape: 'rect', color: '#9b2d3a', eyes: true }, hp: 32, atk: 9, atkType: 'Q', xp: 16, gold: [5, 12],
    mult: { Q: 0.5, W: 2, E: 1 }, dungeon: true,
    trait: { id: 'hex', name: 'Проклятие', desc: 'Пропущенный удар проклинает: на следующую атаку на 25% меньше времени' },
    desc: 'Служитель глубин. Защищён чарами, но телом хрупок.',
  },
  mimic: {
    name: 'Мимик', look: { shape: 'square', color: '#b9823f', eyes: true }, hp: 40, atk: 11, atkType: 'W', xp: 20, gold: [10, 25],
    mult: { Q: 1, W: 2, E: 0.5 }, dungeon: true,
    trait: { id: 'ambush', name: 'Засада', desc: 'Притворяется сундуком и бьёт первым' },
    desc: 'Сундук с зубами. Деревянный — рубите его, а внутри иногда настоящие сокровища.',
  },
  warden: {
    name: 'Страж глубин', look: { shape: 'hexagon', color: '#c0392b', eyes: true }, hp: 45, atk: 9, atkType: 'E', xp: 60, gold: [40, 80],
    mult: { Q: 1, W: 1, E: 1 }, dungeon: true, boss: true,
    trait: { id: 'shift', name: 'Смена сущности', desc: 'Каждый ваш ход меняет уязвимости: одна ×2, одна ×1, одна ×0.25' },
    desc: 'Хозяин подземелья. Его суть всё время меняется — следите за подсказкой.',
  },
  // ----- из игры А: поверхность -----
  chameleon: {
    name: 'Хамелеон', look: { shape: 'blob', color: '#5fd3a0', eyes: true }, hp: 32, atk: 7, atkType: 'W', xp: 14, gold: [3, 8],
    mult: { Q: 2, W: 1, E: 0.5 },
    trait: { id: 'adapt', name: 'Адаптация', desc: 'Подстраивается под ваш частый тип атаки, меняя резисты' },
    desc: 'Меняет окрас под ваш стиль. Бейте разным.',
  },
  thief: {
    name: 'Вор', look: { shape: 'triangle', color: '#c9a227', eyes: true }, hp: 24, atk: 6, atkType: 'W', xp: 12, gold: [8, 18],
    mult: { Q: 1, W: 1, E: 2 },
    trait: { id: 'steal', name: 'Кража', desc: 'Пропущенный удар крадёт золото. Верните за 3 хода' },
    desc: 'Быстрый карманник. Отберите своё обратно.',
  },
  mindreader: {
    name: "Чтец мыслей", look: { shape: 'ring', color: '#b18cff', eyes: true }, hp: 30, atk: 8, atkType: 'E', xp: 15, gold: [4, 10],
    mult: { Q: 1, W: 2, E: 0.5 }, dungeon: true,
    trait: { id: 'mindread', name: 'Чтение мыслей', desc: 'Видит одну из букв вашего кода заранее' },
    desc: 'Слышит ваш внутренний голос. Путайте его.',
  },
  drummer: {
    name: 'Барабанщик', look: { shape: 'circle', color: '#e0564f', eyes: true }, hp: 34, atk: 8, atkType: 'W', xp: 15, gold: [4, 10],
    mult: { Q: 1, W: 0.75, E: 2 },
    trait: { id: 'rhythm', name: 'Ритм', desc: 'Бьёт в такт: промах по ритму усиливает его' },
    desc: 'Стучит в боевой барабан. Ломайте ритм.',
  },
  mirror: {
    name: 'Зеркало', look: { shape: 'diamond', color: '#bfe6ff', eyes: true }, hp: 30, atk: 8, atkType: 'Q', xp: 15, gold: [4, 10],
    mult: { Q: 0.5, W: 2, E: 1 }, dungeon: true,
    trait: { id: 'mirror', name: 'Отражение', desc: 'Отражает часть урона обратно в вас' },
    desc: 'Осколок живого стекла. Хрупок, но путает глаза.',
  },
  shade: {
    name: 'Тень', look: { shape: 'arch', color: '#4a3f73', eyes: true }, hp: 30, atk: 9, atkType: 'E', xp: 16, gold: [4, 12],
    mult: { Q: 2, W: 0.5, E: 1 }, night: true,
    trait: { id: 'evade', name: 'Неуловимость', desc: '25% шанс, что ваша атака пройдёт вполсилы' },
    desc: 'Выходит только ночью. Свет магии рассеивает её.',
  },
  // ----- мировые боссы из А -----
  slimeking: {
    name: 'Король слизней', look: { shape: 'blob', color: '#2fbf5a', eyes: true }, hp: 60, atk: 9, atkType: 'W', xp: 120, gold: [60, 100],
    mult: { Q: 1, W: 2, E: 0 }, boss: true, worldBoss: 1,
    trait: { id: 'split', name: 'Деление', desc: 'Ниже половины HP отделяет слизней-щитов: поглощают половину атаки' },
    desc: 'Огромная корона из слизи. Рубите, но следите за мелкими.',
  },
  sandworm: {
    name: 'Песчаный червь', look: { shape: 'drop', color: '#d9a441', eyes: true }, hp: 70, atk: 10, atkType: 'W', xp: 160, gold: [80, 130],
    mult: { Q: 2, W: 1, E: 0.5 }, boss: true, worldBoss: 2,
    trait: { id: 'snake', name: 'Змеиный код', desc: 'Код ползёт: каждые 0.8с ненабранная часть сдвигается' },
    desc: 'Его коды извиваются. Набирайте быстрее, чем он ползёт.',
  },
  colossus: {
    name: 'Ледяной колосс', look: { shape: 'square', color: '#9fd6ff', eyes: true }, hp: 80, atk: 11, atkType: 'W', xp: 200, gold: [100, 160],
    mult: { Q: 1.5, W: 1.5, E: 1.5 }, boss: true, worldBoss: 3,
    trait: { id: 'frost', name: 'Ледяная броня', desc: 'Покрывается льдом против типа прошлой атаки (×0.25). Меняйте типы' },
    desc: 'Лёд нарастает там, куда вы били.',
  },
  twin: {
    name: 'Тень-близнецы', look: { shape: 'circle', color: '#2b2b3a', eyes: true }, hp: 85, atk: 12, atkType: 'E', xp: 240, gold: [120, 200],
    mult: { Q: 1, W: 1, E: 2 }, boss: true, worldBoss: 4,
    trait: { id: 'twin', name: 'Двойник', desc: 'Создаёт копию и бьёт дважды' },
    desc: 'Один разум, два тела. Бейте обоих.',
  },
  devourer: {
    name: 'Пожиратель снов', look: { shape: 'star', color: '#ff4d8d', eyes: true }, hp: 95, atk: 13, atkType: 'Q', xp: 300, gold: [150, 250],
    mult: { Q: 1, W: 1, E: 1 }, boss: true, worldBoss: 5,
    trait: { id: 'devour', name: 'Пожирание', desc: 'Съедает 3 буквы вашего кода' },
    desc: 'Ест ваши буквы и сны.',
  },
  keeper: {
    name: 'Хранитель QWE', look: { shape: 'hexagon', color: '#ffd75e', eyes: true }, hp: 120, atk: 14, atkType: 'E', xp: 250, gold: [300, 500],
    mult: { Q: 1, W: 1, E: 1 }, boss: true, final: true,
    trait: { id: 'phases', name: 'Смена фаз', desc: 'Каждый ход меняет фазу: змея/зеркало/ритм/сдвиг' },
    desc: 'Тот, кто хранит баланс QWE. Соберите осколки звёзд, чтобы дойти.',
  },
};

// Кто живёт в подземельях (с весами) — MERGED: добавлены зеркало и чтец из А
const DUNGEON_MOBS = [['skeleton', 4], ['bat', 3], ['cultist', 3], ['ghost', 2], ['whisper', 1], ['mirror', 2], ['mindreader', 1]];

// Ночные мобы (только ночью) — из А
const NIGHT_MOBS = [['shade', 6], ['wolf', 3], ['thief', 1]];

// Мировые боссы по порядку — из А
const WORLD_BOSSES = ['slimeking', 'sandworm', 'colossus', 'twin', 'devourer'];

// Ловушки подземелий: при наступании нужно быстро набрать код
const TRAPS = {
  spikes:   { name: 'Шипы',          desc: 'урон 15% HP' },
  gas:      { name: 'Ядовитый газ',  desc: 'урон 10% HP и яд в следующем бою' },
  alarm:    { name: 'Сигнальная руна', desc: 'призывает двух стражей' },
  teleport: { name: 'Руна переноса', desc: 'переносит в случайную комнату' },
};

// Какие мобы живут в каком биоме (с весами) — MERGED из А
const BIOME_MOBS = {
  grass:  [['slime', 6], ['wolf', 2], ['thief', 1], ['drummer', 1]],
  forest: [['wolf', 4], ['shroom', 4], ['slime', 1], ['chameleon', 2], ['thief', 1]],
  sand:   [['scorpion', 5], ['fire', 3], ['drummer', 2]],
  swamp:  [['ghost', 4], ['whisper', 4], ['shroom', 2], ['chameleon', 2], ['mindreader', 2]],
  snow:   [['golem', 4], ['ghost', 2], ['wolf', 2], ['mirror', 2], ['mindreader', 1]],
};

// ===== Предметы =====
const ITEMS = {
  potion:    { name: 'Зелье лечения',      look: { shape: 'circle', color: '#ff5d6c' }, kind: 'heal',  heal: 35, desc: '+35 HP. В бою тратит ход.' },
  bigpotion: { name: 'Большое зелье',      look: { shape: 'hexagon', color: '#ff3d5a' }, kind: 'heal',  heal: 80, desc: '+80 HP. В бою тратит ход.' },
  focus:     { name: 'Зелье концентрации', look: { shape: 'diamond', color: '#4fe3ff' }, kind: 'focus', desc: 'Только в бою: следующая атака ×1.5. Ход не тратит.' },
  scroll:    { name: 'Свиток прозрения',   look: { shape: 'rect', color: '#e8d9a8' }, kind: 'scroll', desc: 'Только в бою: раскрывает уязвимости врага. Ход не тратит.' },
  sword:     { name: 'Железный меч',       look: { shape: 'blade', color: '#ffa148' }, kind: 'gear', slot: 'weapon', bonus: { W: 1.5 }, desc: '+1.5 к физ. урону за букву W' },
  axe:       { name: 'Боевой топор',       look: { shape: 'star', color: '#ffa148' }, kind: 'gear', slot: 'weapon', bonus: { W: 3 },   desc: '+3 к физ. урону за букву W' },
  wand:      { name: 'Палочка искр',       look: { shape: 'diamond', color: '#c08bff' }, kind: 'gear', slot: 'focus',  bonus: { Q: 1.5 }, desc: '+1.5 к магии за букву Q' },
  orb:       { name: 'Сфера бури',         look: { shape: 'star', color: '#c08bff' }, kind: 'gear', slot: 'focus',  bonus: { Q: 3 },   desc: '+3 к магии за букву Q' },
  amulet:    { name: 'Амулет разума',      look: { shape: 'ring', color: '#4fe3ff' }, kind: 'gear', slot: 'charm',  bonus: { E: 1.5 }, desc: '+1.5 к психике за букву E' },
  crown:     { name: 'Венец кошмаров',     look: { shape: 'star', color: '#4fe3ff' }, kind: 'gear', slot: 'charm',  bonus: { E: 3 },   desc: '+3 к психике за букву E' },
  // --- из А ---
  fish:      { name: 'Рыба',               look: { shape: 'drop', color: '#7fb7d9' }, kind: 'heal', heal: 20, desc: '+20 HP. Ловится на F.' },
  goldfish:  { name: 'Золотая рыбка',      look: { shape: 'drop', color: '#ffd75e' }, kind: 'heal', heal: 60, desc: '+60 HP. Редкий улов.' },
  shard:     { name: 'Осколок звезды',     look: { shape: 'diamond', color: '#ffd75e' }, kind: 'quest', desc: 'Соберите все для похода к Хранителю QWE.' },
  tome_fireball: { name: 'Том: Огненный шар', look: { shape: 'rect', color: '#c08bff' }, kind: 'tome', spell: 'fireball', desc: 'Прочитать: выучить заклинание' },
  tome_shield:   { name: 'Том: Каменный щит', look: { shape: 'rect', color: '#ffa148' }, kind: 'tome', spell: 'shield', desc: 'Прочитать: выучить заклинание' },
  tome_dominate: { name: 'Том: Подчинение',   look: { shape: 'rect', color: '#4fe3ff' }, kind: 'tome', spell: 'dominate', desc: 'Прочитать: выучить заклинание' },
  tome_heal:     { name: 'Том: Исцеление',    look: { shape: 'rect', color: '#5be06b' }, kind: 'tome', spell: 'heal', desc: 'Прочитать: выучить заклинание' },
  tome_expose:   { name: 'Том: Разоблачение', look: { shape: 'rect', color: '#e8d9a8' }, kind: 'tome', spell: 'expose', desc: 'Прочитать: выучить заклинание' },
};
const SLOT_NAMES = { weapon: 'Оружие (W)', focus: 'Фокус (Q)', charm: 'Талисман (E)' };

// Таблица лута: [id, вес]
const LOOT_COMMON = [['potion', 10], ['focus', 3], ['scroll', 3], ['bigpotion', 1]];
const LOOT_GEAR_T1 = ['sword', 'wand', 'amulet'];
const LOOT_GEAR_T2 = ['axe', 'orb', 'crown'];

function weightedPick(list, rnd) {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = rnd() * total;
  for (const [id, w] of list) { r -= w; if (r <= 0) return id; }
  return list[list.length - 1][0];
}

// ===== Дерево навыков =====
// Три ветки. Узел открывается, когда в предыдущем узле ветки есть хотя бы 1 ранг.
// 1 очко навыка за каждый уровень (и 1 на старте).
const SKILL_TREE = [
  { id: 'mage', name: 'Маг', type: 'Q', nodes: [
    { id: 'q_power', name: 'Сила магии',   max: 3, desc: r => `+${r} к урону за каждую букву Q` },
    { id: 'q_reflect', name: 'Зеркальный щит', max: 1, desc: () => 'Идеальный блок отражает 50% удара врага магией' },
    { id: 'q_burn', name: 'Поджог',        max: 2, desc: r => `Магическая атака с 4+ буквами Q поджигает врага: ${4 * Math.max(r, 1)} урона × уровень игрока, 2 хода` },
    { id: 'q_echo', name: 'Эхо заклинания', max: 2, desc: r => `${15 * Math.max(r, 1)}% шанс, что атака повторится с силой 50%` },
    { id: 'q_arch', name: 'Архимаг',       max: 1, desc: () => 'Буквы Q в магической атаке ×1.6 вместо ×1.3' },
  ]},
  { id: 'warrior', name: 'Воин', type: 'W', nodes: [
    { id: 'w_power', name: 'Сила удара',    max: 3, desc: r => `+${r} к урону за каждую букву W` },
    { id: 'w_hp', name: 'Крепкое тело',     max: 3, desc: r => `+${15 * Math.max(r, 1)} к максимуму HP` },
    { id: 'w_bleed', name: 'Кровотечение',  max: 2, desc: r => `Физическая атака с 4+ буквами W: враг теряет ${3 * Math.max(r, 1)} × уровень игрока HP, 3 хода` },
    { id: 'w_counter', name: 'Контратака',  max: 1, desc: () => 'Идеальный блок сразу бьёт врага в ответ (урон как 3 буквы W)' },
    { id: 'w_berserk', name: 'Берсерк',     max: 1, desc: () => 'Когда HP ниже 35%, весь ваш урон ×1.5' },
  ]},
  { id: 'mind', name: 'Менталист', type: 'E', nodes: [
    { id: 'e_power', name: 'Сила разума',   max: 3, desc: r => `+${r} к урону за каждую букву E` },
    { id: 'e_time', name: 'Предвидение',    max: 2, desc: r => `+${20 * Math.max(r, 1)}% времени на набор кодов (атака и блок)` },
    { id: 'e_fear', name: 'Ужас',           max: 2, desc: r => `Психическая атака с 4+ буквами E: ${25 * Math.max(r, 1)}% шанс, что враг пропустит ход` },
    { id: 'e_clarity', name: 'Ясность',     max: 1, desc: () => 'Первая ошибка в каждом коде не считается' },
    { id: 'e_read', name: 'Чтение мыслей',  max: 1, desc: () => 'Уязвимости любого врага видны с начала боя' },
  ]},
];

// ===== MERGED из А: гримуар, редкости, стойки, погода =====
const SPELLS = {
  fireball: { name: 'Огненный шар', code: 'QQEQ', type: 'Q', desc: 'Сильный магический удар + поджог' },
  shield:   { name: 'Каменный щит', code: 'WWEW', type: 'W', desc: 'Следующий удар врага слабее на 80%' },
  dominate: { name: 'Подчинение',   code: 'EQEQE', type: 'E', desc: 'Цель пропускает два хода' },
  heal:     { name: 'Исцеление',    code: 'EWWE', type: 'E', desc: '+30% HP и снимает яд' },
  expose:   { name: 'Разоблачение', code: 'QWQWQ', type: 'Q', desc: 'Раскрывает уязвимости, +30% урона 3 хода' },
};
const TOME_IDS = ['tome_fireball', 'tome_shield', 'tome_dominate', 'tome_heal', 'tome_expose'];

const RARITY = {
  common:    { name: 'Обычный',    color: '#cfd3dc', mult: 1,    aff: 0 },
  rare:      { name: 'Редкий',     color: '#4fa3ff', mult: 1.35, aff: 1 },
  epic:      { name: 'Эпический',  color: '#c08bff', mult: 1.7,  aff: 2 },
  legendary: { name: 'Легендарный', color: '#ffb347', mult: 2.1, aff: 3 },
};
const AFFIXES = {
  time:  { name: '+10% времени на коды' },
  first: { name: 'Первая буква каждого кода набирается сама' },
  eheal: { name: 'Каждая буква E лечит 1 HP' },
  crit:  { name: '10% шанс крита ×1.5' },
  block: { name: 'Блок сильнее на 10%' },
  gold:  { name: '+25% золота с врагов' },
};

// Стойки боя из А (T — переключение)
const STANCES = {
  balance: { name: 'Баланс',     desc: 'без штрафов' },
  mage:    { name: 'Маг',        type: 'Q', desc: '+1 к Q, слабее защита' },
  warrior: { name: 'Воин',       type: 'W', desc: '+1 к W, слабее защита' },
  mind:    { name: 'Менталист',  type: 'E', desc: '+1 к E, слабее защита' },
};
const STANCE_ORDER = ['balance', 'mage', 'warrior', 'mind'];

// Длина кода из А (Z/X/C)
const CODE_LENGTHS = {
  short:  { name: 'Короткий', mult: 0.7, len: -2 },
  normal: { name: 'Обычный',  mult: 1,   len: 0 },
  long:   { name: 'Длинный',  mult: 1.4, len: 3 },
};
const CODE_LEN_ORDER = ['short', 'normal', 'long'];

// Погода из А: дождь усиливает fire-мобов
const WEATHERS = {
  clear: { name: 'Ясно',  desc: '' },
  rain:  { name: 'Дождь', desc: 'огненные мобы слабее к E' },
  fog:   { name: 'Туман', desc: 'меньше обзор' },
};
