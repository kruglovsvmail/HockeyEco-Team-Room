// Поиск людей, уже заведённых в системе, по введённым при регистрации данным.
//
// Задача не в том, чтобы найти точное совпадение, а в том, чтобы НЕ ПРОПУСТИТЬ уже
// существующую карточку. Ошибки здесь несимметричны: показать лишнего кандидата
// безвредно (человек его просто не выберет, а без секретного кода всё равно никуда не
// попадёт), а пропустить существующего — значит получить дубликат, который ломает всю
// суть системы. Поэтому пороги низкие и список намеренно широкий.
//
// Данные виртуальных карточек грязные по своей природе: их заводит руководитель со слов,
// в фамилии бывают опечатки, отчество часто не заполнено, дата рождения указана неточно,
// а телефон почти всегда заглушка. Отсюда правила:
//   • телефон в сравнении не участвует вообще — он заведомо мусорный;
//   • отчество не участвует в отборе, только показывается (тот же принцип, что и в
//     findNameDuplicates в реестре LMS);
//   • у даты рождения главное — ГОД: он же возрастная группа, в нём почти не ошибаются,
//     а день с месяцем регулярно путают местами (05.11 против 11.05).

// Приведение к виду, в котором сравнение не спотыкается о «ё», дефисы и двойные пробелы
export const normalizeName = (value) => String(value || '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[^a-zа-я0-9]/gi, '');

/**
 * Расстояние Левенштейна — сколько правок отделяет одну строку от другой.
 * Реализация на двух строках матрицы: длины здесь короткие, память экономить незачем,
 * но так проще и быстрее полной матрицы.
 */
const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
};

/**
 * Похожесть двух строк от 0 до 1. Пустые строки считаем несравнимыми (0),
 * чтобы незаполненное поле в базе не давало ложного совпадения.
 */
export const similarity = (a, b) => {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const distance = levenshtein(x, y);
  return 1 - distance / Math.max(x.length, y.length);
};

// Пороги подобия. Подобраны так, чтобы одна-две опечатки в фамилии средней длины
// («Ивановв», «Иваонв») кандидата не отсеивали.
const LASTNAME_MATCH = 0.7;
const FIRSTNAME_MATCH = 0.7;

// Веса сигналов. Фамилия весит больше всего, год рождения — второй по силе якорь,
// точное совпадение почты перевешивает всё, потому что почта уникальна в users.
const WEIGHT_LASTNAME = 40;
const WEIGHT_FIRSTNAME = 25;
const WEIGHT_BIRTH_YEAR = 20;
const WEIGHT_BIRTH_FULL = 10;
const WEIGHT_MIDDLENAME = 5;
const WEIGHT_EMAIL = 100;

// Минимальный балл, с которым кандидат попадает в список. Ниже этого — совпадений
// слишком мало, чтобы человек вообще узнал в записи себя.
const MIN_SCORE = 40;

/**
 * Оценка одного кандидата из базы против того, что ввёл человек.
 * Возвращает балл и разбор сигналов — разбор удобно смотреть в логах при разборе жалоб
 * вида «меня не нашло».
 */
export const scoreCandidate = (input, candidate) => {
  const lastNameScore = similarity(input.lastName, candidate.last_name);
  const firstNameScore = similarity(input.firstName, candidate.first_name);

  // Почта уникальна в users, поэтому точное совпадение — сильнейший из возможных сигналов,
  // и проверяется оно ПЕРВЫМ. Иначе отсев по имени успевал бы выкинуть кандидата раньше:
  // именно так теряется человек, сменивший фамилию (замужество) — почта та же, фамилия
  // другая, а это самый вероятный вид пропуска.
  const emailMatch = Boolean(
    input.email && candidate.email
    && String(input.email).trim().toLowerCase() === String(candidate.email).trim().toLowerCase()
  );

  // Совсем чужую фамилию с чужим именем не рассматриваем — без этого условия в список
  // полезли бы все однолетки подряд. Совпавшая почта это правило отменяет.
  if (!emailMatch && lastNameScore < LASTNAME_MATCH && firstNameScore < FIRSTNAME_MATCH) {
    return { score: 0 };
  }

  let score = emailMatch ? WEIGHT_EMAIL : 0;
  if (lastNameScore >= LASTNAME_MATCH) score += Math.round(WEIGHT_LASTNAME * lastNameScore);
  if (firstNameScore >= FIRSTNAME_MATCH) score += Math.round(WEIGHT_FIRSTNAME * firstNameScore);

  const inputDate = input.birthDate ? new Date(input.birthDate) : null;
  const candidateDate = candidate.birth_date ? new Date(candidate.birth_date) : null;

  if (inputDate && candidateDate && !isNaN(inputDate) && !isNaN(candidateDate)) {
    if (inputDate.getUTCFullYear() === candidateDate.getUTCFullYear()) {
      score += WEIGHT_BIRTH_YEAR;
      const sameDay = inputDate.getUTCMonth() === candidateDate.getUTCMonth()
        && inputDate.getUTCDate() === candidateDate.getUTCDate();
      if (sameDay) score += WEIGHT_BIRTH_FULL;
    }
  }

  // Отчество только добавляет уверенности и никогда не отнимает: у виртуальных
  // карточек его часто просто нет
  if (input.middleName && candidate.middle_name
      && similarity(input.middleName, candidate.middle_name) >= FIRSTNAME_MATCH) {
    score += WEIGHT_MIDDLENAME;
  }

  return { score };
};

export const MIN_CANDIDATE_SCORE = MIN_SCORE;
