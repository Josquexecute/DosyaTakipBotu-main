import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMutationQueue, setTrackingLocalField } from '../dist-electron/shared/renderer-stability.js';
import { chooseTrackingItemId } from '../dist-electron/shared/tracking-item-id.js';
import { createDefaultTracking } from '../dist-electron/main/tracking/tracking-defaults.js';
import { TrackingFileService } from '../dist-electron/main/tracking/tracking-file-service.js';

const checks = [];
function ok(name) { checks.push({ name, ok: true }); console.log(`TAMAM - ${name}`); }
function fail(name, message) { checks.push({ name, ok: false, message }); console.error(`HATA - ${name}: ${message}`); }
function assert(condition, name, message) { condition ? ok(name) : fail(name, message); }

await testMutationQueue();
await testLocalFieldPatch();
await testClientStableTodoNoteIds();

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`Renderer stabilite denetimi basarisiz: ${failed.length} hata.`);
  process.exit(1);
}
console.log(`Renderer stabilite denetimi gecti: ${checks.length} kontrol.`);

async function testMutationQueue() {
  const queue = createMutationQueue();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  const first = queue.run('case-a', async () => {
    events.push('first-start');
    await firstGate;
    events.push('first-end');
  });
  const second = queue.run('case-a', async () => {
    events.push('second-start');
  });

  await Promise.resolve();
  assert(queue.has('case-a') && queue.size() === 1, 'Mutation queue ayni dosya icin tek pending anahtar tutar', JSON.stringify({ keys: queue.pendingKeys(), events }));
  assert(events.join(',') === 'first-start', 'Mutation queue ayni dosyadaki ikinci isi bekletir', events.join(','));
  releaseFirst();
  await Promise.all([first, second]);
  assert(events.join(',') === 'first-start,first-end,second-start', 'Mutation queue ayni dosyada sirali calisir', events.join(','));
  assert(!queue.has('case-a') && queue.size() === 0, 'Mutation queue basarili seri sonrasi temizlenir', JSON.stringify(queue.pendingKeys()));

  let failed = false;
  try {
    await queue.run('case-b', async () => { throw new Error('simulated failure'); });
  } catch {
    failed = true;
  }
  assert(failed, 'Mutation queue hata sonucunu cagiriciya iletir', 'hata yakalanmadi');
  assert(!queue.has('case-b') && queue.size() === 0, 'Mutation queue hata sonrasi temizlenir', JSON.stringify(queue.pendingKeys()));

  await queue.run('case-b', async () => { events.push('after-failure'); });
  assert(events.includes('after-failure') && !queue.has('case-b'), 'Mutation queue hata sonrasi yeni ise izin verir', events.join(','));

  await queue.run('case-conflict', async () => ({ conflict: true }));
  assert(!queue.has('case-conflict') && queue.size() === 0, 'Mutation queue conflict-like sonuc sonrasi temizlenir', JSON.stringify(queue.pendingKeys()));
}

async function testLocalFieldPatch() {
  const tracking = createDefaultTracking({
    caseKey: '34ABC123',
    plate: '34ABC123',
    dosyaNo: '',
    officeFileNo: '',
    claimNoticeNo: '',
    folderPath: 'C:\\tmp\\34ABC123',
    monthFolder: 'Haziran 2026',
    isClosedFolder: false
  }, 'Renderer Stabilite');

  setTrackingLocalField(tracking, 'assignment.sorumlu', 'Ali Veli');
  setTrackingLocalField(tracking, 'labor.not', 'Islem notu');
  assert(tracking.assignment.sorumlu === 'Ali Veli' && tracking.labor.not === 'Islem notu', 'setTrackingLocalField gecerli derin alanlari gunceller', JSON.stringify({ sorumlu: tracking.assignment.sorumlu, laborNot: tracking.labor.not }));

  let invalidPathFailed = false;
  try {
    setTrackingLocalField(tracking, 'assignment.eksik.alt', 'kaybolmamali');
  } catch {
    invalidPathFailed = true;
  }
  assert(invalidPathFailed, 'setTrackingLocalField gecersiz derin path icin fail-fast davranir', JSON.stringify(tracking.assignment));
  assert(!Object.prototype.hasOwnProperty.call(tracking.assignment, 'eksik'), 'setTrackingLocalField gecersiz path icin veri olusturmaz', JSON.stringify(tracking.assignment));
}

async function testClientStableTodoNoteIds() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hasarbotu-renderer-stability-'));
  const yearRoot = path.join(root, 'pCloud Drive (P)', 'BARAN GLOBAL EKSPERTIZ', '2026');
  const casePath = path.join(yearRoot, 'Haziran 2026', '34ABC123');
  await fs.mkdir(path.join(casePath, 'EVRAK'), { recursive: true });
  const service = new TrackingFileService(path.join(root, 'locks'));
  const identity = {
    caseKey: '34ABC123',
    plate: '34ABC123',
    dosyaNo: '',
    officeFileNo: '2026/77',
    claimNoticeNo: '77-12345678',
    folderPath: casePath,
    monthFolder: 'Haziran 2026',
    isClosedFolder: false
  };
  const initial = await service.ensureTracking(identity, 'Renderer Stabilite');

  const todoId = 'todo-client-stable';
  const noteId = 'note-client-stable';
  const duplicateTodoFallback = chooseTrackingItemId(todoId, 'todo', [todoId], () => 'todo-fallback-12345678');
  assert(duplicateTodoFallback !== todoId && duplicateTodoFallback.startsWith('todo-fallback'), 'Tracking item ID helper duplicate client ID icin fallback uretir', duplicateTodoFallback);

  const writeResult = await service.mutate(casePath, initial.tracking.metadata.revision, initial.tracking.metadata.writeId, 'Renderer Stabilite', (tracking) => {
    const selectedTodoId = chooseTrackingItemId(todoId, 'todo', tracking.todos.map((todo) => todo.id), () => 'todo-fallback-12345678');
    const selectedNoteId = chooseTrackingItemId(noteId, 'note', tracking.notes.map((note) => note.id), () => 'note-fallback-12345678');
    tracking.todos.push({
      id: selectedTodoId,
      title: 'Portal yukleme kontrolu',
      completed: false,
      priority: 'Normal',
      assignedTo: 'Renderer Stabilite',
      dueDate: '2026-06-20',
      createdAt: new Date().toISOString()
    });
    tracking.notes.push({
      id: selectedNoteId,
      createdAt: new Date().toISOString(),
      createdBy: 'Renderer Stabilite',
      text: 'Eksper arandi'
    });
  });

  assert(!('conflict' in writeResult) && writeResult.tracking.todos.some((todo) => todo.id === todoId), 'Todo client ID mutation sonucunda korunur', JSON.stringify(writeResult));
  assert(!('conflict' in writeResult) && writeResult.tracking.notes.some((note) => note.id === noteId), 'Not client ID mutation sonucunda korunur', JSON.stringify(writeResult));
  const diskTracking = await service.readExisting(casePath);
  assert(diskTracking?.todos.some((todo) => todo.id === todoId) && diskTracking.notes.some((note) => note.id === noteId), 'Todo ve not client ID takip.json icinde birebir kalir', JSON.stringify({ todos: diskTracking?.todos, notes: diskTracking?.notes }));
}
