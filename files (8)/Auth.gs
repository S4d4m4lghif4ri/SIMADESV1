// ============================================================
// SIMADES — File: Auth.gs  (Login, logout, user management)
// ============================================================

function login(email, password) {
  try {
    const emailClean = String(email||'').trim().toLowerCase();
    const hashed     = hashPwd(password);
    const users      = getUsersRaw();

    const user = users.find(u =>
      String(u.email||'').trim().toLowerCase() === emailClean &&
      String(u.password||'') === hashed &&
      String(u.status||'') === 'AKTIF'
    );

    if (!user) {
      Logger.log('Login failed: '+emailClean+' | hash='+hashed);
      return { success:false, message:'Email atau password salah, atau akun tidak aktif.' };
    }

    const token = createSession(user.user_id, user.role, user.nama);
    writeLog(user.user_id, user.nama, 'LOGIN', 'AUTH', 'OK');
    flushLogs();

    return {
      success: true,
      token,
      user: {
        id      : user.user_id,
        nama    : user.nama,
        jabatan : user.jabatan,
        role    : user.role,
        email   : user.email,
        access  : ROLE_ACCESS[user.role] || [],
      }
    };
  } catch(e) {
    Logger.log('Login error: '+e.message+'\n'+e.stack);
    return { success:false, message:'Error sistem: '+e.message };
  }
}

function logout(token) {
  destroySession(token);
  return { success:true };
}

function changePassword(token, oldPwd, newPwd) {
  const sess = requireAuth(token);
  if (sess.error) return sess;
  const {row,headers,sheet} = findRow(SH.USERS,'user_id',sess.userId);
  if (row < 0) return { success:false, message:'User tidak ditemukan.' };
  if (sheet.getRange(row,headers.indexOf('password')+1).getValue() !== hashPwd(oldPwd))
    return { success:false, message:'Password lama salah.' };
  sheet.getRange(row,headers.indexOf('password')+1).setValue(hashPwd(newPwd));
  cDel(['USERS']);
  return { success:true, message:'Password berhasil diubah.' };
}

function getUsers(token) {
  const sess = requireRole(token,['ADMIN']); if(sess.error) return sess;
  return { success:true, data: getUsersRaw().map(u=>{ const c={...u}; delete c.password; return c; }) };
}

function createUser(token, d) {
  const sess = requireRole(token,['ADMIN']); if(sess.error) return sess;
  const id   = genId('USR');
  getSheet(SH.USERS).appendRow([id,d.nama,d.jabatan,d.role,d.email,hashPwd(d.password||'password123'),d.status||'AKTIF',new Date().toISOString()]);
  cDel(['USERS']);
  writeLog(sess.userId,sess.nama,'CREATE_USER','PENGATURAN',d.nama); flushLogs();
  return { success:true, message:'User dibuat.', id };
}

function deleteUser(token, userId) {
  const sess = requireRole(token,['ADMIN']); if(sess.error) return sess;
  if (userId===sess.userId) return { success:false, message:'Tidak bisa hapus akun sendiri.' };
  const res = deleteRow(SH.USERS,'user_id',userId);
  if (res.success) cDel(['USERS']);
  return res;
}

function getLogs(token, limit) {
  const sess = requireRole(token,['ADMIN']); if(sess.error) return sess;
  const {rows} = readSheet(SH.LOG);
  return { success:true, data: rows.slice().reverse().slice(0,limit||50) };
}
