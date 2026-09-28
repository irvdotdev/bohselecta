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

const watch = document.getElementById('watch-video');
const video = document.querySelector('video');
watch.addEventListener('click', async () => {
  watch.hidden = true;
  video.hidden = false;
  try { await video.play(); video.focus(); }
  catch { video.hidden = true; watch.hidden = false; watch.focus(); }
});
