// ============================================================
// SIMADES — File: Modules.gs
// (SuratKeluar, SuratMasuk, Disposisi, Tugas, Progress,
//  Kegiatan, Keuangan, Dokumen, Upload, Reports)
// ============================================================

// ── SURAT KELUAR ─────────────────────────────────────────────
function getSuratKeluar(token, filters) {
  const sess = requireAuth(token); if(sess.error) return sess;
  const fstr = filters&&filters.status ? filters.status : 'ALL';
  const key  = ck('SK',sess.role,fstr);
  let rows   = cGet(key);
  if (!rows) { rows=readSheet(SH.SK).rows; cSet(key,rows,CFG.CACHE_S); }
  let out = rows.slice();
  if (filters&&filters.status) out=out.filter(r=>r.status===filters.status);
  if (['KAUR','KASI'].includes(sess.role)) out=out.filter(r=>r.status==='APPROVED');
  return { success:true, data:out };
}

function createSuratKeluar(token, d) {
  const sess = requireRole(token,['ADMIN','SEKRETARIS_DESA','KAUR']); if(sess.error) return sess;
  const id   = genId('SK');
  const seq  = String(getSheet(SH.SK).getLastRow()).padStart(3,'0');
  const nomor= d.nomor_surat || (seq+'/'+(d.jenis_surat||'UMUM')+'/DESA/'+new Date().getFullYear());
  getSheet(SH.SK).appendRow([id,nomor,d.jenis_surat||'',d.perihal||'',d.tanggal||today(),sess.nama,d.file_draft||'',d.file_url||'','PENDING','','',d.catatan||'']);
  cDelMod('SK'); cDelMod('DASH');
  writeLog(sess.userId,sess.nama,'CREATE','SURAT_KELUAR',id); flushLogs();
  return { success:true, message:'Surat dibuat.', id, nomor_surat:nomor };
}

function approveSuratKeluar(token, suratId, catatan) {
  const sess = requireRole(token,['KEPALA_DESA']); if(sess.error) return sess;
  const {row,headers,sheet} = findRow(SH.SK,'surat_id',suratId);
  if (row<0) return { success:false, message:'Surat tidak ditemukan.' };
  sheet.getRange(row,headers.indexOf('status')+1).setValue('APPROVED');
  sheet.getRange(row,headers.indexOf('ttd_kades')+1).setValue(sess.nama+' – '+today());
  sheet.getRange(row,headers.indexOf('tanggal_approve')+1).setValue(today());
  if (catatan) sheet.getRange(row,headers.indexOf('catatan')+1).setValue(catatan);
  cDelMod('SK'); cDelMod('DASH');
  writeLog(sess.userId,sess.nama,'APPROVE','SURAT_KELUAR',suratId); flushLogs();
  return { success:true, message:'Surat disetujui.' };
}

function rejectSuratKeluar(token, suratId, alasan) {
  const sess = requireRole(token,['KEPALA_DESA','ADMIN']); if(sess.error) return sess;
  const {row,headers,sheet} = findRow(SH.SK,'surat_id',suratId);
  if (row<0) return { success:false, message:'Surat tidak ditemukan.' };
  sheet.getRange(row,headers.indexOf('status')+1).setValue('REVISI');
  sheet.getRange(row,headers.indexOf('catatan')+1).setValue(alasan||'Perlu revisi');
  cDelMod('SK');
  writeLog(sess.userId,sess.nama,'REJECT','SURAT_KELUAR',suratId); flushLogs();
  return { success:true, message:'Surat dikembalikan.' };
}

function deleteSuratKeluar(token, id) {
  const sess = requireRole(token,['ADMIN']); if(sess.error) return sess;
  const res  = deleteRow(SH.SK,'surat_id',id);
  if (res.success) { cDelMod('SK'); cDelMod('DASH'); }
  return res;
}

// ── SURAT MASUK ───────────────────────────────────────────────
function getSuratMasuk(token, filters) {
  const sess = requireAuth(token); if(sess.error) return sess;
  const key  = ck('SM',sess.role,filters&&filters.status?filters.status:'ALL');
  let rows   = cGet(key);
  if (!rows) { rows=readSheet(SH.SM).rows; cSet(key,rows,CFG.CACHE_S); }
  let out = rows.slice();
  if (filters&&filters.status) out=out.filter(r=>r.status===filters.status);
  return { success:true, data:out };
}

