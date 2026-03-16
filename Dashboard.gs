// ============================================================
// SIMADES — File: Dashboard.gs
// ============================================================

function getDashboardData(token) {
  const sess = requireAuth(token); if(sess.error) return sess;

  const key    = ck('DASH',sess.role,'ALL');
  const cached = cGet(key);
  if (cached) { cached.user={nama:sess.nama}; return cached; }

  const res = { success:true, role:sess.role, user:{nama:sess.nama}, cards:{}, charts:{} };
  const td  = today();

  try {
    const ss = getSpreadsheet();

    // Surat Keluar
    const skS = ss.getSheetByName(SH.SK);
    if (skS&&skS.getLastRow()>1) {
      const d=skS.getRange(1,1,skS.getLastRow(),skS.getLastColumn()).getValues();
      const h=d[0],si=h.indexOf('status'),ti=h.indexOf('tanggal');
      let pend=0,appr=0; const mo={};
      for(let i=1;i<d.length;i++){const st=d[i][si],m=String(d[i][ti]).slice(0,7);if(st==='PENDING')pend++;if(st==='APPROVED')appr++;mo[m]=(mo[m]||0)+1;}
      res.cards.pending_surat=pend; res.cards.approved_surat=appr; res.cards.total_surat_keluar=skS.getLastRow()-1;
      res.charts.letters_per_month=mo;
    } else { res.cards.pending_surat=0; res.cards.approved_surat=0; res.cards.total_surat_keluar=0; }

    // Surat Masuk
    const smS=ss.getSheetByName(SH.SM);
    res.cards.total_surat_masuk = smS?Math.max(0,smS.getLastRow()-1):0;

    // Tugas
    const tS=ss.getSheetByName(SH.TUGAS);
    if (tS&&tS.getLastRow()>1) {
      const d=tS.getRange(1,1,tS.getLastRow(),tS.getLastColumn()).getValues();
      const si=d[0].indexOf('status');
      let act=0,done=0,pend=0,inprog=0;
      for(let i=1;i<d.length;i++){const st=d[i][si];if(st==='SELESAI')done++;else act++;if(st==='PENDING')pend++;if(st==='ON_PROGRESS')inprog++;}
      res.cards.active_tasks=act; res.cards.completed_tasks=done; res.cards.total_tasks=tS.getLastRow()-1;
      res.charts.task_completion={selesai:done,pending:pend,on_progress:inprog};
    } else { res.cards.active_tasks=0; res.cards.completed_tasks=0; res.cards.total_tasks=0; }

    // Kegiatan
    const kS=ss.getSheetByName(SH.KGT);
    if (kS&&kS.getLastRow()>1) {
      const d=kS.getRange(1,1,kS.getLastRow(),kS.getLastColumn()).getValues();
      const ti=d[0].indexOf('tanggal'); let cnt=0;
      for(let i=1;i<d.length;i++){if(String(d[i][ti]).slice(0,10)===td)cnt++;}
      res.cards.today_activities=cnt; res.cards.total_kegiatan=kS.getLastRow()-1;
    } else { res.cards.today_activities=0; res.cards.total_kegiatan=0; }

    // Keuangan
    if (['ADMIN','KEPALA_DESA','BENDAHARA'].includes(sess.role)) {
      const fS=ss.getSheetByName(SH.KEU);
      if (fS&&fS.getLastRow()>1) {
        const d=fS.getRange(1,1,fS.getLastRow(),fS.getLastColumn()).getValues();
        const h=d[0],ji=h.indexOf('jenis'),ai=h.indexOf('jumlah'),ti=h.indexOf('tanggal');
        const now=new Date(); const fc={};
        for(let x=5;x>=0;x--){const d2=new Date(now.getFullYear(),now.getMonth()-x,1);fc[d2.getFullYear()+'-'+String(d2.getMonth()+1).padStart(2,'0')]={pemasukan:0,pengeluaran:0};}
        let pin=0,pout=0;
        for(let i=1;i<d.length;i++){const j=d[i][ji],a=parseFloat(d[i][ai])||0,m=String(d[i][ti]).slice(0,7);if(j==='PEMASUKAN')pin+=a;else pout+=a;if(fc[m]){if(j==='PEMASUKAN')fc[m].pemasukan+=a;else fc[m].pengeluaran+=a;}}
        res.cards.saldo_kas=pin-pout; res.cards.pemasukan=pin; res.cards.pengeluaran=pout; res.charts.finance=fc;
      } else { res.cards.saldo_kas=0; res.cards.pemasukan=0; res.cards.pengeluaran=0; }
    }

    // Recent logs (admin)
    if (sess.role==='ADMIN') {
      const lS=ss.getSheetByName(SH.LOG);
      if (lS&&lS.getLastRow()>1) {
        const take=Math.min(lS.getLastRow()-1,5);
        const lH=lS.getRange(1,1,1,lS.getLastColumn()).getValues()[0];
        const lD=lS.getRange(lS.getLastRow()-take+1,1,take,lS.getLastColumn()).getValues();
        const map=row=>{const o={};lH.forEach((h,i)=>o[h]=row[i]);return o;};
        res.recent_logs=lD.slice().reverse().map(map);
      }
    }
  } catch(e) { Logger.log('Dashboard error: '+e.message); res.error=e.message; }

  const toCache=JSON.parse(JSON.stringify(res)); delete toCache.user;
  cSet(key,toCache,CFG.CACHE_S);
  return res;
}
