const flow = document.getElementById('flow-demo');
const picker = document.getElementById('model-picker');
const outcome = document.getElementById('demo-outcome');
const options = [...document.querySelectorAll('[data-model]')];
const announcement = document.getElementById('demo-announcement');
let selected = 0;

function select(index) {
  selected = index;
  options.forEach((button, i) => {
    button.classList.toggle('selected', i === index);
    button.setAttribute('aria-pressed', String(i === index));
  });
}
function reset() {
  select(0);
  picker.hidden = false;
  outcome.hidden = true;
  announcement.textContent = '';
}
function finish(action) {
  if (picker.hidden) return;
  const model = action === 'keep' ? 'Opus' : selected === 0 ? 'Sonnet' : 'Opus';
  const cancelled = action === 'cancel';
  const title = cancelled ? 'Task cancelled.' : `${model} selected. Back to work.`;
  const detail = cancelled ? 'In the real flow, no task would start.' : 'Your saved task continues on this model. No repasting.';
  document.getElementById('outcome-title').textContent = title;
  document.getElementById('outcome-detail').textContent = detail;
  outcome.querySelector('.prompt').textContent = cancelled ? '—' : '✓';
  picker.hidden = true;
  outcome.hidden = false;
  announcement.textContent = `Demo: ${title} ${detail}`;
  outcome.querySelector('button').focus({preventScroll: true});
}
options.forEach((button, i) => button.addEventListener('click', () => select(i)));
document.getElementById('demo-continue').addEventListener('click', () => finish('choose'));
document.getElementById('demo-keep').addEventListener('click', () => finish('keep'));
document.getElementById('demo-cancel').addEventListener('click', () => finish('cancel'));
document.querySelector('.demo-reset').addEventListener('click', () => {reset(); options[0].focus({preventScroll: true});});
flow.addEventListener('keydown', event => {
  if (picker.hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    select((selected + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    options[selected].focus({preventScroll: true});
  } else if (event.key === 'Enter' && (event.target === flow || event.target.matches('[data-model]'))) {
    event.preventDefault(); finish('choose');
  } else if (event.key === 'Escape' || event.key.toLowerCase() === 'q') {
    event.preventDefault(); finish(event.key === 'Escape' ? 'keep' : 'cancel');
  }
});
document.querySelectorAll('.copy').forEach(button => {
  button.addEventListener('click', async () => {
    const code = button.parentElement.querySelector('code');
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = 'copied ✓';
      document.getElementById('copy-status').textContent = 'Command copied to clipboard.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = 'selected';
      document.getElementById('copy-status').textContent = 'Automatic copying is unavailable. The command is selected; use your keyboard to copy it.';
    }
    clearTimeout(button.copyTimer);
    button.copyTimer = setTimeout(() => { button.textContent = 'copy'; }, 2000);
  });
});
