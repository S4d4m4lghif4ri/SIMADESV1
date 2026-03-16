// ============================================================
// SIMADES — Sistem Manajemen Administrasi Desa
// File: Code.gs  (Core: config, DB, session, utilities)
// ============================================================

const CFG = {
  APP_NAME : 'SIMADES',
  SS_NAME  : 'SIMADES_DATABASE',
  SESSION_H: 8,
  CACHE_S  : 120,   // 2 menit — data dinamis
  CACHE_L  : 600,   // 10 menit — data user
};

const SH = {
  USERS : 'Users',
  SK    : 'SuratKeluar',
  SM    : 'SuratMasuk',
  DISP  : 'Disposisi',
  TUGAS : 'Tugas',
  PRG   : 'ProgressTugas',
  KGT   : 'Kegiatan',
  KEU   : 'Keuangan',
  DOK   : 'Dokumen',
  LOG   : 'Logs',
};

const ROLE_ACCESS = {
  ADMIN          : ['dashboard','surat_keluar','surat_masuk','disposisi','tugas','kegiatan','dokumen','laporan','pengaturan'],
  KEPALA_DESA    : ['dashboard','surat_keluar','surat_masuk','disposisi','tugas','kegiatan','keuangan','dokumen','laporan'],
  SEKRETARIS_DESA: ['dashboard','surat_keluar','surat_masuk','disposisi','tugas','kegiatan','dokumen','laporan'],
  KAUR           : ['dashboard','surat_masuk','disposisi','tugas','kegiatan','dokumen'],
  KASI           : ['dashboard','surat_masuk','tugas','kegiatan','dokumen'],
  BENDAHARA      : ['dashboard','keuangan','dokumen','laporan'],
};

const HEADERS = {
  Users        : ['user_id','nama','jabatan','role','email','password','status','created_at'],
  SuratKeluar  : ['surat_id','nomor_surat','jenis_surat','perihal','tanggal','pembuat','file_draft','file_url','status','ttd_kades','tanggal_approve','catatan'],
  SuratMasuk   : ['surat_masuk_id','nomor_surat','asal_surat','tanggal_surat','tanggal_terima','perihal','file_surat','file_url','status','pencatat'],
  Disposisi    : ['disposisi_id','surat_masuk_id','dari','kepada','instruksi','tanggal','status','tanggal_selesai'],
  Tugas        : ['tugas_id','nama_tugas','deskripsi','pemberi_tugas','penerima_tugas','tanggal_mulai','deadline','file_referensi','file_url','status','prioritas'],
  ProgressTugas: ['progress_id','tugas_id','tanggal','progress','keterangan','file_hasil','file_url','status','updater'],
  Kegiatan     : ['kegiatan_id','nama_kegiatan','tanggal','waktu','lokasi','pelaksana','peserta','dokumentasi','file_url','catatan','status'],
  Keuangan     : ['transaksi_id','tanggal','jenis','kategori','sumber_dana','jumlah','keterangan','bukti','file_url','pencatat','status'],
  Dokumen      : ['dokumen_id','nama_dokumen','kategori','deskripsi','file','file_url','tanggal','uploader','tags'],
  Logs         : ['log_id','user_id','nama_user','aktivitas','modul','detail','waktu'],
};

// ─── Spreadsheet + Sheet pool ─────────────────────────────────
let _ss = null;
const _pool = {};

function getSpreadsheet() {
  if (_ss) return _ss;
  const id = getProp('SS_ID');
  if (!id) throw new Error('Belum diinisialisasi. Jalankan initialize() dari editor.');
  _ss = SpreadsheetApp.openById(id);
  return _ss;
}

function getSheet(name) {
  if (_pool[name]) return _pool[name];
  const ss = getSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  _pool[name] = s;
  return s;
}

// ─── Script Properties (batch) ────────────────────────────────
let _props = null;
function getProp(k)    { if(!_props) _props=PropertiesService.getScriptProperties().getProperties(); return _props[k]||null; }
function setProp(k, v) { PropertiesService.getScriptProperties().setProperty(k,v); if(_props) _props[k]=v; }
function setProps(o)   { PropertiesService.getScriptProperties().setProperties(o); if(_props) Object.assign(_props,o); }

