// functions/lib/schemas.mjs
export function validateCharacter(obj) {
  const errs = [];
  if (!obj || typeof obj !== 'object') { errs.push('객체가 아님'); return { ok: false, errors: errs }; }

  const str = (v) => typeof v === 'string' && v.trim().length > 0;

  if (!str(obj.name)) errs.push('name 누락');
  if (!str(obj.introShort)) errs.push('introShort 누락');

  // narratives: [{title,long,short}]
  if (!Array.isArray(obj.narratives) || obj.narratives.length < 1) {
    errs.push('narratives 최소 1개 필요');
  } else {
    obj.narratives.forEach((n, i) => {
      if (!str(n?.title)) errs.push(`narratives[${i}].title 누락`);
      if (!str(n?.long)) errs.push(`narratives[${i}].long 누락`);
      if (!str(n?.short)) errs.push(`narratives[${i}].short 누락`);
    });
  }

  // abilities: 정확히 6개 [{name,description}]
  if (!Array.isArray(obj.abilities) || obj.abilities.length !== 6) {
    errs.push('abilities는 정확히 6개여야 함');
  } else {
    obj.abilities.forEach((a, i) => {
      if (!str(a?.name)) errs.push(`abilities[${i}].name 누락`);
      if (!str(a?.description)) errs.push(`abilities[${i}].description 누락`);
    });
  }

  // chosen: 정확히 3개 (이름 문자열 or 인덱스 숫자)
  if (!Array.isArray(obj.chosen) || obj.chosen.length !== 3) {
    errs.push('chosen은 정확히 3개여야 함');
  } else {
    obj.chosen.forEach((c, i) => {
      if (!(typeof c === 'string' || Number.isInteger(c))) {
        errs.push(`chosen[${i}] 는 문자열(능력 이름) 또는 정수(인덱스)여야 함`);
      }
    });
  }
  
  // [수정] items는 필수가 아님
  if (obj.items && !Array.isArray(obj.items)) {
    errs.push('items가 있다면 배열이어야 함');
  }


  return { ok: errs.length === 0, errors: errs };
}
