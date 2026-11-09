const modelCodePattern = /(?<![\p{L}\p{N}_-])[a-z]{1,12}-?\d+[a-z0-9]*(?:-[a-z0-9]+)*(?![\p{L}\p{N}_-])/giu;
const numberPattern = /\d+(?:[ \u00a0\u202f]\d{3}(?!\d))*(?:[.,]\d+)?/g;
const listMarker = /^[ \t]*\d{1,2}[.)](?=[ \t]+\p{L})/gmu;

// Common catalog quantities. Keep units distinct and preserve explicit property labels.
const units = {
  ml: 'мл|ml', l: 'л|литр(?:а|ов|ы)?|литрл[еі]р?|l|lit(?:er|re)s?',
  mg: 'мг|mg', g: 'г|гр|грамм(?:а|ов|ы)?|g|grams?', kg: 'кг|килограмм(?:а|ов|ы)?|kg|kilograms?',
  mm: 'мм|mm', cm: 'см|cm', m: 'м|метр(?:а|ов|ы)?|m|meters?',
  h: 'ч|час(?:а|ов|ы)?|сағат|h|hrs?|hours?', min: 'мин|минут(?:а|ы|у)?|минуттар|min|minutes?',
  day: 'дн(?:я|ей)|день|сут(?:ки|ок)|күн|days?', year: 'год(?:а|ов)?|лет|жыл|years?',
  pcs: 'шт|штук(?:а|и)?|дана|pcs|pieces?', percent: '%|процент(?:а|ов|ы)?|пайыз|percent',
  tenge: '₸|тг|тенге|теңге|kzt', mah: 'м[аa]ч|mah', w: 'вт|w|ватт(?:а|ов)?',
  v: 'в|вольт(?:а|ов)?|volts?', gb: 'гб|gb', tb: 'тб|tb'
};
const properties = {
  width: 'ширин[ауы]|ені|width', height: 'высот[ауы]|биіктігі|height',
  depth: 'глубин[ауы]|тереңдігі|depth', length: 'длин[ауы]|ұзындығы|length',
  diameter: 'диаметр(?:а|ом)?|диаметрі|diameter', thickness: 'толщин[ауы]|қалыңдығы|thickness',
  capacity: 'об[ъь][её]м(?:а|ом)?|к[өо]лемі|volume|вместимост[ьи]',
  weight: 'вес(?:а|ом)?|масс[ауы]|салмағы|weight|mass',
  runtime: 'автономност[ьи]|работ(?:ает|ы)|жұмыс\s+уақыты|runtime|battery\s+life',
  warranty: 'гаранти[яию]|кепілдік|warranty',
  charging: 'зарядк[аиу]|заряжается|қуаттау|charg(?:e|es|ing)',
  discount: 'скидк[аиу]|жеңілдік|discount',
  price: 'цен[аыу]|бағасы|price', power: 'мощност[ьи]|қуаты|power'
};
const groups = entries => Object.entries(entries).map(([key, pattern]) => `(?<${key}>${pattern})`).join('|');
const unitPattern = new RegExp(`^[ \\t\\u00a0\\u202f]*(?:${groups(units)})(?![\\p{L}\\p{N}])`, 'iu');
const propertyPattern = new RegExp(`(?<!\\p{L})(?:${groups(properties)})(?!\\p{L})`, 'giu');
const defaultProperty = { ml: 'capacity', l: 'capacity', mg: 'weight', g: 'weight', kg: 'weight', tenge: 'price', w: 'power' };
const label = match => Object.keys(match?.groups || {}).find(key => match.groups[key] !== undefined);

export function modelCodesIn(text) {
  return new Set((text.match(modelCodePattern) || []).map(code => code.toLowerCase()));
}

function quantities(text, modelCodes) {
  const source = text.replace(modelCodePattern, code => modelCodes.has(code.toLowerCase()) ? ' '.repeat(code.length) : code);
  return Array.from(source.matchAll(numberPattern), match => {
    const number = match[0].replace(/\s/g, '').replace(',', '.');
    const end = match.index + match[0].length;
    const unitMatch = source.slice(end).match(unitPattern);
    const unit = label(unitMatch);
    // Limit property labels to this measurement's clause and nearest number.
    const before = source.slice(Math.max(0, match.index - 48), match.index).split(/[\d;,.!?\n]/).at(-1);
    const after = source.slice(end + (unitMatch?.[0].length || 0), end + (unitMatch?.[0].length || 0) + 28).split(/[\d;,.!?\n]/)[0];
    const property = unit && (label([...before.matchAll(propertyPattern)].at(-1)) || label([...after.matchAll(propertyPattern)][0]) || defaultProperty[unit]);
    return { number, unit, property };
  });
}

export function numericEvidence(sources) {
  const source = sources.join('\n');
  const sourceCodes = modelCodesIn(source);
  const supplied = quantities(source, sourceCodes);
  return (output, { modelCodes = [], instructional = false } = {}) => {
    const text = instructional ? output.replace(listMarker, '') : output;
    const allowedCodes = new Set([...sourceCodes, ...modelCodes]);
    if ([...modelCodesIn(text)].some(code => !allowedCodes.has(code)) ||
        quantities(text, allowedCodes).some(claim => !supplied.some(fact =>
          fact.number === claim.number && fact.unit === claim.unit && (!claim.property || fact.property === claim.property)))) {
      throw new Error('Unsupported numeric claim');
    }
  };
}