// ─── CacheService ─────────────────────────────────────────────
const _sc = CacheService.getScriptCache();
function cGet(k)      { try{const v=_sc.get(k);return v?JSON.parse(v):null;}catch(e){return null;} }
function cSet(k,d,t)  { try{_sc.put(k,JSON.stringify(d),t||CFG.CACHE_S);}catch(e){} }
function cDel(keys)   { try{_sc.removeAll(Array.isArray(keys)?keys:[keys]);}catch(e){} }

// Cache key helper — format 'MOD:ROLE:FILTER'
function ck(mod, role, filter) { return mod+':'+(role||'ALL')+':'+(filter||'ALL'); }

// Delete all cache variants for one module
function cDelMod(mod) {
  const roles=['ADMIN','KEPALA_DESA','SEKRETARIS_DESA','KAUR','KASI','BENDAHARA','ALL'];
  const fils=['ALL','PENDING','APPROVED','REVISI','PEMASUKAN','PENGELUARAN','DITERIMA','DISPOSISI'];
  cDel(roles.flatMap(r => fils.map(f => mod+':'+r+':'+f)));
}

// ─── SESSION (ScriptProperties + CacheService) ────────────────
// NOTE: UserProperties tidak bekerja di GAS Web App "Execute as Me"
// Solusi: simpan session di ScriptProperties (persistent) + CacheService (fast lookup)
function createSession(userId, role, nama) {
  const token  = Utilities.getUuid();
  const expiry = Date.now() + CFG.SESSION_H * 3600000;
  const data   = JSON.stringify({ userId, role, nama, exp: expiry });
  setProp('SES_'+token, data);
  cSet('SES_'+token, { userId, role, nama, exp: expiry }, 21600);
  return token;
}

function getSession(token) {
  if (!token) return null;
  // Coba cache dulu
  let s = cGet('SES_'+token);
  if (s) {
    if (Date.now() > s.exp) { destroySession(token); return null; }
    return s;
  }
  // Fallback ScriptProperties
  const raw = getProp('SES_'+token);
  if (!raw) return null;
  try {
    s = JSON.parse(raw);
    if (Date.now() > s.exp) { destroySession(token); return null; }
    cSet('SES_'+token, s, Math.min(21600, Math.floor((s.exp-Date.now())/1000)));
    return s;
  } catch(e) { return null; }
}

function destroySession(token) {
  cDel(['SES_'+token]);
  try { PropertiesService.getScriptProperties().deleteProperty('SES_'+token); if(_props) delete _props['SES_'+token]; } catch(e) {}
}

function requireAuth(token) {
  const s = getSession(token);
  if (!s) return { error:true, success:false, message:'Session tidak valid. Silakan login kembali.' };
  return s;
}

function requireRole(token, roles) {
  const s = requireAuth(token);
  if (s.error) return s;
  if (roles && !roles.includes(s.role)) return { error:true, success:false, message:'Akses ditolak.' };
  return s;
}

// ─── Log buffer ───────────────────────────────────────────────
const _logBuf = [];
function writeLog(uid, nama, aksi, modul, detail) {
  _logBuf.push([genId('LOG'), uid||'', nama||'', aksi||'', modul||'', detail||'', new Date().toISOString()]);
}
function flushLogs() {
  if (!_logBuf.length) return;
  try { const s=getSheet(SH.LOG); s.getRange(s.getLastRow()+1,1,_logBuf.length,7).setValues(_logBuf); } catch(e) {}
  _logBuf.length = 0;
}

// ─── Sheet reader ─────────────────────────────────────────────
function readSheet(name) {
  const s = getSheet(name);
  const lr = s.getLastRow(), lc = s.getLastColumn();
  if (lr < 2 || lc < 1) return { headers:[], rows:[] };
  const raw  = s.getRange(1,1,lr,lc).getValues();
  const hdrs = raw[0];
  const map  = (row) => { const o={}; hdrs.forEach((h,i)=>o[h]=row[i]); return o; };
  return { headers:hdrs, rows:raw.slice(1).map(map) };
}

