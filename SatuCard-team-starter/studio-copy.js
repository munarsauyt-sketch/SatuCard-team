/* Local templates do not translate supplied product facts or call a network. */
(function (root) {
  'use strict';
  const headings = {
    ru: { neutral: 'Информация о товаре', friendly: 'Познакомьтесь с товаром', premium: 'Детали товара' },
    kk: { neutral: 'Тауар туралы ақпарат', friendly: 'Тауармен танысыңыз', premium: 'Тауар туралы мәлімет' }
  };
  function validate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !['ru', 'kk'].includes(input.language) || !['neutral', 'friendly', 'premium'].includes(input.tone) ||
      typeof input.title !== 'string' || !input.title.trim() || input.title.length > 60 ||
      typeof input.facts !== 'string' || input.facts.length > 2000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.title + input.facts)) {
      throw new Error('Проверьте язык, тон, название (до 60 знаков) и факты (до 2000 знаков).');
    }
    return { language: input.language, title: input.title.trim(), facts: input.facts.trim(), tone: input.tone };
  }
  function offline(input) {
    const value = validate(input);
    const facts = value.facts.split(/[\n;]+/).map(part => part.trim().replace(/\s+/g, ' ')).filter(Boolean);
    // Do not cut a claim in half: a truncated qualifier can change its meaning.
    const description = facts.reduce((result, fact) => {
      const candidate = result ? `${result}; ${fact}` : fact;
      return candidate.length <= 180 ? candidate : result;
    }, '');
    return { title: value.title, subtitle: headings[value.language][value.tone], description,
      features: facts.filter(fact => fact.length <= 38).slice(0, 3), source: 'offline' };
  }
  root.SATUCARD_COPY = Object.freeze({ validate, offline });
})(globalThis);