function createSuratMasuk(token, d) {
  const sess = requireRole(token,['ADMIN','KAUR','SEKRETARIS_DESA']); if(sess.error) return sess;
  const id   = genId('SM');
  getSheet(SH.SM).appendRow([id,d.nomor_surat||'',d.asal_surat||'',d.tanggal_surat||'',today(),d.perihal||'',d.file_surat||'',d.file_url||'','DITERIMA',sess.nama]);
  cDelMod('SM'); cDelMod('DASH');
  writeLog(sess.userId,sess.nama,'CREATE','SURAT_MASUK',id); flushLogs();
  return { success:true, message:'Surat masuk dicatat.', id };
}

function _smStatus(smId, status) {
  const {row,headers,sheet} = findRow(SH.SM,'surat_masuk_id',smId);
  if (row>0) { sheet.getRange(row,headers.indexOf('status')+1).setValue(status); cDelMod('SM'); }
}

// ── DISPOSISI ─────────────────────────────────────────────────
function getDisposisi(token) {
  const sess = requireAuth(token); if(sess.error) return sess;
  const key  = ck('DISP',sess.role,'ALL');
  let rows   = cGet(key);
  if (!rows) { rows=readSheet(SH.DISP).rows; cSet(key,rows,CFG.CACHE_S); }
  let out = rows.slice();
  if (!['ADMIN','KEPALA_DESA','SEKRETARIS_DESA'].includes(sess.role))
    out=out.filter(r=>r.kepada===sess.nama);
  return { success:true, data:out };
}

function createDisposisi(token, d) {
  const sess = requireRole(token,['KEPALA_DESA','SEKRETARIS_DESA','ADMIN']); if(sess.error) return sess;
  const id   = genId('DSP');
  getSheet(SH.DISP).appendRow([id,d.surat_masuk_id||'',sess.nama,d.kepada||'',d.instruksi||'',today(),'PENDING','']);
  if (d.surat_masuk_id) _smStatus(d.surat_masuk_id,'DISPOSISI');
  cDelMod('DISP');
  writeLog(sess.userId,sess.nama,'CREATE','DISPOSISI',id); flushLogs();
  return { success:true, message:'Disposisi dibuat.', id };
}

function updateDisposisiStatus(token, id, status) {
  const sess = requireAuth(token); if(sess.error) return sess;
  const {row,headers,sheet} = findRow(SH.DISP,'disposisi_id',id);
  if (row<0) return { success:false, message:'Disposisi tidak ditemukan.' };
  sheet.getRange(row,headers.indexOf('status')+1).setValue(status);
  if (status==='SELESAI') sheet.getRange(row,headers.indexOf('tanggal_selesai')+1).setValue(today());
  cDelMod('DISP');
  writeLog(sess.userId,sess.nama,'UPDATE','DISPOSISI',id+'→'+status); flushLogs();
  return { success:true };
}

// ── TUGAS ─────────────────────────────────────────────────────
function getTugas(token, filters) {
  const sess = requireAuth(token); if(sess.error) return sess;
  const key  = ck('TGS',sess.role,'ALL');
  let rows   = cGet(key);
  if (!rows) { rows=readSheet(SH.TUGAS).rows; cSet(key,rows,CFG.CACHE_S); }
  let out = rows.slice();
  if (['KAUR','KASI','BENDAHARA'].includes(sess.role)) out=out.filter(r=>r.penerima_tugas===sess.nama);
  if (filters&&filters.status) out=out.filter(r=>r.status===filters.status);
  return { success:true, data:out };
}

function createTugas(token, d) {
  const sess = requireRole(token,['ADMIN','KEPALA_DESA','SEKRETARIS_DESA']); if(sess.error) return sess;
  const id   = genId('TGS');
  getSheet(SH.TUGAS).appendRow([id,d.nama_tugas||'',d.deskripsi||'',sess.nama,d.penerima_tugas||'',d.tanggal_mulai||today(),d.deadline||'',d.file_referensi||'',d.file_url||'','PENDING',d.prioritas||'NORMAL']);
  cDelMod('TGS'); cDelMod('DASH');
  writeLog(sess.userId,sess.nama,'CREATE','TUGAS',id); flushLogs();
  return { success:true, message:'Tugas dibuat.', id };
}