// ─── Row finder — returns 1-based sheet row ───────────────────
function findRow(sheetName, colName, value) {
  const s    = getSheet(sheetName);
  const data = s.getDataRange().getValues();
  const ci   = data[0].indexOf(colName);
  if (ci < 0) return { row:-1, headers:data[0], sheet:s };
  for (let i=1; i<data.length; i++) {
    if (String(data[i][ci]).trim() === String(value).trim())
      return { row:i+1, headers:data[0], sheet:s };
  }
  return { row:-1, headers:data[0], sheet:s };
}

function deleteRow(sheetName, colName, value) {
  const { row, sheet } = findRow(sheetName, colName, value);
  if (row < 0) return { success:false, message:'Data tidak ditemukan.' };
  sheet.deleteRow(row);
  return { success:true };
}

// ─── Utilities ────────────────────────────────────────────────
function genId(p) { return p+'-'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).substr(2,4).toUpperCase(); }
function today()  { return new Date().toISOString().slice(0,10); }

// Hash password — SATU salt dipakai selamanya
const SALT = 'SIMADES2024';
function hashPwd(plain) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plain + SALT)
    .map(b => ('0'+(b&0xFF).toString(16)).slice(-2)).join('');
}

// ─── Users ────────────────────────────────────────────────────
function getUsersRaw() {
  const c = cGet('USERS');
  if (c) return c;
  const { rows } = readSheet(SH.USERS);
  cSet('USERS', rows, CFG.CACHE_L);
  return rows;
}

// ─── Drive folder ─────────────────────────────────────────────
function getDriveFolder(name) {
  const id = getProp('DR_'+name.toUpperCase());
  if (!id) throw new Error('Folder belum dibuat: '+name+'. Jalankan initialize().');
  return DriveApp.getFolderById(id);
}

// ─── doGet ────────────────────────────────────────────────────
function doGet() {
  if (!getProp('SS_ID')) initialize();
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('SIMADES – Administrasi Desa')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport','width=device-width,initial-scale=1');
}
function include(f) { return HtmlService.createHtmlOutputFromFile(f).getContent(); }

// ─── INITIALIZE — jalankan 1x dari editor ────────────────────
function initialize() {
  // Spreadsheet
  let ss;
  const eid = getProp('SS_ID');
  if (eid) { try { ss=SpreadsheetApp.openById(eid); _ss=ss; } catch(e) { ss=null; } }
  if (!ss) { ss=SpreadsheetApp.create(CFG.SS_NAME); _ss=ss; setProp('SS_ID',ss.getId()); }

  // Sheets + headers
  const exist = ss.getSheets().map(s=>s.getName());
  Object.entries(HEADERS).forEach(([name,hdrs]) => {
    const s = exist.includes(name) ? ss.getSheetByName(name) : ss.insertSheet(name);
    _pool[name] = s;
    if (!s.getRange(1,1).getValue()) {
      s.getRange(1,1,1,hdrs.length).setValues([hdrs])
        .setBackground('#1e3a8a').setFontColor('#fff').setFontWeight('bold');
      s.setFrozenRows(1);
    }
  });
  const def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  // Drive folders
  const p = {};
  let root;
  const rid = getProp('DR_ROOT');
  try { root = rid ? DriveApp.getFolderById(rid) : null; } catch(e) { root=null; }
  if (!root) { root=DriveApp.createFolder(CFG.APP_NAME); setProp('DR_ROOT',root.getId()); }
  ['SuratKeluar','SuratMasuk','DokumenTugas','DokumentasiKegiatan','BuktiKeuangan','Arsip'].forEach(n=>{
    const k='DR_'+n.toUpperCase();
    if (!getProp(k)) p[k]=root.createFolder(n).getId();
  });
  if (Object.keys(p).length) setProps(p);

  // Seed users
  reseedUsers_(ss);

  Logger.log('SIMADES initialized. SS_ID='+ss.getId());
  Logger.log('Hash test — admin123: '+hashPwd('admin123'));
  return ss.getId();
}

