// Phosphor icons (regular weight), inlined as SVG strings.
import plus from '@phosphor-icons/core/assets/regular/plus.svg?raw';
import minus from '@phosphor-icons/core/assets/regular/minus.svg?raw';
import check from '@phosphor-icons/core/assets/regular/check.svg?raw';
import x from '@phosphor-icons/core/assets/regular/x.svg?raw';
import trash from '@phosphor-icons/core/assets/regular/trash.svg?raw';
import caret from '@phosphor-icons/core/assets/regular/caret-down.svg?raw';
import arrow from '@phosphor-icons/core/assets/regular/arrow-right.svg?raw';
import undo from '@phosphor-icons/core/assets/regular/arrow-u-up-left.svg?raw';
import sun from '@phosphor-icons/core/assets/regular/sun.svg?raw';
import moon from '@phosphor-icons/core/assets/regular/moon.svg?raw';
import upload from '@phosphor-icons/core/assets/regular/upload-simple.svg?raw';
import file from '@phosphor-icons/core/assets/regular/file-arrow-up.svg?raw';
import paste from '@phosphor-icons/core/assets/regular/clipboard-text.svg?raw';
import warn from '@phosphor-icons/core/assets/regular/warning-circle.svg?raw';
import sliders from '@phosphor-icons/core/assets/regular/sliders-horizontal.svg?raw';
import calendar from '@phosphor-icons/core/assets/regular/calendar-blank.svg?raw';

const icons = { plus, minus, check, x, trash, caret, arrow, undo, sun, moon, upload, file, paste, warn, sliders, calendar };

export const icon = (name) => icons[name].replace('<svg', '<svg aria-hidden="true" focusable="false"');

/** Replace every <i data-icon="name"> under root with its SVG. */
export function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => (el.outerHTML = icon(el.dataset.icon)));
}