function _tugasStatus(tugasId, status) {
  const {row,headers,sheet} = findRow(SH.TUGAS,'tugas_id',tugasId);
  if (row>0) { sheet.getRange(row,headers.indexOf('status')+1).setValue(status); cDelMod('TGS'); cDelMod('DASH'); }
}

function deleteTugas(token, id) {
  const sess = requireRole(token,['ADMIN','KEPALA_DESA','SEKRETARIS_DESA']); if(sess.error) return sess;
  const res  = deleteRow(SH.TUGAS,'tugas_id',id);
  if (res.success) { cDelMod('TGS'); cDelMod('DASH'); }
  return res;
}

function addProgressTugas(token, d) {
  const sess = requireAuth(token); if(sess.error) return sess;
  const id   = genId('PRG');
  getSheet(SH.PRG).appendRow([id,d.tugas_id||'',today(),d.progress||0,d.keterangan||'',d.file_hasil||'',d.file_url||'','ON_PROGRESS',sess.nama]);
  const pct = parseInt(d.progress)||0;
  _tugasStatus(d.tugas_id, pct>=100?'SELESAI':pct>0?'ON_PROGRESS':'PENDING');
  writeLog(sess.userId,sess.nama,'PROGRESS','TUGAS',d.tugas_id+'@'+pct+'%'); flushLogs();
  return { success:true, message:'Progress disimpan.', id };
}

// ── KEGIATAN ──────────────────────────────────────────────────
function getKegiatan(token, filters) {
  const sess = requireAuth(token); if(sess.error) return sess;
  const fstr = filters&&filters.month?filters.month:'ALL';
  const key  = ck('KGT',sess.role,fstr);
  let rows   = cGet(key);
  if (!rows) {
    rows = readSheet(SH.KGT).rows.sort((a,b)=>b.tanggal>a.tanggal?1:-1);
    cSet(key,rows,CFG.CACHE_S);
  }
  let out = rows.slice();
  if (filters&&filters.month) out=out.filter(r=>String(r.tanggal).startsWith(filters.month));
  return { success:true, data:out };
}

function createKegiatan(token, d) {
  const sess = requireRole(token,['ADMIN','KEPALA_DESA','SEKRETARIS_DESA','KAUR','KASI']); if(sess.error) return sess;
  const id   = genId('KGT');
  getSheet(SH.KGT).appendRow([id,d.nama_kegiatan||'',d.tanggal||today(),d.waktu||'',d.lokasi||'',d.pelaksana||sess.nama,d.peserta||'',d.dokumentasi||'',d.file_url||'',d.catatan||'','AKTIF']);
  cDelMod('KGT'); cDelMod('DASH');
  writeLog(sess.userId,sess.nama,'CREATE','KEGIATAN',id); flushLogs();
  return { success:true, message:'Kegiatan dicatat.', id };
}

function deleteKegiatan(token, id) {
  const sess = requireRole(token,['ADMIN','KEPALA_DESA']); if(sess.error) return sess;
  const res  = deleteRow(SH.KGT,'kegiatan_id',id);
  if (res.success) { cDelMod('KGT'); cDelMod('DASH'); }
  return res;
}

// ── KEUANGAN ──────────────────────────────────────────────────
function getKeuangan(token, filters) {
  const sess = requireRole(token,['ADMIN','KEPALA_DESA','BENDAHARA']); if(sess.error) return sess;
  const fstr = filters&&filters.jenis?filters.jenis:'ALL';
  const key  = ck('KEU',sess.role,fstr);
  let rows   = cGet(key);
  if (!rows) {
    rows = readSheet(SH.KEU).rows.sort((a,b)=>b.tanggal>a.tanggal?1:-1);
    cSet(key,rows,CFG.CACHE_S);
  }
  let out = rows.slice();
  if (filters&&filters.jenis) out=out.filter(r=>r.jenis===filters.jenis);
  if (filters&&filters.month) out=out.filter(r=>String(r.tanggal).startsWith(filters.month));
  let pin=0,pout=0;
  out.forEach(r=>{ const v=parseFloat(r.jumlah)||0; if(r.jenis==='PEMASUKAN')pin+=v; else pout+=v; });
  return { success:true, data:out, summary:{pemasukan:pin,pengeluaran:pout,saldo:pin-pout} };
}