// Internal seed (dipakai initialize + reseedUsers)
function reseedUsers_(ss) {
  const s   = ss ? ss.getSheetByName(SH.USERS) : getSheet(SH.USERS);
  const now = new Date().toISOString();
  // Hanya seed jika belum ada data
  if (s.getLastRow() > 1) return;
  s.getRange(2,1,6,8).setValues([
    ['USR001','Administrator','Administrator','ADMIN','admin@desa.id',hashPwd('admin123'),'AKTIF',now],
    ['USR002','Budi Santoso','Kepala Desa','KEPALA_DESA','kades@desa.id',hashPwd('kades123'),'AKTIF',now],
    ['USR003','Siti Rahayu','Sekretaris Desa','SEKRETARIS_DESA','sekdes@desa.id',hashPwd('sekdes123'),'AKTIF',now],
    ['USR004','Hendra Kurnia','Kaur Umum','KAUR','kaur@desa.id',hashPwd('kaur123'),'AKTIF',now],
    ['USR005','Dewi Lestari','Kasi Pelayanan','KASI','kasi@desa.id',hashPwd('kasi123'),'AKTIF',now],
    ['USR006','Agus Wijaya','Bendahara','BENDAHARA','bendahara@desa.id',hashPwd('bendahara123'),'AKTIF',now],
  ]);
  cDel(['USERS']);
}

// ─── HELPER FUNCTIONS (jalankan dari editor jika ada masalah) ─

// Jalankan ini jika login gagal — hapus semua data user lama, seed ulang
function reseedUsers() {
  const s = getSheet(SH.USERS);
  if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow()-1);
  reseedUsers_(null);
  cDel(['USERS']);
  Logger.log('Users re-seeded. Hash admin123='+hashPwd('admin123'));
}

// Jalankan ini untuk reset password semua user default
function resetPasswords() {
  const s    = getSheet(SH.USERS);
  const data = s.getDataRange().getValues();
  const h    = data[0];
  const ei   = h.indexOf('email'), pi=h.indexOf('password'), si=h.indexOf('status');
  const map  = {'admin@desa.id':'admin123','kades@desa.id':'kades123','sekdes@desa.id':'sekdes123','kaur@desa.id':'kaur123','kasi@desa.id':'kasi123','bendahara@desa.id':'bendahara123'};
  for (let i=1;i<data.length;i++) {
    const em = String(data[i][ei]).trim().toLowerCase();
    if (map[em]) {
      s.getRange(i+1,pi+1).setValue(hashPwd(map[em]));
      s.getRange(i+1,si+1).setValue('AKTIF');
      Logger.log('Reset: '+em);
    }
  }
  cDel(['USERS']);
  Logger.log('Done. Salt='+SALT+' | Hash admin123='+hashPwd('admin123'));
}

// Jalankan ini untuk diagnose masalah login
function debugLogin() {
  const email='admin@desa.id', pwd='admin123';
  const hash = hashPwd(pwd);
  Logger.log('SALT used : '+SALT);
  Logger.log('Hash test : '+hash);
  const {rows} = readSheet(SH.USERS);
  Logger.log('Total users: '+rows.length);
  rows.forEach(u => {
    Logger.log('---');
    Logger.log('email  : ['+u.email+']');
    Logger.log('status : '+u.status);
    Logger.log('stored : '+u.password);
    Logger.log('match  : '+(u.password===hash && String(u.email).trim().toLowerCase()===email));
  });
}

// Jalankan ini untuk test login penuh
function testLogin() {
  const res = login('admin@desa.id','admin123');
  Logger.log(JSON.stringify(res));
}

// Flush semua cache
function flushCache() {
  ['SK','SM','DISP','TGS','KGT','KEU','DOK','DASH'].forEach(m=>cDelMod(m));
  cDel(['USERS']);
  Logger.log('Cache flushed.');
}
