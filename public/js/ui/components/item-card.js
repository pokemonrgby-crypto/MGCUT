// public/js/ui/components/item-card.js

const TIER_COLORS = {
    Common: '#9d9d9d',
    Uncommon: '#5d9d5c',
    Rare: '#4a8fd2',
    Epic: '#8e4ed2',
    Legendary: '#d28e4a',
    Mythic: '#d24a4a',
    Exotic: '#d24ac0',
};

/**
 * 아이템 정보를 받아 카드 UI의 HTML 문자열을 생성합니다.
 * @param {object} item - 아이템 객체 (name, description, grade 필수)
 * @param {string} extraClass - 추가할 CSS 클래스
 * @returns {string} HTML 문자열
 */
export function itemCard(item, extraClass = '') {
    const name = item?.name || '(알 수 없는 아이템)';
    const desc = item?.description || '설명이 없습니다.';
    const grade = item?.grade || 'Common';
    const color = TIER_COLORS[grade] || TIER_COLORS.Common;

    return `
    <div class="item-card ${extraClass}" style="--tier-color: ${color};">
        <div class="item-card-header">
            <div class="item-card-name">${name}</div>
            <div class="item-card-grade">${grade}</div>
        </div>
        <div class="item-card-body">
            <p>${desc}</p>
        </div>
    </div>
    `;
}
