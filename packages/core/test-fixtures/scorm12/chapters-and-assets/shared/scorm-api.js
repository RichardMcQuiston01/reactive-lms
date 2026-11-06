// Finds the SCORM 1.2 API in the parent frames, as content is meant to.
function findScormApi(win) {
  for (var depth = 0; depth < 10 && win; depth++) {
    if (win.API) return win.API;
    if (win.parent === win) break;
    win = win.parent;
  }
  return null;
}

// Runs a small "lesson": initialize, set a bookmark and status, finish.
function runLesson(name, score) {
  var api = findScormApi(window);
  var status = document.getElementById('status');
  if (!api) {
    status.textContent = 'no-api';
    return;
  }
  api.LMSInitialize('');
  api.LMSSetValue('cmi.core.lesson_location', name);
  if (score !== undefined) {
    api.LMSSetValue('cmi.core.score.raw', String(score));
  }
  api.LMSSetValue('cmi.core.lesson_status', 'completed');
  api.LMSCommit('');
  api.LMSFinish('');
  status.textContent = 'finished ' + name;
}