function createTransaksi(token, d) {
  const sess = requireRole(token,['ADMIN','BENDAHARA']); if(sess.error) return sess;
  const id   = genId('TRX');
  getSheet(SH.KEU).appendRow([id,d.tanggal||today(),d.jenis||'PEMASUKAN',d.kategori||'',d.sumber_dana||'',parseFloat(d.jumlah)||0,d.keterangan||'',d.bukti||'',d.file_url||'',sess.nama,'VALID']);
  cDelMod('KEU'); cDelMod('DASH');
  writeLog(sess.userId,sess.nama,'CREATE','KEUANGAN',id); flushLogs();
  return { success:true, message:'Transaksi dicatat.', id };
}

function deleteTransaksi(token, id) {
  const sess = requireRole(token,['ADMIN','BENDAHARA']); if(sess.error) return sess;
  const res  = deleteRow(SH.KEU,'transaksi_id',id);
  if (res.success) { cDelMod('KEU'); cDelMod('DASH'); }
  return res;
}

// ── DOKUMEN ───────────────────────────────────────────────────
function getDokumen(token, filters) {
  const sess = requireAuth(token); if(sess.error) return sess;
  const fstr = filters&&filters.kategori?filters.kategori:'ALL';
  const key  = ck('DOK',sess.role,fstr);
  let rows   = cGet(key);
  if (!rows) { rows=readSheet(SH.DOK).rows; cSet(key,rows,CFG.CACHE_S); }
  let out = rows.slice();
  if (filters&&filters.kategori) out=out.filter(r=>r.kategori===filters.kategori);
  if (filters&&filters.search) {
    const q=filters.search.toLowerCase();
    out=out.filter(r=>(r.nama_dokumen||'').toLowerCase().includes(q)||(r.tags||'').toLowerCase().includes(q));
  }
  return { success:true, data:out };
}

function createDokumen(token, d) {
  const sess = requireAuth(token); if(sess.error) return sess;
  const id   = genId('DOK');
  getSheet(SH.DOK).appendRow([id,d.nama_dokumen||'',d.kategori||'UMUM',d.deskripsi||'',d.file||'',d.file_url||'',today(),sess.nama,d.tags||'']);
  cDelMod('DOK');
  writeLog(sess.userId,sess.nama,'UPLOAD','ARSIP',d.nama_dokumen); flushLogs();
  return { success:true, message:'Dokumen diarsipkan.', id };
}

function deleteDokumen(token, id) {
  const sess = requireRole(token,['ADMIN']); if(sess.error) return sess;
  const res  = deleteRow(SH.DOK,'dokumen_id',id);
  if (res.success) cDelMod('DOK');
  return res;
}

// ── FILE UPLOAD ───────────────────────────────────────────────
function uploadFile(token, b64, fileName, mimeType, folderName) {
  const sess = requireAuth(token); if(sess.error) return sess;
  try {
    const blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, fileName);
    const file = getDriveFolder(folderName||'Arsip').createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    writeLog(sess.userId,sess.nama,'UPLOAD','FILE',fileName); flushLogs();
    return { success:true, fileId:file.getId(), fileName, fileUrl:'https://drive.google.com/file/d/'+file.getId()+'/view' };
  } catch(e) {
    Logger.log('Upload error: '+e.message);
    return { success:false, message:'Upload gagal: '+e.message };
  }
}

// ── REPORTS ───────────────────────────────────────────────────
function getReportData(token, type, filters) {
  const sess = requireAuth(token); if(sess.error) return sess;
  filters = filters||{};
  switch(type) {
    case 'surat_keluar': return ['ADMIN','KEPALA_DESA','SEKRETARIS_DESA'].includes(sess.role)?getSuratKeluar(token,filters):{success:false,message:'Akses ditolak.'};
    case 'surat_masuk':  return ['ADMIN','KEPALA_DESA','SEKRETARIS_DESA','KAUR'].includes(sess.role)?getSuratMasuk(token,filters):{success:false,message:'Akses ditolak.'};
    case 'tugas':        return getTugas(token,filters);
    case 'kegiatan':     return getKegiatan(token,filters);
    case 'keuangan':     return getKeuangan(token,filters);
    default: return { success:false, message:'Tipe tidak dikenal.' };
  }
}
