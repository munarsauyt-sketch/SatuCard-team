// These catalog properties require explicit seller evidence in either language.
// This supplements numeric validation. Seller review is still required for free text.
const properties = [
  /водонепроница\p{L}*|waterproof|су\s+өткізбейтін|су\s+өткізбейді/giu,
  /гипоаллерген\p{L}*|hypoallergenic|гипоаллергенді/giu,
  /сертифицир\p{L}*|сертификат\p{L}*|certified/giu,
  /оригинал\p{L}*|түпнұсқа\p{L}*|authentic|genuine/giu,
  /гаранти\p{L}*|кепілдік\p{L}*|warranty/giu,
  /бесплатн\p{L}*\s+достав\p{L}*|тегін\s+жеткізу|free\s+delivery/giu,
  /хит\s+продаж|бестселлер\p{L}*|ең\s+көп\s+сатылатын|best\s*seller/giu,
  /антибактериал\p{L}*|antibacterial|бактерияға\s+қарсы/giu,
  /лечебн\p{L}*|лечит|емдей\p{L}*|емдік|therapeutic/giu,
  /хлоп\p{L}*|мақта\p{L}*|cotton/giu,
  /натуральн\p{L}*\s+кож\p{L}*|табиғи\s+былғары|genuine\s+leather/giu,
  /шерст\p{L}*|жүн\p{L}*|wool/giu,
  /шелк\p{L}*|шёлк\p{L}*|жібек\p{L}*|silk/giu,
  /нержавеющ\p{L}*|тот\s+баспайтын|stainless/giu,
  /органическ\p{L}*|органикалық|organic/giu,
  /экологич\p{L}*|экологиялық|eco[- ]?friendly/giu
];

function polarity(text, match) {
  const prefix = text.slice(0, match.index).split(/[.!?;\n]/u).pop();
  const suffix = text.slice(match.index + match[0].length, match.index + match[0].length + 25);
  return /(?:^|\s)(?:не|нет|без|not|no|without)(?:\s+\p{L}+){0,2}\s*$/iu.test(prefix) ||
    /^\s*(?:жоқ|емес)(?=\s|[.,!?;]|$)/iu.test(suffix) ? 'negative' : 'positive';
}

export function assertSupportedClaims(output, evidence) {
  const source = String(evidence).normalize('NFKC');
  const text = String(output).normalize('NFKC');
  for (const pattern of properties) {
    const supported = new Set([...source.matchAll(pattern)].map(match => polarity(source, match)));
    for (const match of text.matchAll(pattern)) {
      if (!supported.has(polarity(text, match))) throw new Error('Unsupported product claim');
    }
  }
}
