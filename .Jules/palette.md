## 2026-10-10 - Added keyboard focus to 'Reset XP' button
**Learning:** Interactive elements nested deep within forms (like the reset XP action) often lack proper keyboard focus states if they are standard buttons styled as text links. While mouse users have hover states, keyboard users are left guessing their position.
**Action:** Always verify that 'text link' style buttons include `focus-visible` utility classes for clear keyboard navigation.
