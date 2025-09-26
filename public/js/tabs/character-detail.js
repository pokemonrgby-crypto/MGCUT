// public/js/ui/components/item-card.js

/**
 * 아이템 정보를 받아 카드 UI의 HTML 문자열을 생성합니다.
 * @param {object} item - 아이템 객체 (id, name, description, grade 필수)
 * @param {string} extraClass - 추가할 CSS 클래스
 * @returns {string} HTML 문자열
 */
export function itemCard(item, extraClass = '') {
    const id = item?.id || '';
    const name = item?.name || '(알 수 없는 아이템)';
    const desc = item?.description || '설명이 없습니다.';
    const grade = item?.grade || 'Common';
    const type = item?.type || 'equipable'; // 기본값 'equipable'
    const gradeClass = `grade-${grade.toLowerCase()}`;

    return `
    <div class="item-card ${gradeClass} ${extraClass}" data-item-id="${id}" data-type="${type}">
        <div class="item-card-header">
            <div class="item-card-name">${name}</div>
            <div class="item-card-grade">${grade}</div>
        </div>
        <div class="item-card-body">
            <p>${desc}</p>
        </div>
        <div class="item-card-footer">
            ${type === 'consumable' ? '소비 아이템' : '장비 아이템'}
        </div>
    </div>
    `;
}
